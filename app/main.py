from __future__ import annotations

import asyncio
import mimetypes
import time
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, File, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse, JSONResponse

from app.auth import (
    clear_session_cookie,
    is_auth_enabled,
    is_request_authenticated,
    set_session_cookie,
    verify_password,
)
from app.bangumi_service import BangumiService
from app.config import (
    APP_VERSION,
    PLAYWRIGHT_ENABLED,
    RECOMMENDED_RULES,
    STATIC_DIR,
    UPSTREAM_REPO,
    WEB_REPO,
    get_random_ua,
    logger,
    ring_log_handler,
)
from app.danmaku_service import DanmakuService, parse_bilibili_xml_danmaku
from app.rule_engine import (
    CaptchaRequiredError,
    NoResultError,
    RuleCatalogService,
    RuleEngine,
    RuleExecutionError,
    json_to_kazumi_link,
    normalize_episode_url,
    normalize_plugin_dict,
    parse_rule_import_text,
)
from app.storage import store
from app.sync_service import SyncAndTraceService
from app.video_proxy import ProxySession, VideoProxyHandler
from app.video_resolver import CaptchaSessionManager, DualStageVideoResolver, detect_stream_type

bangumi_svc = BangumiService(store)
danmaku_svc = DanmakuService(store)
rule_engine = RuleEngine(store)
rule_catalog = RuleCatalogService(store)
video_resolver = DualStageVideoResolver(store)
captcha_mgr = CaptchaSessionManager(video_resolver)
video_proxy = VideoProxyHandler(store)
sync_trace_svc = SyncAndTraceService(store)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info(
        "Kazumi-web v%s started | rules=%d | playwright=%s | auth=%s",
        APP_VERSION,
        len(store.list_plugins()),
        PLAYWRIGHT_ENABLED,
        is_auth_enabled(),
    )
    yield
    await captcha_mgr.cancel()
    await video_resolver.dispose()


app = FastAPI(title="Kazumi-web", version=APP_VERSION, lifespan=lifespan)

PUBLIC_PATHS = {
    "/",
    "/healthz",
    "/api/health",
    "/api/about",
    "/api/auth/status",
    "/api/auth/login",
    "/api/auth/logout",
    "/favicon.ico",
}


@app.middleware("http")
async def security_and_auth_middleware(request: Request, call_next):
    path = request.url.path
    if is_auth_enabled():
        is_public = path in PUBLIC_PATHS or path.startswith("/assets/")
        if not is_public and not is_request_authenticated(request):
            return JSONResponse(
                {"code": "unauthorized", "message": "需要输入访问口令"},
                status_code=401,
            )
    response: Response = await call_next(request)
    response.headers.setdefault("X-Robots-Tag", "noindex, nofollow")
    return response


def _err(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"code": code, "message": message}, status_code=status)


def _parse_range_param(val: Optional[str], as_float: bool = False) -> Optional[tuple[Optional[Any], Optional[Any]]]:
    if not val or ".." not in val:
        return None
    left, right = val.split("..", 1)
    conv = float if as_float else int
    lo = None
    hi = None
    try:
        if left.strip():
            lo = conv(left.strip())
    except ValueError:
        pass
    try:
        if right.strip():
            hi = conv(right.strip())
    except ValueError:
        pass
    if lo is None and hi is None:
        return None
    return (lo, hi)


async def _resolve_bangumi_for_store(bangumi_id: int, fallback: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    if isinstance(fallback, dict) and fallback.get("id"):
        return fallback
    existing = store.get_collect(bangumi_id)
    if existing and isinstance(existing.get("bangumi"), dict):
        return existing["bangumi"]
    try:
        return await bangumi_svc.detail(bangumi_id)
    except Exception:
        return {"id": bangumi_id, "name": f"番剧 #{bangumi_id}", "nameCn": f"番剧 #{bangumi_id}", "images": {}}


# ============================================================
# Static, Health & Auth
# ============================================================


@app.get("/")
async def index_page():
    return FileResponse(STATIC_DIR / "index.html", media_type="text/html; charset=utf-8")


@app.get("/favicon.ico")
async def favicon():
    icon = STATIC_DIR / "icon-192.png"
    if icon.exists():
        return FileResponse(icon, media_type="image/png")
    return Response(status_code=204)


@app.get("/assets/{filename:path}")
async def serve_asset(filename: str):
    if ".." in filename or filename.startswith("/"):
        return Response(status_code=403)
    target = (STATIC_DIR / filename).resolve()
    if not str(target).startswith(str(STATIC_DIR.resolve())) or not target.is_file():
        return Response(status_code=404)
    mime, _ = mimetypes.guess_type(str(target))
    headers = {}
    if target.suffix.lower() in {".ttf", ".woff2", ".png", ".jpg", ".jpeg", ".webp", ".svg"}:
        headers["Cache-Control"] = "public, max-age=604800"
    elif target.name == "hls.min.js":
        headers["Cache-Control"] = "public, max-age=604800"
    else:
        headers["Cache-Control"] = "no-cache"
    return FileResponse(target, media_type=mime, headers=headers)


@app.get("/healthz")
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
        "playwrightEnabled": PLAYWRIGHT_ENABLED,
        "authEnabled": is_auth_enabled(),
        "rulesCount": len(store.list_plugins()),
    }


