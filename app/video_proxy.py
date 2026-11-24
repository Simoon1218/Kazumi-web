from __future__ import annotations

import asyncio
import base64
import secrets
import time
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import Request, Response
from fastapi.responses import StreamingResponse

from app.config import logger
from app.m3u8_utils import build_filtered_media_playlist, detect_m3u8_type, rewrite_m3u8_passthrough
from app.storage import RuntimeStore

HOP_BY_HOP_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "content-encoding",
    "content-disposition",
    "content-length",
}


@dataclass
class ProxySession:
    original_url: str
    referer: str
    user_agent: str
    plugin_name: str
    ad_blocker: bool
    created_at: float


class ProxySessionStore:
    TTL_SECONDS = 6 * 3600
    MAX_SESSIONS = 300

    def __init__(self) -> None:
        self._sessions: dict[str, ProxySession] = {}

    def register(self, session: ProxySession) -> str:
        self._prune()
        token = secrets.token_urlsafe(18)
        self._sessions[token] = session
        return token

    def lookup(self, token: str) -> Optional[ProxySession]:
        sess = self._sessions.get(token)
        if not sess:
            return None
        if (time.monotonic() - sess.created_at) > self.TTL_SECONDS:
            self._sessions.pop(token, None)
            return None
        return sess

    def _prune(self) -> None:
        now = time.monotonic()
        expired = [k for k, v in self._sessions.items() if (now - v.created_at) > self.TTL_SECONDS]
        for k in expired:
            self._sessions.pop(k, None)
        while len(self._sessions) >= self.MAX_SESSIONS:
            oldest = next(iter(self._sessions))
            self._sessions.pop(oldest, None)


