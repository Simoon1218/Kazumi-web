from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import parse_qsl, quote, unquote, urlencode, urljoin, urlparse, urlunparse

import httpx
from lxml import html as lxml_html

from app.config import (
    API_LEVEL,
    OFFICIAL_RULE_REPO,
    RULE_REPO_MIRRORS,
    get_random_accept_language,
    get_random_ua,
    logger,
)
from app.storage import RuntimeStore, plugin_name_key


# ============================================================
# Custom Exceptions (aligned with Predidit/Kazumi)
# ============================================================


class CaptchaRequiredError(Exception):
    def __init__(self, plugin_name: str) -> None:
        super().__init__(f"{plugin_name} 需要完成人机验证")
        self.plugin_name = plugin_name


class NoResultError(Exception):
    def __init__(self, plugin_name: str) -> None:
        super().__init__(f"{plugin_name} 没有匹配结果")
        self.plugin_name = plugin_name


class RuleExecutionError(Exception):
    def __init__(self, plugin_name: str, message: str) -> None:
        super().__init__(message)
        self.plugin_name = plugin_name


# ============================================================
# URL Normalization & kazumi:// Share Link Codec
# ============================================================


def normalize_episode_url(base_url: str, raw: str) -> str:
    """Exact port of Predidit/Kazumi lib/utils/episode_url.dart."""
    trimmed = (raw or "").strip()
    if not trimmed:
        return ""
    base = (base_url or "").strip()
    base_parsed = urlparse(base) if base else None
    has_valid_base = bool(base_parsed and base_parsed.scheme in {"http", "https"} and base_parsed.netloc)

    raw_parsed = urlparse(trimmed)
    if raw_parsed.scheme in {"http", "https"} and raw_parsed.netloc:
        resolved = raw_parsed
    elif has_valid_base:
        resolved = urlparse(urljoin(base, trimmed))
    else:
        return trimmed

    if not resolved.netloc:
        return trimmed

    scheme = resolved.scheme
    if (
        has_valid_base
        and base_parsed is not None
        and scheme in {"http", "https"}
        and base_parsed.scheme in {"http", "https"}
        and resolved.netloc == base_parsed.netloc
        and scheme != base_parsed.scheme
    ):
        scheme = base_parsed.scheme

    path = resolved.path or ""
    # Only strip trailing slash on non-signed relative/site paths (preserve signed CDN URLs ending in '/')
    if not (raw_parsed.scheme in {"http", "https"} and raw_parsed.netloc):
        while len(path) > 1 and path.endswith("/"):
            path = path[:-1]

    return urlunparse((scheme, resolved.netloc, path, "", resolved.query, resolved.fragment))


def json_to_kazumi_link(plugin: dict[str, Any]) -> str:
    raw = json.dumps(plugin, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return "kazumi://" + base64.b64encode(raw).decode("ascii")


def kazumi_link_to_json_str(link: str) -> str:
    text = (link or "").strip()
    m = re.match(r"^kazumi:(?://)?", text, flags=re.IGNORECASE)
    if not m:
        raise ValueError("无效的 kazumi:// 规则链接")
    payload = unquote(text[m.end() :])
    payload = re.sub(r"\s+", "", payload)
    if not payload:
        raise ValueError("规则链接内容为空")
    payload = payload.replace("-", "+").replace("_", "/")
    pad = (-len(payload)) % 4
    if pad:
        payload += "=" * pad
    try:
        return base64.b64decode(payload).decode("utf-8")
    except Exception as exc:
        raise ValueError(f"规则链接 Base64 解码失败: {exc}") from exc


def normalize_plugin_dict(data: dict[str, Any]) -> dict[str, Any]:
    """Ensures a plugin dict has all canonical Kazumi v9 schema fields."""
    api_val = str(data.get("api") or API_LEVEL)
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("规则名称不能为空")
    try:
        if int(api_val) > API_LEVEL:
            raise ValueError(f"规则需要更高版本 API ({api_val} > {API_LEVEL})")
    except ValueError as exc:
        if "API" in str(exc):
            raise
    search_mode = "api" if data.get("searchMode") == "api" else "xpath"
    chapter_mode = "api" if data.get("chapterMode") == "api" else "xpath"

    out = dict(data)
    out.setdefault("api", str(API_LEVEL))
    out.setdefault("type", "anime")
    out["name"] = name
    out["version"] = str(data.get("version") or "1.0")
    out["muliSources"] = bool(data.get("muliSources", True))
    out["useWebview"] = bool(data.get("useWebview", True))
    out["useNativePlayer"] = bool(data.get("useNativePlayer", True))
    out["usePost"] = bool(data.get("usePost", False))
    out["useLegacyParser"] = bool(data.get("useLegacyParser", False))
    out["adBlocker"] = bool(data.get("adBlocker", False))
    out["userAgent"] = str(data.get("userAgent") or "")
    out["baseURL"] = str(data.get("baseURL") or data.get("baseUrl") or "")
    out["searchURL"] = str(data.get("searchURL") or "")
    out["searchList"] = str(data.get("searchList") or "")
    out["searchName"] = str(data.get("searchName") or "")
    out["searchResult"] = str(data.get("searchResult") or "")
    out["chapterRoads"] = str(data.get("chapterRoads") or "")
    out["chapterResult"] = str(data.get("chapterResult") or "")
    out["referer"] = str(data.get("referer") or "")
    out["searchMode"] = search_mode
    out["chapterMode"] = chapter_mode
    if not isinstance(out.get("antiCrawlerConfig"), dict):
        out["antiCrawlerConfig"] = {
            "enabled": False,
            "captchaType": 1,
            "captchaImage": "",
            "captchaInput": "",
            "captchaButton": "",
            "captchaDetectType": 1,
            "captchaDetectValue": "",
            "captchaScript": "",
        }
    return out


def parse_rule_import_text(raw_text: str) -> tuple[list[dict[str, Any]], list[str]]:
    """Supports single JSON object, JSON array, or one/many kazumi:// share links."""
    text = (raw_text or "").strip()
    if not text:
        return [], ["导入内容为空"]

    plugins: list[dict[str, Any]] = []
    failures: list[str] = []

    try:
        decoded = json.loads(text)
        entries = decoded if isinstance(decoded, list) else [decoded]
        for idx, entry in enumerate(entries, start=1):
            try:
                if isinstance(entry, str):
                    entry = json.loads(kazumi_link_to_json_str(entry))
                if not isinstance(entry, dict):
                    raise ValueError("规则条目必须是 JSON 对象")
                plugins.append(normalize_plugin_dict(entry))
            except Exception as exc:
                failures.append(f"第 {idx} 条：{exc}")
        return plugins, failures
    except json.JSONDecodeError:
        pass

    matches = list(re.finditer(r"kazumi:(?://)?", text, flags=re.IGNORECASE))
    if not matches:
        return [], ["未识别到有效的 JSON 或 kazumi:// 规则链接"]

    for idx, m in enumerate(matches):
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        segment = text[m.start() : end].strip()
        # Strip trailing prose if whitespace separates link from description
        first_token = segment.split()[0] if segment.split() else segment
        try:
            obj = json.loads(kazumi_link_to_json_str(first_token))
            if not isinstance(obj, dict):
                raise ValueError("规则链接内容必须是 JSON 对象")
            plugins.append(normalize_plugin_dict(obj))
        except Exception as exc:
            failures.append(f"第 {idx + 1} 条：{exc}")
    return plugins, failures


# ============================================================
# Kazumi XPath Compatibility Engine (Dart xpath_selector -> lxml)
# ============================================================


def _translate_attr_shorthands(expr: str) -> str:
    """Translates Dart xpath_selector CSS-like attribute predicates to standard XPath 1.0."""
    # [@attr*='val'] or [@attr*="val"]
    expr = re.sub(
        r"@([A-Za-z0-9_:\-]+)\s*\*=\s*(['\"])(.*?)\2",
        r"contains(@\1, \2\3\2)",
        expr,
    )
    # [@attr^='val']
    expr = re.sub(
        r"@([A-Za-z0-9_:\-]+)\s*\^=\s*(['\"])(.*?)\2",
        r"starts-with(@\1, \2\3\2)",
        expr,
    )
    # [@attr$='val']
    expr = re.sub(
        r"@([A-Za-z0-9_:\-]+)\s*\$=\s*(['\"])(.*?)\2",
        r"substring(@\1, string-length(@\1) - string-length(\2\3\2) + 1) = \2\3\2",
        expr,
    )
    # [@attr~='val']
    expr = re.sub(
        r"@([A-Za-z0-9_:\-]+)\s*~=\s*(['\"])(.*?)\2",
        r"contains(concat(' ', normalize-space(@\1), ' '), \2 \3 \2)",
        expr,
    )
    return expr


def _split_top_level_union(expr: str) -> list[str]:
    """Splits XPath union branches by `|` outside brackets/parens/quotes."""
    parts: list[str] = []
    buf: list[str] = []
    depth_sq = 0
    depth_pa = 0
    quote_ch: Optional[str] = None
    for ch in expr:
        if quote_ch:
            buf.append(ch)
            if ch == quote_ch:
                quote_ch = None
            continue
        if ch in {"'", '"'}:
            quote_ch = ch
            buf.append(ch)
        elif ch == "[":
            depth_sq += 1
            buf.append(ch)
        elif ch == "]":
            depth_sq = max(0, depth_sq - 1)
            buf.append(ch)
        elif ch == "(":
            depth_pa += 1
            buf.append(ch)
        elif ch == ")":
            depth_pa = max(0, depth_pa - 1)
            buf.append(ch)
        elif ch == "|" and depth_sq == 0 and depth_pa == 0:
            parts.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    if buf:
        parts.append("".join(buf).strip())
    return [p for p in parts if p]


def _rewrite_relative_branch(branch: str) -> tuple[str, Optional[str]]:
    """
    Rewrites a Dart xpath_selector branch for evaluation on a sub-element in lxml.
    Returns (primary_xpath, optional_self_fallback_xpath).
    """
    b = branch.strip()
    if b in {".", "./"}:
        return ".", None
    if b == "//":
        return ".", None
    if b.startswith(".//") or b.startswith("./"):
        return b, None
    # Axis expressions prefixed with / like /self::*[@class='...']/following-sibling::a (ezdmw.json)
    if re.match(r"^/(self|child|descendant|descendant-or-self|following|following-sibling|preceding|preceding-sibling|parent|ancestor)::", b):
        return b[1:], None
    if b.startswith("//"):
        rest = b[2:]
        primary = ".//" + rest
        # Also prepare self:: fallback in case the rule matched the node itself (e.g. //div/div[2]/h5/a on a <div>)
        m_tag = re.match(r"^([A-Za-z_*][A-Za-z0-9_\-:*]*)(\[[^\]]*\])?(.*)$", rest)
        fallback = None
        if m_tag:
            tag_part = m_tag.group(1)
            pred_part = m_tag.group(2) or ""
            tail_part = m_tag.group(3) or ""
            if not re.match(r"^\[\d+\]$", pred_part):
                fallback = f"self::{tag_part}{pred_part}{tail_part}"
            else:
                fallback = f"self::{tag_part}{tail_part}"
        return primary, fallback
    if b.startswith("/"):
        return "./" + b[1:], None
    return b, None


def eval_kazumi_xpath(node: Any, expression: str, *, relative: bool = False) -> list[Any]:
    expr = (expression or "").strip()
    if not expr:
        return []
    if expr == "//":
        return [node]

    translated = _translate_attr_shorthands(expr)
    branches = _split_top_level_union(translated)
    results: list[Any] = []
    seen_ids: set[int] = set()

    for branch in branches:
        if relative:
            primary, fallback = _rewrite_relative_branch(branch)
        else:
            primary = "." if branch == "//" else branch
            fallback = None

        matched = node.xpath(primary)
        if not matched and fallback:
            try:
                matched = node.xpath(fallback)
            except Exception:
                matched = []

        if not isinstance(matched, list):
            matched = [matched]
        for item in matched:
            if isinstance(item, str):
                results.append(item)
            else:
                obj_id = id(item)
                if obj_id not in seen_ids:
                    seen_ids.add(obj_id)
                    results.append(item)
    return results


def _node_text(item: Any) -> str:
    if item is None:
        return ""
    if isinstance(item, str):
        return item.strip()
    text = "".join(item.itertext()).strip()
    if not text and hasattr(item, "attrib"):
        text = str(item.attrib.get("title") or "").strip()
    return text


def _node_href(item: Any) -> str:
    if item is None:
        return ""
    if isinstance(item, str):
        return item.strip()
    if hasattr(item, "attrib"):
        return str(item.attrib.get("href") or "").strip()
    return ""


# ============================================================
# Restricted JSONPath & API Template Engine (api_rule_strategy.dart)
# ============================================================


def eval_jsonpath(document: Any, expression: str) -> list[Any]:
    """Exact port of RestrictedJsonPath supporting $.a.b[*], $[*], $.arr[0], $['key']."""
    expr = (expression or "").strip()
    if not expr or not expr.startswith("$"):
        raise ValueError(f"JSONPath 必须以 $ 开头: {expr}")

    tokens: list[tuple[str, Any]] = []
    i = 1
    n = len(expr)
    while i < n:
        ch = expr[i]
        if ch == ".":
            i += 1
            start = i
            while i < n and re.match(r"[A-Za-z0-9_$\-]", expr[i]):
                i += 1
            if i == start:
                raise ValueError(f"不支持的 JSONPath: {expr}")
            tokens.append(("key", expr[start:i]))
        elif ch == "[":
            end = expr.find("]", i + 1)
            if end < 0:
                raise ValueError(f"JSONPath 缺少 ]: {expr}")
            content = expr[i + 1 : end].strip()
            if content == "*":
                tokens.append(("wildcard", None))
            elif re.match(r"^\d+$", content):
                tokens.append(("index", int(content)))
            elif len(content) >= 2 and content[0] == content[-1] and content[0] in {"'", '"'}:
                tokens.append(("key", content[1:-1]))
            else:
                raise ValueError(f"不支持的 JSONPath 片段: [{content}]")
            i = end + 1
        else:
            raise ValueError(f"不支持的 JSONPath: {expr}")

    current = [document]
    for kind, arg in tokens:
        next_items: list[Any] = []
        for obj in current:
            if kind == "key":
                if isinstance(obj, dict) and arg in obj:
                    next_items.append(obj[arg])
            elif kind == "index":
                if isinstance(obj, list) and 0 <= arg < len(obj):
                    next_items.append(obj[arg])
            elif kind == "wildcard":
                if isinstance(obj, list):
                    next_items.extend(obj)
                elif isinstance(obj, dict):
                    next_items.extend(obj.values())
        current = next_items
    return current


def eval_jsonpath_first(document: Any, expression: str) -> Any:
    vals = eval_jsonpath(document, expression)
    return vals[0] if vals else None


def _render_template(template: str, variables: dict[str, Any], *, encode: bool = False) -> str:
    def _repl(m: re.Match[str]) -> str:
        name = m.group(1)
        if name not in variables:
            raise ValueError(f"缺少模板变量 @{name}")
        val = "" if variables[name] is None else str(variables[name])
        return quote(val, safe="") if encode else val

    return re.sub(r"(?<![A-Za-z0-9_])@([A-Za-z_][A-Za-z0-9_]*)", _repl, template)


def _render_value(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, str):
        exact = re.match(r"^@([A-Za-z_][A-Za-z0-9_]*)$", value)
        if exact:
            name = exact.group(1)
            if name not in variables:
                raise ValueError(f"缺少模板变量 @{name}")
            return variables[name]
        return _render_template(value, variables)
    if isinstance(value, list):
        return [_render_value(v, variables) for v in value]
    if isinstance(value, dict):
        return {str(k): _render_value(v, variables) for k, v in value.items()}
    return value


def _render_map(mapping: dict[str, Any], variables: dict[str, Any]) -> dict[str, Any]:
    return {_render_template(str(k), variables): _render_value(v, variables) for k, v in (mapping or {}).items()}


# ============================================================
# Per-Plugin Cookie Store (for Anti-Crawler Captcha Verification)
# ============================================================


class PluginCookieStore:
    def __init__(self) -> None:
        self._cookies: dict[str, list[dict[str, Any]]] = {}
        self._user_agents: dict[str, str] = {}

    def save(self, plugin_name: str, cookies: list[dict[str, Any]], user_agent: str = "") -> None:
        key = plugin_name_key(plugin_name)
        self._cookies[key] = list(cookies)
        if user_agent:
            self._user_agents[key] = user_agent

    def get_cookie_header(self, plugin_name: str, url: str) -> str:
        key = plugin_name_key(plugin_name)
        cookies = self._cookies.get(key) or []
        if not cookies:
            return ""
        host = urlparse(url).hostname or ""
        pairs = []
        for c in cookies:
            domain = str(c.get("domain") or "").lstrip(".")
            if domain and host and not (host == domain or host.endswith("." + domain)):
                continue
            name = str(c.get("name") or "")
            value = str(c.get("value") or "")
            if name:
                pairs.append(f"{name}={value}")
        return "; ".join(pairs)

    def get_user_agent(self, plugin_name: str) -> Optional[str]:
        return self._user_agents.get(plugin_name_key(plugin_name))


cookie_store = PluginCookieStore()


# ============================================================
# Rule Execution Engine
# ============================================================


@dataclass
class SearchTraceResult:
    plugin_name: str
    items: list[dict[str, str]]
    diagnostics: list[str] = field(default_factory=list)
    raw_preview: str = ""
    request_url: str = ""
    status_code: int = 200


@dataclass
class ChapterTraceResult:
    plugin_name: str
    roads: list[dict[str, Any]]
    diagnostics: list[str] = field(default_factory=list)
    raw_preview: str = ""
    request_url: str = ""
    status_code: int = 200


class RuleEngine:
    def __init__(self, store: RuntimeStore) -> None:
        self.store = store

    async def _execute_http(
        self,
        plugin: dict[str, Any],
        *,
        method: str,
        url: str,
        headers: Optional[dict[str, Any]] = None,
        query: Optional[dict[str, Any]] = None,
        body_type: str = "none",
        body: Any = None,
        include_cookies: bool = True,
    ) -> tuple[int, str, dict[str, str]]:
        plugin_name = str(plugin.get("name") or "")
        base_url = str(plugin.get("baseURL") or "").rstrip("/")

        cookie_header = cookie_store.get_cookie_header(plugin_name, url) if include_cookies else ""
        verified_ua = cookie_store.get_user_agent(plugin_name) if cookie_header else None
        ua = verified_ua or str(plugin.get("userAgent") or "").strip() or get_random_ua()

        req_headers: dict[str, str] = {
            "user-agent": ua,
            "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
            "accept-language": get_random_accept_language(),
        }
        if base_url:
            req_headers["referer"] = f"{base_url}/"
        if cookie_header:
            req_headers["cookie"] = cookie_header
        for k, v in (headers or {}).items():
            req_headers[str(k).lower()] = str(v)
        if verified_ua:
            req_headers["user-agent"] = verified_ua

        proxy = self.store.get_proxy_url()
        req_kwargs: dict[str, Any] = {
            "params": {k: str(v) for k, v in (query or {}).items()} if query else None,
            "headers": req_headers,
        }
        if method == "POST":
            if body_type == "json":
                req_kwargs["json"] = body
            elif body_type == "form":
                req_kwargs["data"] = body if isinstance(body, dict) else str(body or "")

        last_exc: Optional[Exception] = None
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(18.0, connect=10.0),
            follow_redirects=True,
            proxy=proxy,
            verify=False,
        ) as client:
            for attempt in range(2):
                if attempt > 0:
                    await asyncio.sleep(0.4)
                try:
                    resp = await client.request(method, url, **req_kwargs)
                    resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                    return resp.status_code, resp.text, resp_headers
                except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as exc:
                    last_exc = exc
        assert last_exc is not None
        raise last_exc

    @staticmethod
    def _detects_captcha(raw_html: str, anti_cfg: dict[str, Any], root: Any = None) -> bool:
        if not anti_cfg or not anti_cfg.get("enabled"):
            return False
        detect_type = int(anti_cfg.get("captchaDetectType") or 1)
        detect_val = str(anti_cfg.get("captchaDetectValue") or "").strip()
        if detect_val:
            if detect_type == 2:  # text
                return detect_val in raw_html
            if detect_type == 3:  # regex
                try:
                    return bool(re.search(detect_val, raw_html, flags=re.IGNORECASE | re.DOTALL))
                except re.error:
                    return False
            # xpath
            doc = root if root is not None else lxml_html.fromstring(raw_html)
            return bool(eval_kazumi_xpath(doc, detect_val, relative=False))

        doc = root if root is not None else lxml_html.fromstring(raw_html)
        for field_name in ("captchaImage", "captchaButton"):
            sel = str(anti_cfg.get(field_name) or "").strip()
            if sel and eval_kazumi_xpath(doc, sel, relative=False):
                return True
        return False

    async def trace_search(self, plugin: dict[str, Any], keyword: str) -> SearchTraceResult:
        plugin = normalize_plugin_dict(plugin)
        name = plugin["name"]
        mode = plugin.get("searchMode", "xpath")
        diagnostics: list[str] = []

        if mode == "api":
            cfg = plugin.get("searchApiConfig") or {}
            req = cfg.get("request") or {}
            method = str(req.get("method") or "GET").upper()
            url = _render_template(str(req.get("url") or "").strip(), {"keyword": keyword}, encode=True)
            headers = _render_map(req.get("headers") or {}, {"keyword": keyword})
            query = _render_map(req.get("query") or {}, {"keyword": keyword})
            body_type = str(req.get("bodyType") or "none")
            body = _render_value(req.get("body"), {"keyword": keyword}) if method == "POST" and body_type != "none" else None
            try:
                status, raw, _ = await self._execute_http(
                    plugin,
                    method=method,
                    url=url,
                    headers=headers,
                    query=query,
                    body_type=body_type,
                    body=body,
                    include_cookies=True,
                )
            except Exception as exc:
                raise RuleExecutionError(name, f"搜索请求失败: {exc}") from exc
            if status >= 400:
                raise RuleExecutionError(name, f"搜索接口返回 HTTP {status}")
            try:
                doc = json.loads(raw)
            except Exception as exc:
                raise RuleExecutionError(name, f"API 响应不是有效 JSON: {exc}") from exc

            list_path = str(cfg.get("listPath") or "$.data[*]")
            name_path = str(cfg.get("namePath") or "$.name")
            source_path = str(cfg.get("sourcePath") or "$.url")
            source_template = str(cfg.get("sourceTemplate") or "").strip()

            nodes = eval_jsonpath(doc, list_path)
            items: list[dict[str, str]] = []
            for idx, node in enumerate(nodes):
                item_name = str(eval_jsonpath_first(node, name_path) or "").strip()
                raw_src = str(eval_jsonpath_first(node, source_path) or "").strip()
                if not item_name or not raw_src:
                    diagnostics.append(f"搜索节点 {idx} 缺少名称或来源，已跳过")
                    continue
                src = source_template.replace("@source", quote(raw_src, safe="")) if source_template else raw_src
                items.append(
                    {
                        "name": item_name,
                        "src": src,
                        "fullUrl": normalize_episode_url(plugin["baseURL"], src),
                    }
                )
            return SearchTraceResult(
                plugin_name=name,
                items=items,
                diagnostics=diagnostics,
                raw_preview=raw[:3000],
                request_url=url,
                status_code=status,
            )

        # XPath search mode
        search_url_tpl = str(plugin.get("searchURL") or "").strip()
        if not search_url_tpl:
            raise RuleExecutionError(name, "搜索地址 searchURL 不能为空")
        query_url = search_url_tpl.replace("@keyword", quote(keyword))
        use_post = bool(plugin.get("usePost"))
        if use_post:
            parsed = urlparse(query_url)
            post_url = urlunparse(parsed._replace(query=""))
            form_data = dict(parse_qsl(parsed.query, keep_blank_values=True))
            method, req_url, body_type, body = "POST", post_url, "form", form_data
        else:
            method, req_url, body_type, body = "GET", query_url, "none", None

        try:
            status, raw, resp_headers = await self._execute_http(
                plugin,
                method=method,
                url=req_url,
                body_type=body_type,
                body=body,
                include_cookies=True,
            )
        except Exception as exc:
            raise RuleExecutionError(name, f"搜索请求失败: {exc}") from exc

        anti_cfg = plugin.get("antiCrawlerConfig") or {}
        if status >= 400:
            if anti_cfg.get("enabled"):
                if resp_headers.get("cf-mitigated", "").lower() == "challenge":
                    raise CaptchaRequiredError(name)
                if raw.strip():
                    try:
                        if self._detects_captcha(raw, anti_cfg):
                            raise CaptchaRequiredError(name)
                    except CaptchaRequiredError:
                        raise
                    except Exception:
                        pass
            raise RuleExecutionError(name, f"搜索站点返回 HTTP {status}")

        if not raw.strip():
            raise RuleExecutionError(name, "HTML 响应为空")

        root = lxml_html.fromstring(raw)
        if self._detects_captcha(raw, anti_cfg, root=root):
            raise CaptchaRequiredError(name)

        nodes = eval_kazumi_xpath(root, plugin["searchList"], relative=False)
        items = []
        for idx, node in enumerate(nodes):
            try:
                name_nodes = eval_kazumi_xpath(node, plugin["searchName"], relative=True)
                res_nodes = eval_kazumi_xpath(node, plugin["searchResult"], relative=True)
                item_name = _node_text(name_nodes[0]) if name_nodes else ""
                item_src = _node_href(res_nodes[0]) if res_nodes else ""
                if not item_name or not item_src:
                    diagnostics.append(f"搜索节点 {idx} 缺少名称或链接，已跳过")
                    continue
                items.append(
                    {
                        "name": item_name,
                        "src": item_src,
                        "fullUrl": normalize_episode_url(plugin["baseURL"], item_src),
                    }
                )
            except Exception as exc:
                diagnostics.append(f"搜索节点 {idx} 解析失败: {exc}")

        return SearchTraceResult(
            plugin_name=name,
            items=items,
            diagnostics=diagnostics,
            raw_preview=raw[:3000],
            request_url=req_url,
            status_code=status,
        )

    async def trace_chapters(self, plugin: dict[str, Any], source: str) -> ChapterTraceResult:
        plugin = normalize_plugin_dict(plugin)
        name = plugin["name"]
        mode = plugin.get("chapterMode", "xpath")
        diagnostics: list[str] = []

        if mode == "api":
            cfg = plugin.get("chapterApiConfig") or {}
            req = cfg.get("request") or {}
            method = str(req.get("method") or "GET").upper()
            url = _render_template(str(req.get("url") or "").strip(), {"source": source}, encode=True)
            headers = _render_map(req.get("headers") or {}, {"source": source})
            query = _render_map(req.get("query") or {}, {"source": source})
            body_type = str(req.get("bodyType") or "none")
            body = _render_value(req.get("body"), {"source": source}) if method == "POST" and body_type != "none" else None
            try:
                status, raw, _ = await self._execute_http(
                    plugin,
                    method=method,
                    url=url,
                    headers=headers,
                    query=query,
                    body_type=body_type,
                    body=body,
                    include_cookies=True,
                )
            except Exception as exc:
                raise RuleExecutionError(name, f"选集请求失败: {exc}") from exc
            if status >= 400:
                raise RuleExecutionError(name, f"选集接口返回 HTTP {status}")
            try:
                doc = json.loads(raw)
            except Exception as exc:
                raise RuleExecutionError(name, f"选集 API 响应不是有效 JSON: {exc}") from exc

            root_vars: dict[str, Any] = {"source": source}
            for var_k, var_path in (cfg.get("variables") or {}).items():
                val = eval_jsonpath_first(doc, str(var_path))
                if val is not None:
                    root_vars[str(var_k)] = val

            fmt = str(cfg.get("format") or "nested")
            if fmt == "delimited":
                roads = self._parse_api_delimited(doc, cfg, root_vars, plugin["baseURL"], diagnostics)
            else:
                roads = self._parse_api_nested(doc, cfg, root_vars, plugin["baseURL"], diagnostics)

            return ChapterTraceResult(
                plugin_name=name,
                roads=roads,
                diagnostics=diagnostics,
                raw_preview=raw[:3000],
                request_url=url,
                status_code=status,
            )

        # XPath chapter mode
        chapter_url = normalize_episode_url(plugin["baseURL"], source)
        if not chapter_url.startswith(("http://", "https://")):
            raise RuleExecutionError(name, f"无效的详情页地址: {chapter_url}")
        try:
            status, raw, _ = await self._execute_http(
                plugin,
                method="GET",
                url=chapter_url,
                include_cookies=False,
            )
        except Exception as exc:
            raise RuleExecutionError(name, f"选集页面请求失败: {exc}") from exc
        if status >= 400:
            raise RuleExecutionError(name, f"选集页面返回 HTTP {status}")
        if not raw.strip():
            raise RuleExecutionError(name, "选集页面 HTML 为空")

        root = lxml_html.fromstring(raw)
        road_nodes = eval_kazumi_xpath(root, plugin["chapterRoads"], relative=False)
        roads: list[dict[str, Any]] = []
        for r_idx, r_node in enumerate(road_nodes):
            try:
                ep_nodes = eval_kazumi_xpath(r_node, plugin["chapterResult"], relative=True)
                episodes: list[dict[str, str]] = []
                for e_idx, e_node in enumerate(ep_nodes):
                    ep_href = _node_href(e_node)
                    if not ep_href:
                        diagnostics.append(f"线路 {r_idx} 剧集 {e_idx} 缺少 href，已跳过")
                        continue
                    ep_name = re.sub(r"\s+", "", _node_text(e_node)) or f"第{e_idx + 1}集"
                    episodes.append(
                        {
                            "name": ep_name,
                            "src": normalize_episode_url(plugin["baseURL"], ep_href),
                        }
                    )
                if episodes:
                    roads.append(self._make_road(f"播放线路{len(roads) + 1}", episodes))
                else:
                    diagnostics.append(f"线路 {r_idx} 没有有效剧集，已跳过")
            except Exception as exc:
                diagnostics.append(f"线路 {r_idx} 解析失败: {exc}")

        return ChapterTraceResult(
            plugin_name=name,
            roads=roads,
            diagnostics=diagnostics,
            raw_preview=raw[:3000],
            request_url=chapter_url,
            status_code=status,
        )

    @staticmethod
    def _make_road(name: str, episodes: list[dict[str, str]]) -> dict[str, Any]:
        return {
            "name": name,
            "episodes": episodes,
            "data": [e["src"] for e in episodes],
            "identifier": [e["name"] for e in episodes],
        }

    @staticmethod
    def _resolve_api_episode_url(
        cfg: dict[str, Any],
        root_vars: dict[str, Any],
        raw_url: str,
        road_idx: int,
        ep_idx: int,
        base_url: str,
    ) -> str:
        ep_page = cfg.get("episodePage")
        if not isinstance(ep_page, dict) or not str(ep_page.get("url") or "").strip():
            return normalize_episode_url(base_url, raw_url)
        variables = {
            **root_vars,
            "episodeUrl": raw_url,
            "roadIndex": road_idx,
            "roadNumber": road_idx + 1,
            "episodeIndex": ep_idx,
            "episodeNumber": ep_idx + 1,
        }
        rendered_url = _render_template(str(ep_page["url"]).strip(), variables, encode=True)
        extra_query = _render_map(ep_page.get("query") or {}, variables)
        if extra_query:
            parsed = urlparse(rendered_url)
            merged = dict(parse_qsl(parsed.query, keep_blank_values=True))
            for k, v in extra_query.items():
                merged[str(k)] = str(v)
            rendered_url = urlunparse(parsed._replace(query=urlencode(merged)))
        return normalize_episode_url(base_url, rendered_url)

    def _parse_api_nested(
        self,
        doc: Any,
        cfg: dict[str, Any],
        root_vars: dict[str, Any],
        base_url: str,
        diagnostics: list[str],
    ) -> list[dict[str, Any]]:
        roads_path = str(cfg.get("roadsPath") or "").strip()
        road_name_path = str(cfg.get("roadNamePath") or "").strip()
        episodes_path = str(cfg.get("episodesPath") or "$.episodes[*]")
        ep_name_path = str(cfg.get("episodeNamePath") or "$.name")
        ep_url_path = str(cfg.get("episodeUrlPath") or "").strip()

        road_nodes = eval_jsonpath(doc, roads_path) if roads_path else [doc]
        roads: list[dict[str, Any]] = []
        for r_idx, r_node in enumerate(road_nodes):
            r_name = str(eval_jsonpath_first(r_node, road_name_path) or "").strip() if (roads_path and road_name_path) else ""
            ep_nodes = eval_jsonpath(r_node, episodes_path)
            episodes: list[dict[str, str]] = []
            for e_idx, e_node in enumerate(ep_nodes):
                ep_name = str(eval_jsonpath_first(e_node, ep_name_path) or "").strip() or f"第{e_idx + 1}集"
                raw_url = str(eval_jsonpath_first(e_node, ep_url_path) or "").strip() if ep_url_path else ""
                page_url = self._resolve_api_episode_url(cfg, root_vars, raw_url, r_idx, e_idx, base_url)
                if not page_url:
                    diagnostics.append(f"线路 {r_idx} 剧集 {e_idx} 缺少 URL")
                    continue
                episodes.append({"name": ep_name, "src": page_url})
            if episodes:
                roads.append(self._make_road(r_name or f"播放线路{len(roads) + 1}", episodes))
        return roads

    def _parse_api_delimited(
        self,
        doc: Any,
        cfg: dict[str, Any],
        root_vars: dict[str, Any],
        base_url: str,
        diagnostics: list[str],
    ) -> list[dict[str, Any]]:
        names_val = str(eval_jsonpath_first(doc, str(cfg.get("roadNamesPath") or "")) or "")
        eps_val = str(eval_jsonpath_first(doc, str(cfg.get("roadEpisodesPath") or "")) or "")
        if not eps_val:
            return []
        road_sep = str(cfg.get("roadSeparator") or "$$$")
        ep_sep = str(cfg.get("episodeSeparator") or "#")
        field_sep = str(cfg.get("fieldSeparator") or "$")

        road_names = names_val.split(road_sep) if names_val else []
        road_groups = eps_val.split(road_sep)
        roads: list[dict[str, Any]] = []
        for r_idx, grp in enumerate(road_groups):
            episodes: list[dict[str, str]] = []
            for e_idx, entry in enumerate(grp.split(ep_sep)):
                entry = entry.strip()
                if not entry:
                    continue
                sep_i = entry.find(field_sep)
                if sep_i < 0:
                    diagnostics.append(f"线路 {r_idx} 条目 {e_idx} 缺少字段分隔符")
                    continue
                ep_name = entry[:sep_i].strip() or f"第{e_idx + 1}集"
                raw_url = entry[sep_i + len(field_sep) :].strip()
                page_url = self._resolve_api_episode_url(cfg, root_vars, raw_url, r_idx, e_idx, base_url)
                if page_url:
                    episodes.append({"name": ep_name, "src": page_url})
            if episodes:
                r_name = road_names[r_idx].strip() if r_idx < len(road_names) else ""
                roads.append(self._make_road(r_name or f"播放线路{len(roads) + 1}", episodes))
        return roads


# ============================================================
# Official KazumiRules Catalog & Installer
# ============================================================


class RuleCatalogService:
    CACHE_TTL = 300

    def __init__(self, store: RuntimeStore) -> None:
        self.store = store
        self._catalog_cache: Optional[tuple[float, list[dict[str, Any]]]] = None

    def _repo_candidates(self) -> list[str]:
        s = self.store.get_settings()
        custom = str(s.get("ruleRepositoryUrl") or "").strip()
        if custom:
            if not custom.endswith("/"):
                custom += "/"
            return [custom]
        if s.get("enableGitProxy"):
            return [*RULE_REPO_MIRRORS, OFFICIAL_RULE_REPO]
        return [OFFICIAL_RULE_REPO, *RULE_REPO_MIRRORS]

    async def _fetch_repo_json(self, relative_path: str) -> Any:
        proxy = self.store.get_proxy_url()
        last_exc: Optional[Exception] = None
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, proxy=proxy) as client:
            for base in self._repo_candidates():
                url = urljoin(base, relative_path)
                try:
                    resp = await client.get(url, headers={"User-Agent": get_random_ua()})
                    resp.raise_for_status()
                    return resp.json()
                except Exception as exc:
                    last_exc = exc
                    logger.warning("Rule repo fetch failed (%s): %s", url, exc)
        assert last_exc is not None
        raise last_exc

    async def fetch_catalog(self, force: bool = False) -> list[dict[str, Any]]:
        if not force and self._catalog_cache and (time.monotonic() - self._catalog_cache[0]) < self.CACHE_TTL:
            return [dict(x) for x in self._catalog_cache[1]]
        try:
            data = await self._fetch_repo_json("index.json")
            if isinstance(data, list) and data:
                self._catalog_cache = (time.monotonic(), data)
                return [dict(x) for x in data]
        except Exception as exc:
            logger.warning("Online KazumiRules catalog unreachable, using bundled snapshot: %s", exc)
        bundled = self.store.load_bundled_rules()
        return [dict(x) for x in (bundled.get("catalog") or [])]

    async def install_from_shop(self, name: str) -> dict[str, Any]:
        rule_obj: Optional[dict[str, Any]] = None
        try:
            data = await self._fetch_repo_json(f"{quote(name)}.json")
            if isinstance(data, dict):
                rule_obj = data
        except Exception as exc:
            logger.warning("Online fetch for rule %s failed, trying bundled snapshot: %s", name, exc)
            bundled = self.store.load_bundled_rules()
            candidate = (bundled.get("rules") or {}).get(name)
            if isinstance(candidate, dict):
                rule_obj = candidate
            else:
                raise RuntimeError(f"无法从仓库下载规则 {name}: {exc}") from exc
        if not rule_obj:
            raise RuntimeError(f"规则 {name} 内容无效")
        rule_obj["name"] = name
        normalized = normalize_plugin_dict(rule_obj)
        return self.store.upsert_plugin(normalized)

    async def import_from_url(self, url: str) -> list[dict[str, Any]]:
        proxy = self.store.get_proxy_url()
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, proxy=proxy) as client:
            resp = await client.get(url, headers={"User-Agent": get_random_ua()})
            resp.raise_for_status()
            plugins, failures = parse_rule_import_text(resp.text)
            if not plugins:
                raise ValueError("; ".join(failures) or "链接中未找到有效规则")
            self.store.upsert_plugins(plugins)
            return plugins