@app.get("/api/about")
async def about():
    return {
        "version": APP_VERSION,
        "repository": WEB_REPO,
        "upstream": UPSTREAM_REPO,
        "playwrightEnabled": PLAYWRIGHT_ENABLED,
        "authEnabled": is_auth_enabled(),
        "rulesCount": len(store.list_plugins()),
    }


@app.get("/api/auth/status")
async def auth_status(request: Request):
    return {
        "authEnabled": is_auth_enabled(),
        "authenticated": is_request_authenticated(request),
    }


@app.post("/api/auth/login")
async def auth_login(request: Request):
    try:
        body = await request.json()
    except Exception:
        return _err(400, "invalid_body", "请求格式错误")
    password = str(body.get("password") or "")
    if not verify_password(password):
        return _err(401, "invalid_password", "访问口令不正确")
    resp = JSONResponse({"ok": True})
    set_session_cookie(resp, request)
    return resp


@app.post("/api/auth/logout")
async def auth_logout():
    resp = JSONResponse({"ok": True})
    clear_session_cookie(resp)
    return resp


# ============================================================
# Bangumi Public Data & Account Sync
# ============================================================


@app.get("/api/popular")
async def api_popular(tag: str = "", offset: int = 0, limit: int = 24):
    try:
        return await bangumi_svc.popular(tag=tag.strip(), offset=max(0, offset), limit=min(50, max(1, limit)))
    except Exception as exc:
        logger.warning("popular failed: %s", exc)
        return _err(502, "bangumi_failed", f"Bangumi 热门加载失败：{exc}")


@app.get("/api/timeline")
async def api_timeline(season: str = ""):
    try:
        return await bangumi_svc.timeline(season=season.strip())
    except Exception as exc:
        logger.warning("timeline failed: %s", exc)
        return _err(502, "bangumi_failed", f"时间表加载失败：{exc}")


@app.get("/api/bangumi/search")
async def api_bangumi_search(
    keyword: str = "",
    offset: int = 0,
    sort: str = "heat",
    tag: Optional[list[str]] = Query(default=None),
    airDate: Optional[str] = None,
    rank: Optional[str] = None,
    score: Optional[str] = None,
    weekday: Optional[str] = None,
):
    air_tuple = None
    if airDate and ".." in airDate:
        s, e = airDate.split("..", 1)
        if s.strip() and e.strip():
            air_tuple = (s.strip(), e.strip())
    weekdays = []
    if weekday:
        for w in weekday.split(","):
            try:
                weekdays.append(int(w.strip()))
            except ValueError:
                pass
    try:
        return await bangumi_svc.search(
            keyword=keyword.strip(),
            offset=max(0, offset),
            sort=sort if sort in {"heat", "rank", "score", "match"} else "heat",
            tags=[t.strip() for t in (tag or []) if t.strip()],
            air_date=air_tuple,
            rank_range=_parse_range_param(rank, as_float=False),
            score_range=_parse_range_param(score, as_float=True),
            weekdays=weekdays,
        )
    except Exception as exc:
        logger.warning("bangumi search failed: %s", exc)
        return _err(502, "bangumi_failed", f"搜索失败：{exc}")


@app.get("/api/bangumi/character/{character_id}")
async def api_bangumi_character(character_id: int):
    try:
        return await bangumi_svc.character(character_id)
    except Exception as exc:
        return _err(502, "bangumi_failed", f"角色资料加载失败：{exc}")


@app.get("/api/bangumi/{subject_id}")
async def api_bangumi_detail(subject_id: int):
    try:
        return await bangumi_svc.detail(subject_id)
    except Exception as exc:
        return _err(502, "bangumi_failed", f"番剧详情加载失败：{exc}")


@app.get("/api/bangumi/{subject_id}/characters")
async def api_bangumi_characters(subject_id: int):
    try:
        return await bangumi_svc.characters(subject_id)
    except Exception as exc:
        return _err(502, "bangumi_failed", f"角色列表加载失败：{exc}")


@app.get("/api/bangumi/{subject_id}/comments")
async def api_bangumi_comments(subject_id: int, offset: int = 0):
    try:
        return await bangumi_svc.comments(subject_id, offset=max(0, offset))
    except Exception as exc:
        return _err(502, "bangumi_failed", f"吐槽获取失败：{exc}")


@app.get("/api/bangumi/{subject_id}/staff")
async def api_bangumi_staff(subject_id: int):
    try:
        return await bangumi_svc.staff(subject_id)
    except Exception as exc:
        return _err(502, "bangumi_failed", f"制作人员加载失败：{exc}")


@app.get("/api/bangumi/{subject_id}/relations")
async def api_bangumi_relations(subject_id: int):
    try:
        return await bangumi_svc.relations(subject_id)
    except Exception as exc:
        return _err(502, "bangumi_failed", f"关联条目加载失败：{exc}")


@app.get("/api/bangumi/{subject_id}/episodes")
async def api_bangumi_episodes(subject_id: int):
    try:
        return await bangumi_svc.episodes(subject_id)
    except Exception as exc:
        return _err(502, "bangumi_failed", f"剧集列表加载失败：{exc}")


@app.get("/api/bangumi/{subject_id}/episode-comments")
async def api_bangumi_ep_comments(subject_id: int, episode: int = 1):
    try:
        return await bangumi_svc.episode_comments(subject_id, max(1, episode))
    except Exception as exc:
        return _err(502, "bangumi_failed", f"分集评论加载失败：{exc}")


@app.post("/api/bangumi/account/verify")
async def api_bangumi_verify(request: Request):
    body = await request.json()
    token = str(body.get("token") or "").strip()
    if not token:
        return _err(400, "token_required", "请填写 Bangumi Access Token")
    try:
        me = await bangumi_svc.get_me(token)
        username = str(me.get("username") or "")
        store.update_settings({"bangumiToken": token, "bangumiUsername": username})
        return {
            "ok": True,
            "user": {
                "id": me.get("id"),
                "username": username,
                "nickname": me.get("nickname") or username,
                "avatar": (me.get("avatar") or {}).get("medium") or "",
            },
        }
    except Exception as exc:
        return _err(401, "invalid_token", f"Bangumi Token 验证失败：{exc}")


@app.post("/api/bangumi/account/pull")
async def api_bangumi_pull(request: Request):
    body = await request.json()
    s = store.get_settings()
    token = str(body.get("token") or s.get("bangumiToken") or "").strip()
    username = str(body.get("username") or s.get("bangumiUsername") or "").strip()
    if not token:
        return _err(400, "token_required", "请先配置 Bangumi Access Token")
    try:
        if not username:
            me = await bangumi_svc.get_me(token)
            username = str(me.get("username") or "")
            store.update_settings({"bangumiToken": token, "bangumiUsername": username})
        items = await bangumi_svc.pull_user_collections(token, username)
        for item in items:
            store.put_collect(item["bangumiId"], item["type"], item["bangumi"])
        return {"ok": True, "count": len(items), "items": items}
    except Exception as exc:
        return _err(502, "bangumi_sync_failed", f"拉取 Bangumi 收藏失败：{exc}")


@app.post("/api/bangumi/account/push")
async def api_bangumi_push(request: Request):
    body = await request.json()
    s = store.get_settings()
    token = str(body.get("token") or s.get("bangumiToken") or "").strip()
    if not token:
        return _err(400, "token_required", "请先配置 Bangumi Access Token")
    subject_id = int(body.get("bangumiId") or 0)
    collect_type = int(body.get("type") or 0)
    rate = body.get("rate")
    comment = body.get("comment")
    if not subject_id or not collect_type:
        return _err(400, "invalid_params", "bangumiId 和 type 为必填")
    try:
        await bangumi_svc.push_collection(
            token,
            subject_id,
            collect_type,
            rate=int(rate) if rate is not None else None,
            comment=str(comment) if comment is not None else None,
        )
        return {"ok": True}
    except Exception as exc:
        return _err(502, "bangumi_sync_failed", f"同步到 Bangumi 失败：{exc}")


# ============================================================
# Rules Management, Editor, Tester & Search/Episodes/Resolve
# ============================================================


@app.get("/api/plugins")
async def api_list_plugins(full: bool = False):
    plugins = store.list_plugins()
    if full:
        return plugins
    return [
        {
            "name": p.get("name", ""),
            "version": p.get("version", ""),
            "baseUrl": p.get("baseURL", ""),
            "baseURL": p.get("baseURL", ""),
            "searchMode": p.get("searchMode", "xpath"),
            "chapterMode": p.get("chapterMode", "xpath"),
            "useNativePlayer": bool(p.get("useNativePlayer", True)),
            "useLegacyParser": bool(p.get("useLegacyParser", False)),
            "adBlocker": bool(p.get("adBlocker", False)),
            "muliSources": bool(p.get("muliSources", True)),
            "antiCrawlerEnabled": bool((p.get("antiCrawlerConfig") or {}).get("enabled")),
        }
        for p in plugins
    ]


@app.get("/api/plugins/{name}")
async def api_get_plugin(name: str):
    p = store.find_plugin(name)
    if not p:
        return _err(404, "plugin_not_found", f"未找到规则 {name}")
    return {"plugin": p, "shareLink": json_to_kazumi_link(p)}


@app.put("/api/plugins")
async def api_save_plugin(request: Request):
    try:
        body = await request.json()
        raw = body.get("plugin") if isinstance(body, dict) and isinstance(body.get("plugin"), dict) else body
        normalized = normalize_plugin_dict(raw)
        saved = store.upsert_plugin(normalized)
        return {"ok": True, "plugin": saved, "shareLink": json_to_kazumi_link(saved)}
    except Exception as exc:
        return _err(400, "invalid_rule", str(exc))


@app.post("/api/plugins/reorder")
async def api_reorder_plugins(request: Request):
    body = await request.json()
    names = body.get("names")
    if not isinstance(names, list):
        return _err(400, "invalid_params", "names 必须是数组")
    reordered = store.reorder_plugins([str(x) for x in names])
    return {"ok": True, "count": len(reordered)}


@app.get("/api/rules/catalog")
async def api_rules_catalog(force: bool = False):
    try:
        catalog = await rule_catalog.fetch_catalog(force=force)
        installed = {p.get("name", ""): p.get("version", "") for p in store.list_plugins()}
        for item in catalog:
            n = item.get("name", "")
            item["installed"] = n in installed
            item["installedVersion"] = installed.get(n)
        return {"items": catalog, "recommended": RECOMMENDED_RULES}
    except Exception as exc:
        return _err(502, "catalog_failed", f"规则仓库暂时不可用：{exc}")


@app.post("/api/rules/install")
async def api_rules_install(request: Request):
    body = await request.json()
    name = str(body.get("name") or "").strip()
    if not name:
        return _err(400, "invalid_params", "name 不能为空")
    try:
        plugin = await rule_catalog.install_from_shop(name)
        return {"ok": True, "name": plugin["name"], "version": plugin["version"], "plugin": plugin}
    except Exception as exc:
        return _err(502, "install_failed", f"规则 {name} 安装失败：{exc}")


@app.post("/api/rules/install-recommended")
async def api_rules_install_recommended():
    installed = []
    failed = []
    for name in RECOMMENDED_RULES:
        try:
            p = await rule_catalog.install_from_shop(name)
            installed.append(p)
        except Exception as exc:
            failed.append({"name": name, "error": str(exc)})
    return {"ok": True, "installed": len(installed), "plugins": installed, "failed": failed}


@app.post("/api/rules/import")
async def api_rules_import(request: Request):
    try:
        body = await request.json()
    except Exception:
        return _err(400, "invalid_body", "请求体必须是 JSON")
    try:
        if isinstance(body.get("json"), dict):
            normalized = normalize_plugin_dict(body["json"])
            saved = store.upsert_plugin(normalized)
            return {"ok": True, "count": 1, "name": saved["name"], "version": saved["version"], "plugins": [saved]}
        if isinstance(body.get("url"), str) and body["url"].strip():
            plugins = await rule_catalog.import_from_url(body["url"].strip())
            return {"ok": True, "count": len(plugins), "plugins": plugins}
        if isinstance(body.get("text"), str) and body["text"].strip():
            plugins, failures = parse_rule_import_text(body["text"])
            if not plugins:
                return _err(400, "invalid_rule", "; ".join(failures) or "未识别到有效规则")
            store.upsert_plugins(plugins)
            return {"ok": True, "count": len(plugins), "plugins": plugins, "failures": failures}
        return _err(400, "invalid_params", "请提供 json、url 或 text")
    except ValueError as exc:
        return _err(400, "invalid_rule", str(exc))
    except Exception as exc:
        return _err(502, "import_failed", f"规则导入失败：{exc}")