class VideoProxyHandler:
    """
    Full HLS/MP4 reverse proxy aligned with KazumiWeb VideoProxyHandler:
    - Injects plugin Referer & User-Agent
    - Rewrites M3U8 master/media URIs & encryption keys to /proxy/<token>/<b64url>
    - Applies Kazumi HLS Discontinuity Ad Filter
    - Streams binary video chunks with HTTP Range passthrough for instant scrubbing & iOS Safari
    """

    def __init__(self, store: RuntimeStore) -> None:
        self.store = store
        self.sessions = ProxySessionStore()

    @staticmethod
    def build_root_url(token: str) -> str:
        return f"/proxy/{token}"

    @staticmethod
    def build_sub_url(token: str, absolute_url: str) -> str:
        encoded = base64.urlsafe_b64encode(absolute_url.encode("utf-8")).decode("ascii").rstrip("=")
        return f"/proxy/{token}/{encoded}"

    @staticmethod
    def decode_sub_path(sub_path: str) -> Optional[str]:
        try:
            pad = (-len(sub_path)) % 4
            decoded = base64.urlsafe_b64decode(sub_path + ("=" * pad)).decode("utf-8")
            parsed = urlparse(decoded)
            if parsed.scheme in {"http", "https"} and parsed.netloc:
                return decoded
        except Exception:
            pass
        return None

    @staticmethod
    def _is_safe_header_val(val: str) -> bool:
        return all(c == "\t" or (0x20 <= ord(c) <= 0x7E) for c in val)

    async def handle(self, request: Request, token: str, sub_path: Optional[str] = None) -> Response:
        session = self.sessions.lookup(token)
        if not session:
            return Response(content="proxy session expired", status_code=410, media_type="text/plain")

        if sub_path:
            target_url = self.decode_sub_path(sub_path)
            if not target_url:
                return Response(content="invalid sub url", status_code=400, media_type="text/plain")
        else:
            target_url = session.original_url

        upstream_headers: dict[str, str] = {"Accept": "*/*"}
        if session.user_agent:
            upstream_headers["User-Agent"] = session.user_agent
        if session.referer:
            upstream_headers["Referer"] = session.referer
        req_range = request.headers.get("range")
        if req_range:
            upstream_headers["Range"] = req_range

        proxy = self.store.get_proxy_url()
        parsed_target = urlparse(target_url)
        looks_m3u8 = parsed_target.path.lower().endswith(".m3u8")

        # For M3U8 playlists, fetch fully so we can filter ads and rewrite URIs
        if looks_m3u8:
            return await self._handle_m3u8(target_url, upstream_headers, proxy, session, token)

        client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0, connect=15.0),
            follow_redirects=True,
            proxy=proxy,
            verify=False,
        )
        upstream_resp: Optional[httpx.Response] = None
        last_exc: Optional[Exception] = None
        for attempt in range(3):
            try:
                req = client.build_request(request.method, target_url, headers=upstream_headers)
                upstream_resp = await client.send(req, stream=True)
                break
            except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as exc:
                last_exc = exc
                if attempt < 2:
                    await asyncio.sleep(0.3 * (attempt + 1))
            except Exception as exc:
                await client.aclose()
                logger.warning("VideoProxy error for %s: %s", target_url, exc)
                return Response(content=f"proxy error: {exc}", status_code=502, media_type="text/plain")

        if upstream_resp is None:
            await client.aclose()
            return Response(content=f"upstream error: {last_exc}", status_code=504, media_type="text/plain")

        ct = (upstream_resp.headers.get("content-type") or "").lower()
        final_url = str(upstream_resp.url)
        if "mpegurl" in ct or "m3u8" in ct or urlparse(final_url).path.lower().endswith(".m3u8"):
            body_bytes = await upstream_resp.aread()
            await upstream_resp.aclose()
            await client.aclose()
            return self._rewrite_m3u8_bytes(body_bytes, final_url, session, token)

        out_headers: dict[str, str] = {}
        for k, v in upstream_resp.headers.items():
            lk = k.lower()
            if lk in HOP_BY_HOP_HEADERS:
                continue
            if not self._is_safe_header_val(v):
                continue
            out_headers[k] = v

        # Preserve content-length for range scrubbing when upstream provides it without encoding change
        if "content-length" in upstream_resp.headers and "content-encoding" not in upstream_resp.headers:
            out_headers["Content-Length"] = upstream_resp.headers["content-length"]
        out_headers.setdefault("Cache-Control", "no-store")
        if upstream_resp.status_code == 206 or "content-range" in {k.lower() for k in out_headers}:
            out_headers.setdefault("Accept-Ranges", "bytes")

        async def _stream():
            try:
                async for chunk in upstream_resp.aiter_bytes(chunk_size=65536):
                    yield chunk
            except Exception as exc:
                logger.warning("VideoProxy stream interrupted for %s: %s", parsed_target.netloc, exc)
            finally:
                await upstream_resp.aclose()
                await client.aclose()

        return StreamingResponse(
            _stream(),
            status_code=upstream_resp.status_code,
            headers=out_headers,
            media_type=upstream_resp.headers.get("content-type"),
        )

    async def _handle_m3u8(
        self,
        target_url: str,
        headers: dict[str, str],
        proxy: Optional[str],
        session: ProxySession,
        token: str,
    ) -> Response:
        last_exc: Optional[Exception] = None
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20.0, connect=10.0),
            follow_redirects=True,
            proxy=proxy,
            verify=False,
        ) as client:
            for attempt in range(3):
                try:
                    resp = await client.get(target_url, headers=headers)
                    if resp.status_code >= 400:
                        return Response(content=resp.text, status_code=resp.status_code, media_type="text/plain")
                    return self._rewrite_m3u8_bytes(resp.content, str(resp.url), session, token)
                except (httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout, httpx.RemoteProtocolError) as exc:
                    last_exc = exc
                    if attempt < 2:
                        await asyncio.sleep(0.3 * (attempt + 1))
                except Exception as exc:
                    return Response(content=f"m3u8 proxy error: {exc}", status_code=502, media_type="text/plain")
        return Response(content=f"m3u8 upstream timeout: {last_exc}", status_code=504, media_type="text/plain")

    def _rewrite_m3u8_bytes(self, raw_bytes: bytes, final_url: str, session: ProxySession, token: str) -> Response:
        text = raw_bytes.decode("utf-8", errors="replace")
        builder = lambda abs_url: self.build_sub_url(token, abs_url)
        if detect_m3u8_type(text) == "media":
            rewritten, removed = build_filtered_media_playlist(
                text,
                final_url,
                builder,
                enable_ad_filter=session.ad_blocker,
            )
            if removed > 0:
                logger.info("VideoProxy filtered %d HLS ad segment(s) for [%s]", removed, session.plugin_name)
        else:
            rewritten = rewrite_m3u8_passthrough(text, final_url, builder)
        return Response(
            content=rewritten,
            status_code=200,
            media_type="application/vnd.apple.mpegurl; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )
