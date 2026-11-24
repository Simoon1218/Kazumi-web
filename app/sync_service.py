from __future__ import annotations

import json
from typing import Any, Optional

import httpx

from app.config import logger
from app.storage import RuntimeStore

TRACE_MOE_API = "https://api.trace.moe/search"


class SyncAndTraceService:
    """Handles WebDAV cloud backup/sync (server-side, bypassing browser CORS) and trace.moe image search."""

    def __init__(self, store: RuntimeStore) -> None:
        self.store = store

    # ---------- trace.moe Visual Anime Search ----------
    async def search_image_bytes(self, content: bytes, content_type: str = "image/jpeg") -> dict[str, Any]:
        proxy = self.store.get_proxy_url()
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxy=proxy) as client:
            resp = await client.post(
                TRACE_MOE_API,
                params={"anilistInfo": ""},
                content=content,
                headers={"Content-Type": content_type or "image/jpeg"},
            )
            resp.raise_for_status()
            return self._normalize_trace_response(resp.json())

    async def search_image_url(self, image_url: str) -> dict[str, Any]:
        proxy = self.store.get_proxy_url()
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxy=proxy) as client:
            resp = await client.get(
                TRACE_MOE_API,
                params={"anilistInfo": "", "url": image_url},
            )
            resp.raise_for_status()
            return self._normalize_trace_response(resp.json())

    @staticmethod
    def _normalize_trace_response(data: dict[str, Any]) -> dict[str, Any]:
        results = []
        for item in (data.get("result") or []):
            if not isinstance(item, dict):
                continue
            anilist = item.get("anilist") if isinstance(item.get("anilist"), dict) else {}
            title = anilist.get("title") if isinstance(anilist.get("title"), dict) else {}
            results.append(
                {
                    "anilistId": anilist.get("id") or (item.get("anilist") if isinstance(item.get("anilist"), int) else 0),
                    "titleNative": title.get("native") or "",
                    "titleRomaji": title.get("romaji") or "",
                    "titleEnglish": title.get("english") or "",
                    "synonyms": anilist.get("synonyms") or [],
                    "isAdult": bool(anilist.get("isAdult")),
                    "filename": item.get("filename") or "",
                    "episode": item.get("episode"),
                    "from": float(item.get("from") or 0),
                    "to": float(item.get("to") or 0),
                    "similarity": round(float(item.get("similarity") or 0) * 100, 2),
                    "image": item.get("image") or "",
                    "video": item.get("video") or "",
                }
            )
        return {
            "frameCount": data.get("frameCount") or 0,
            "error": data.get("error") or "",
            "results": results,
        }

    # ---------- WebDAV Cloud Sync ----------
    @staticmethod
    def _build_webdav_url(base_url: str, remote_path: str, filename: str = "") -> str:
        base = base_url.strip().rstrip("/")
        path = "/" + remote_path.strip().strip("/") if remote_path.strip().strip("/") else ""
        if filename:
            return f"{base}{path}/{filename.lstrip('/')}"
        return f"{base}{path}/"

    async def webdav_test(self, url: str, username: str, password: str, remote_path: str) -> dict[str, Any]:
        target = self._build_webdav_url(url, "")
        auth = (username, password) if username else None
        proxy = self.store.get_proxy_url()
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, proxy=proxy, auth=auth) as client:
            resp = await client.request("PROPFIND", target, headers={"Depth": "0"})
            if resp.status_code in {200, 207, 204}:
                return {"ok": True, "status": resp.status_code}
            raise RuntimeError(f"WebDAV 连接失败: HTTP {resp.status_code}")

    async def webdav_upload(
        self,
        url: str,
        username: str,
        password: str,
        remote_path: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        dir_url = self._build_webdav_url(url, remote_path)
        file_url = self._build_webdav_url(url, remote_path, "kazumi_web_backup.json")
        auth = (username, password) if username else None
        proxy = self.store.get_proxy_url()
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxy=proxy, auth=auth) as client:
            # Ensure target directory exists (ignore 405 Method Not Allowed / already exists)
            try:
                await client.request("MKCOL", dir_url)
            except Exception:
                pass
            resp = await client.put(
                file_url,
                content=body,
                headers={"Content-Type": "application/json; charset=utf-8"},
            )
            if resp.status_code not in {200, 201, 204}:
                raise RuntimeError(f"WebDAV 上传失败: HTTP {resp.status_code}")
            logger.info("WebDAV backup uploaded to %s (%d bytes)", file_url, len(body))
            return {"ok": True, "bytes": len(body), "url": file_url}

    async def webdav_download(
        self,
        url: str,
        username: str,
        password: str,
        remote_path: str,
    ) -> dict[str, Any]:
        file_url = self._build_webdav_url(url, remote_path, "kazumi_web_backup.json")
        auth = (username, password) if username else None
        proxy = self.store.get_proxy_url()
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, proxy=proxy, auth=auth) as client:
            resp = await client.get(file_url)
            if resp.status_code == 404:
                raise FileNotFoundError("远端未找到备份文件 kazumi_web_backup.json，请先执行上传。")
            resp.raise_for_status()
            data = resp.json()
            if not isinstance(data, dict):
                raise ValueError("远端备份格式无效")
            return data