@app.delete("/api/rules/{name}")
async def api_rules_remove(name: str):
    if not store.remove_plugin(name):
        return _err(404, "rule_not_found", "未找到该规则")
    return {"ok": True}


@app.post("/api/rules/test/search")
async def api_rules_test_search(request: Request):
    body = await request.json()
    raw_plugin = body.get("plugin")
    keyword = str(body.get("keyword") or "").strip()
    if not isinstance(raw_plugin, dict) or not keyword:
        return _err(400, "invalid_params", "plugin 和 keyword 不能为空")
    try:
        trace = await rule_engine.trace_search(raw_plugin, keyword)
        return {
            "ok": True,
            "pluginName": trace.plugin_name,
            "requestUrl": trace.request_url,
            "statusCode": trace.status_code,
            "items": trace.items,
            "diagnostics": trace.diagnostics,
            "rawPreview": trace.raw_preview,
        }
    except CaptchaRequiredError as exc:
        return _err(423, "captcha_required", str(exc))
    except Exception as exc:
        return _err(502, "test_failed", str(exc))


@app.post("/api/rules/test/chapters")
async def api_rules_test_chapters(request: Request):
    body = await request.json()
    raw_plugin = body.get("plugin")
    source = str(body.get("src") or "").strip()
    if not isinstance(raw_plugin, dict) or not source:
        return _err(400, "invalid_params", "plugin 和 src 不能为空")
    try:
        trace = await rule_engine.trace_chapters(raw_plugin, source)
        return {
            "ok": True,
            "pluginName": trace.plugin_name,
            "requestUrl": trace.request_url,
            "statusCode": trace.status_code,
            "roads": trace.roads,
            "diagnostics": trace.diagnostics,
            "rawPreview": trace.raw_preview,
        }
    except Exception as exc:
        return _err(502, "test_failed", str(exc))


@app.post("/api/rules/test/resolve")
async def api_rules_test_resolve(request: Request):
    body = await request.json()
    raw_plugin = body.get("plugin")
    ep_url = str(body.get("episodeUrl") or "").strip()
    if not isinstance(raw_plugin, dict) or not ep_url:
        return _err(400, "invalid_params", "plugin 和 episodeUrl 不能为空")
    try:
        p = normalize_plugin_dict(raw_plugin)
        full_url = normalize_episode_url(str(p.get("baseURL") or ""), ep_url)
        resolved = await video_resolver.resolve(p, full_url)
        session = ProxySession(
            original_url=resolved.url,
            referer=str(p.get("referer") or resolved.referer or ""),
            user_agent=str(p.get("userAgent") or resolved.user_agent or get_random_ua()),
            plugin_name=p["name"],
            ad_blocker=bool(p.get("adBlocker", True)),
            created_at=time.monotonic(),
        )
        token = video_proxy.sessions.register(session)
        return {
            "ok": True,
            "token": token,
            "playUrl": video_proxy.build_root_url(token),
            "originalUrl": session.original_url,
            "pluginName": session.plugin_name,
            "streamType": detect_stream_type(session.original_url),
            "resolveMethod": resolved.method,
        }
    except TimeoutError as exc:
        return _err(504, "resolve_timeout", str(exc))
    except Exception as exc:
        return _err(502, "resolve_failed", str(exc))


@app.get("/api/search")
async def api_plugin_search(plugin: str = "", keyword: str = ""):
    plugin_name = plugin.strip()
    kw = keyword.strip()
    if not kw or not plugin_name:
        return _err(400, "invalid_params", "plugin 和 keyword 均为必填")
    p = store.find_plugin(plugin_name)
    if not p:
        return _err(404, "plugin_not_found", f"未找到规则 {plugin_name}")
    try:
        trace = await rule_engine.trace_search(p, kw)
        return {"pluginName": trace.plugin_name, "items": trace.items}
    except CaptchaRequiredError as exc:
        return _err(423, "captcha_required", str(exc))
    except NoResultError:
        return {"pluginName": p["name"], "items": []}
    except RuleExecutionError as exc:
        logger.warning("Search failed for [%s]: %s", plugin_name, exc)
        return _err(502, "search_failed", str(exc))
    except Exception as exc:
        logger.exception("Search unexpected error for [%s]", plugin_name)
        return _err(500, "internal_error", str(exc))


