from __future__ import annotations

import base64
import hashlib
import time
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import urlparse

import httpx

from app.config import DANDANAPI_APPID, DANDANAPI_KEY, DANDAN_API_DOMAIN, get_random_ua, logger
from app.storage import RuntimeStore


def generate_dandan_signature(path: str, timestamp: int) -> str:
    """Exact port of Predidit/Kazumi lib/utils/crypto.dart generateDandanSignature."""
    data = f"{DANDANAPI_APPID}{timestamp}{path}{DANDANAPI_KEY}"
    digest = hashlib.sha256(data.encode("utf-8")).digest()
    return base64.b64encode(digest).decode("ascii")


def parse_dandan_comment(comment: dict[str, Any]) -> dict[str, Any]:
    msg = str(comment.get("m") or "")
    parts = str(comment.get("p") or "0,1,16777215,unknown").split(",")
    try:
        t = float(parts[0])
    except Exception:
        t = 0.0
    try:
        mode = int(parts[1])
    except Exception:
        mode = 1
    try:
        color = int(parts[2]) & 0xFFFFFF
    except Exception:
        color = 0xFFFFFF
    source = parts[3] if len(parts) > 3 else ""
    return {
        "time": t,
        "type": mode,
        "color": color,
        "message": msg,
        "source": source,
    }


def parse_bilibili_xml_danmaku(xml_text: str) -> list[dict[str, Any]]:
    """Parses standard Bilibili/DanDanPlay XML danmaku files for local upload support."""
    items: list[dict[str, Any]] = []
    root = ET.fromstring(xml_text)
    for elem in root.findall(".//d"):
        p_attr = elem.attrib.get("p", "")
        text = (elem.text or "").strip()
        if not p_attr or not text:
            continue
        parts = p_attr.split(",")
        try:
            t = float(parts[0])
            b_mode = int(parts[1])
            color = int(parts[3]) & 0xFFFFFF if len(parts) > 3 else 0xFFFFFF
        except Exception:
            continue
        # Bilibili modes: 1/2/3=rolling, 4=bottom, 5=top
        mode = 4 if b_mode == 4 else (5 if b_mode == 5 else 1)
        items.append({"time": t, "type": mode, "color": color, "message": text, "source": "[LocalXML]"})
    items.sort(key=lambda x: x["time"])
    return items


class DanmakuService:
    """DanDanPlay Open Platform v2 client matching Predidit/Kazumi DanmakuApi."""

    def __init__(self, store: RuntimeStore) -> None:
        self.store = store

    def _base_domain(self) -> str:
        custom = str(self.store.get_settings().get("danmakuApiDomain") or "").strip().rstrip("/")
        return custom or DANDAN_API_DOMAIN

    async def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        domain = self._base_domain()
        url = f"{domain}{path}"
        ts = int(time.time())
        parsed = urlparse(url)
        headers: dict[str, str] = {
            "User-Agent": get_random_ua(),
            "Accept": "application/json",
        }
        if DANDANAPI_APPID and DANDANAPI_KEY:
            headers.update(
                {
                    "X-Auth": "1",
                    "X-AppId": DANDANAPI_APPID,
                    "X-Timestamp": str(ts),
                    "X-Signature": generate_dandan_signature(parsed.path, ts),
                }
            )

        proxy = self.store.get_proxy_url()
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, proxy=proxy) as client:
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code == 403 and not (DANDANAPI_APPID and DANDANAPI_KEY):
                raise PermissionError(
                    "弹弹play API 返回 403：请在 Render 环境变量中配置 DANDANAPI_APPID / DANDANAPI_KEY，或在弹幕设置中填写弹幕代理服务地址，也可导入本地 XML 弹幕。"
                )
            resp.raise_for_status()
            return resp.json()

    async def get_dandan_bangumi_id_by_bgm(self, bgm_id: int) -> int:
        data = await self._get(f"/api/v2/bangumi/bgmtv/{bgm_id}")
        bangumi = data.get("bangumi")
        if isinstance(bangumi, dict):
            return int(bangumi.get("animeId") or 0)
        return int(data.get("animeId") or 0)

    async def search_animes(self, keyword: str) -> list[dict[str, Any]]:
        data = await self._get("/api/v2/search/episodes", params={"anime": keyword, "v2": "true"})
        animes = data.get("animes") or []
        out = []
        for a in animes:
            if not isinstance(a, dict):
                continue
            eps = a.get("episodes") or []
            out.append(
                {
                    "animeId": a.get("animeId"),
                    "animeTitle": a.get("animeTitle") or "",
                    "typeDescription": a.get("typeDescription") or "",
                    "episodeCount": len(eps) if isinstance(eps, list) else 0,
                }
            )
        return out

    async def get_episodes(self, anime_id: int) -> dict[str, Any]:
        data = await self._get(f"/api/v2/bangumi/{anime_id}")
        bangumi = data.get("bangumi") if isinstance(data.get("bangumi"), dict) else data
        episodes = bangumi.get("episodes") or []
        return {
            "animeId": bangumi.get("animeId") or anime_id,
            "items": [
                {
                    "episodeId": ep.get("episodeId"),
                    "episodeTitle": ep.get("episodeTitle") or "",
                }
                for ep in episodes
                if isinstance(ep, dict)
            ],
        }

    async def get_comments_by_episode_id(self, episode_id: int | str) -> list[dict[str, Any]]:
        ch_convert = int(self.store.get_settings().get("danmakuChConvert") or 0)
        data = await self._get(
            f"/api/v2/comment/{episode_id}",
            params={"withRelated": "true", "chConvert": str(ch_convert)},
        )
        comments = data.get("comments") or []
        items = [parse_dandan_comment(c) for c in comments if isinstance(c, dict)]
        items.sort(key=lambda x: x["time"])
        return items

    async def get_danmaku_by_bgm(self, bangumi_id: int, episode: int) -> dict[str, Any]:
        dandan_id = await self.get_dandan_bangumi_id_by_bgm(bangumi_id)
        if not dandan_id:
            return {
                "bangumiId": bangumi_id,
                "episode": episode,
                "dandanBangumiId": 0,
                "items": [],
                "reason": "dandan_bangumi_not_found",
            }
        ep_code = f"{dandan_id}{episode:04d}"
        try:
            items = await self.get_comments_by_episode_id(ep_code)
        except Exception as exc:
            logger.warning("Auto danmaku episode %s failed, trying episode list fallback: %s", ep_code, exc)
            ep_resp = await self.get_episodes(dandan_id)
            eps = ep_resp.get("items") or []
            if 1 <= episode <= len(eps):
                items = await self.get_comments_by_episode_id(eps[episode - 1]["episodeId"])
            else:
                items = []
        return {
            "bangumiId": bangumi_id,
            "episode": episode,
            "dandanBangumiId": dandan_id,
            "items": items,
        }