@app.get("/api/episodes")
async def api_plugin_episodes(plugin: str = "", src: str = ""):
    plugin_name = plugin.strip()
    source = src.strip()
    if not plugin_name or not source:
        return _err(400, "invalid_params", "plugin 和 src 均为必填")
    p = store.find_plugin(plugin_name)
    if not p:
        return _err(404, "plugin_not_found", f"未找到规则 {plugin_name}")
    try:
        trace = await rule_engine.trace_chapters(p, source)
        return {"pluginName": trace.plugin_name, "roads": trace.roads}
    except RuleExecutionError as exc:
        logger.warning("Episodes failed for [%s]: %s", plugin_name, exc)
        return _err(502, "chapter_failed", str(exc))
    except Exception as exc:
        logger.exception("Episodes unexpected error for [%s]", plugin_name)
        return _err(500, "internal_error", str(exc))


@app.get("/api/resolve")
async def api_resolve_video(plugin: str = "", episodeUrl: str = ""):
    plugin_name = plugin.strip()
    ep_url = episodeUrl.strip()
    if not plugin_name or not ep_url:
        return _err(400, "invalid_params", "plugin 和 episodeUrl 均为必填")
    p = store.find_plugin(plugin_name)
    if not p:
        return _err(404, "plugin_not_found", f"未找到规则 {plugin_name}")
    full_url = normalize_episode_url(str(p.get("baseURL") or ""), ep_url)
    try:
        resolved = await video_resolver.resolve(p, full_url)
        session = ProxySession(
            original_url=resolved.url,
            referer=str(p.get("referer") or resolved.referer or ""),
            user_agent=str(p.get("userAgent") or resolved.user_agent or get_random_ua()),
            plugin_name=p["name"],
            ad_blocker=bool(p.get("adBlocker", True)),
            created_at=time.monotonic(),
        )
        token = video_proxy.sessions.register(session)
        return {
            "token": token,
            "playUrl": video_proxy.build_root_url(token),
            "originalUrl": session.original_url,
            "pluginName": session.plugin_name,
            "streamType": detect_stream_type(session.original_url),
            "resolveMethod": resolved.method,
        }
    except TimeoutError as exc:
        return _err(504, "resolve_timeout", str(exc))
    except Exception as exc:
        logger.warning("Resolve failed for [%s] %s: %s", plugin_name, full_url, exc)
        return _err(502, "resolve_failed", str(exc))


# ============================================================
# Captcha Verification
# ============================================================


@app.post("/api/captcha/start")
async def api_captcha_start(request: Request):
    body = await request.json()
    plugin_name = str(body.get("plugin") or "").strip()
    keyword = str(body.get("keyword") or "").strip()
    p = store.find_plugin(plugin_name)
    if not p:
        return _err(404, "plugin_not_found", f"未找到规则 {plugin_name}")
    try:
        return await captcha_mgr.start(p, keyword)
    except Exception as exc:
        await captcha_mgr.cancel()
        return _err(500, "captcha_failed", str(exc))


@app.post("/api/captcha/submit")
async def api_captcha_submit(request: Request):
    body = await request.json()
    plugin_name = str(body.get("plugin") or "").strip()
    code = str(body.get("code") or "").strip()
    if not plugin_name or not code:
        return _err(400, "invalid_params", "plugin 和 code 不能为空")
    try:
        ok = await captcha_mgr.submit(plugin_name, code)
        return {"ok": ok}
    except Exception as exc:
        return _err(500, "captcha_failed", str(exc))


@app.post("/api/captcha/cancel")
async def api_captcha_cancel():
    await captcha_mgr.cancel()
    return {"ok": True}


# ============================================================
# Danmaku
# ============================================================


@app.get("/api/danmaku")
async def api_danmaku(bangumiId: int = 0, episode: int = 1):
    if bangumiId <= 0:
        return _err(400, "invalid_params", "bangumiId 必须为正整数")
    try:
        return await danmaku_svc.get_danmaku_by_bgm(bangumiId, max(1, episode))
    except PermissionError as exc:
        return _err(403, "dandan_auth_required", str(exc))
    except Exception as exc:
        return _err(502, "danmaku_failed", f"弹幕获取失败：{exc}")


@app.get("/api/danmaku/search")
async def api_danmaku_search(keyword: str = ""):
    kw = keyword.strip()
    if not kw:
        return _err(400, "invalid_params", "keyword 不能为空")
    try:
        items = await danmaku_svc.search_animes(kw)
        return {"items": items}
    except PermissionError as exc:
        return _err(403, "dandan_auth_required", str(exc))
    except Exception as exc:
        return _err(502, "danmaku_failed", f"弹幕源检索失败：{exc}")


@app.get("/api/danmaku/episodes")
async def api_danmaku_episodes(animeId: int = 0):
    if animeId <= 0:
        return _err(400, "invalid_params", "animeId 无效")
    try:
        return await danmaku_svc.get_episodes(animeId)
    except PermissionError as exc:
        return _err(403, "dandan_auth_required", str(exc))
    except Exception as exc:
        return _err(502, "danmaku_failed", f"获取分集失败：{exc}")


@app.get("/api/danmaku/episode")
async def api_danmaku_by_episode(episodeId: int = 0):
    if episodeId <= 0:
        return _err(400, "invalid_params", "episodeId 无效")
    try:
        items = await danmaku_svc.get_comments_by_episode_id(episodeId)
        return {"episodeId": episodeId, "items": items}
    except PermissionError as exc:
        return _err(403, "dandan_auth_required", str(exc))
    except Exception as exc:
        return _err(502, "danmaku_failed", f"弹幕加载失败：{exc}")


@app.post("/api/danmaku/parse-xml")
async def api_danmaku_parse_xml(request: Request):
    raw = (await request.body()).decode("utf-8", errors="ignore")
    try:
        items = parse_bilibili_xml_danmaku(raw)
        return {"ok": True, "count": len(items), "items": items}
    except Exception as exc:
        return _err(400, "invalid_xml", f"XML 弹幕解析失败：{exc}")


@app.get("/api/danmaku/shields")
async def api_get_shields():
    return {"items": store.get_shields()}


@app.put("/api/danmaku/shields")
async def api_put_shields(request: Request):
    body = await request.json()
    items = body.get("items")
    if not isinstance(items, list):
        return _err(400, "invalid_params", "items 必须是数组")
    return {"items": store.set_shields(items)}


# ============================================================
# Collect & History
# ============================================================


@app.get("/api/collect")
async def api_get_collect(bangumiId: int = 0):
    entry = store.get_collect(bangumiId)
    return {
        "bangumiId": bangumiId,
        "type": entry.get("type", 0) if entry else 0,
        "time": entry.get("time") if entry else None,
    }


@app.get("/api/collect/list")
async def api_list_collect(type: Optional[int] = None):
    return {"items": store.list_collects(filter_type=type)}


@app.put("/api/collect")
async def api_put_collect(request: Request):
    body = await request.json()
    bangumi_id = int(body.get("bangumiId") or 0)
    ctype = int(body.get("type") or 0)
    if bangumi_id <= 0:
        return _err(400, "invalid_params", "bangumiId 无效")
    if ctype == 0:
        store.delete_collect(bangumi_id)
        return {"ok": True, "type": 0}
    bgm_obj = await _resolve_bangumi_for_store(bangumi_id, body.get("bangumi"))
    saved = store.put_collect(bangumi_id, ctype, bgm_obj)
    # Optional background sync to Bangumi account if auto-sync enabled
    s = store.get_settings()
    if s.get("bangumiAutoSync") and s.get("bangumiToken"):
        asyncio.create_task(
            bangumi_svc.push_collection(str(s["bangumiToken"]), bangumi_id, ctype)
        )
    return {"ok": True, "type": saved["type"], "record": saved}


@app.delete("/api/collect")
async def api_delete_collect(bangumiId: int = 0):
    store.delete_collect(bangumiId)
    return {"ok": True}


@app.get("/api/history")
async def api_get_history(bangumiId: int = 0, pluginName: str = ""):
    return {"history": store.get_history(pluginName.strip(), bangumiId)}


@app.get("/api/history/list")
async def api_list_history(device: Optional[str] = None):
    return {"items": store.list_histories(device=device.strip() if device else None)}


@app.post("/api/history/progress")
async def api_update_progress(request: Request):
    body = await request.json()
    bangumi_id = int(body.get("bangumiId") or 0)
    plugin_name = str(body.get("pluginName") or "").strip()
    episode = int(body.get("episode") or 0)
    road = int(body.get("road") or 0)
    progress_ms = int(body.get("progressMs") or 0)
    if bangumi_id <= 0 or not plugin_name or episode <= 0:
        return _err(400, "invalid_params", "缺少必要进度参数")
    bgm_obj = await _resolve_bangumi_for_store(bangumi_id, body.get("bangumi"))
    rec = store.update_progress(
        bangumi_id=bangumi_id,
        plugin_name=plugin_name,
        episode=episode,
        road=road,
        progress_ms=progress_ms,
        last_src=str(body.get("lastSrc") or ""),
        episode_name=str(body.get("episodeName") or ""),
        bangumi=bgm_obj,
        device_id=str(body.get("deviceId") or "").strip() or None,
        src=str(body.get("src") or ""),
    )
    return {"ok": True, "history": rec}


@app.delete("/api/history/all")
async def api_clear_history():
    store.clear_histories()
    return {"ok": True}


@app.delete("/api/history")
async def api_delete_history(bangumiId: int = 0, pluginName: str = ""):
    store.delete_history(pluginName.strip(), bangumiId)
    return {"ok": True}


# ============================================================
# Trace.moe Image Search
# ============================================================


@app.post("/api/trace/upload")
async def api_trace_upload(file: UploadFile = File(...)):
    content = await file.read()
    if not content:
        return _err(400, "empty_file", "上传图片为空")
    if len(content) > 15 * 1024 * 1024:
        return _err(413, "file_too_large", "图片大小不能超过 15MB")
    try:
        return await sync_trace_svc.search_image_bytes(content, file.content_type or "image/jpeg")
    except Exception as exc:
        return _err(502, "trace_failed", f"以图搜番失败：{exc}")


@app.post("/api/trace/url")
async def api_trace_url(request: Request):
    body = await request.json()
    url = str(body.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return _err(400, "invalid_url", "请输入有效的图片 URL")
    try:
        return await sync_trace_svc.search_image_url(url)
    except Exception as exc:
        return _err(502, "trace_failed", f"以图搜番失败：{exc}")


# ============================================================
# Sync, Backup, WebDAV, Settings & Logs
# ============================================================


@app.post("/api/sync/hydrate")
async def api_sync_hydrate(request: Request):
    body = await request.json()
    overwrite = bool(body.get("overwrite", False))
    res = store.hydrate_from_client(body, overwrite=overwrite)
    return {"ok": True, **res}


@app.get("/api/sync/export")
async def api_sync_export():
    return store.export_backup()


@app.post("/api/sync/import")
async def api_sync_import(request: Request):
    body = await request.json()
    res = store.hydrate_from_client(body, overwrite=bool(body.get("overwrite", True)))
    return {"ok": True, **res}


@app.post("/api/webdav/test")
async def api_webdav_test(request: Request):
    body = await request.json()
    try:
        return await sync_trace_svc.webdav_test(
            str(body.get("url") or ""),
            str(body.get("username") or ""),
            str(body.get("password") or ""),
            str(body.get("path") or "/kazumiSync"),
        )
    except Exception as exc:
        return _err(502, "webdav_failed", str(exc))


@app.post("/api/webdav/upload")
async def api_webdav_upload(request: Request):
    body = await request.json()
    payload = body.get("backup") if isinstance(body.get("backup"), dict) else store.export_backup()
    try:
        return await sync_trace_svc.webdav_upload(
            str(body.get("url") or ""),
            str(body.get("username") or ""),
            str(body.get("password") or ""),
            str(body.get("path") or "/kazumiSync"),
            payload,
        )
    except Exception as exc:
        return _err(502, "webdav_failed", str(exc))


@app.post("/api/webdav/download")
async def api_webdav_download(request: Request):
    body = await request.json()
    try:
        backup = await sync_trace_svc.webdav_download(
            str(body.get("url") or ""),
            str(body.get("username") or ""),
            str(body.get("password") or ""),
            str(body.get("path") or "/kazumiSync"),
        )
        res = store.hydrate_from_client(backup, overwrite=False)
        return {"ok": True, "backup": backup, **res}
    except Exception as exc:
        return _err(502, "webdav_failed", str(exc))


@app.get("/api/settings")
async def api_get_settings():
    return store.get_public_settings()


@app.put("/api/settings")
async def api_put_settings(request: Request):
    body = await request.json()
    if not isinstance(body, dict):
        return _err(400, "invalid_body", "请求体必须是 JSON")
    return store.update_settings(body)


@app.get("/api/logs")
async def api_get_logs():
    return {"items": ring_log_handler.get_logs()}


@app.delete("/api/logs")
async def api_clear_logs():
    ring_log_handler.clear()
    return {"ok": True}


# ============================================================
# Video Proxy (HLS m3u8 Rewrite + Ad Filter + MP4 Range Stream)
# ============================================================


@app.api_route("/proxy/{token}", methods=["GET", "HEAD", "OPTIONS"])
async def proxy_root(request: Request, token: str):
    if request.method == "OPTIONS":
        return Response(status_code=204)
    return await video_proxy.handle(request, token)


@app.api_route("/proxy/{token}/{sub_path:path}", methods=["GET", "HEAD", "OPTIONS"])
async def proxy_sub(request: Request, token: str, sub_path: str):
    if request.method == "OPTIONS":
        return Response(status_code=204)
    return await video_proxy.handle(request, token, sub_path)
