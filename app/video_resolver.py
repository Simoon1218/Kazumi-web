from __future__ import annotations

import asyncio
import base64
import json
import re
import time
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import httpx

from app.config import (
    PLAYWRIGHT_ENABLED,
    PLAYWRIGHT_IDLE_SECONDS,
    RESOLVE_TIMEOUT_SECONDS,
    get_random_accept_language,
    get_random_ua,
    logger,
)
from app.rule_engine import cookie_store, normalize_plugin_dict
from app.storage import RuntimeStore

MEDIA_URL_RE = re.compile(
    r"(https?:\\?/\\?/[^\s\"'<>\\]+?\.(?:m3u8|mp4|flv|webm)(?:\?[^\s\"'<>\\]*)?)",
    flags=re.IGNORECASE,
)

AD_URL_KEYWORDS = (
    "googleads",
    "googlesyndication.com",
    "doubleclick.net",
    "adtrafficquality",
    "prestrain.html",
    "prestrain%2ehtml",
    "hm.baidu.com",
    "cnzz.com",
    "umeng.com",
    "51.la",
    "googletagmanager",
    "google-analytics",
)

# Exact Kazumi WebView JS injection hooks adapted for Playwright expose_binding
KAZUMI_INIT_SCRIPT = r"""
(() => {
  const report = (kind, url) => {
    try {
      if (typeof window.__kazumiReport === 'function' && url) {
        window.__kazumiReport(kind + ':' + String(url));
      }
    } catch (_) {}
  };

  // 1. Hook fetch Response.prototype.text for HLS #EXTM3U
  const _origText = window.Response && window.Response.prototype && window.Response.prototype.text;
  if (_origText) {
    window.Response.prototype.text = function () {
      return _origText.call(this).then((text) => {
        try {
          if (typeof text === 'string' && text.trim().startsWith('#EXTM3U') && this.url) {
            report('videoMessage', this.url);
          }
        } catch (_) {}
        return text;
      });
    };
  }

  // 2. Hook XMLHttpRequest for HLS #EXTM3U
  const _origOpen = window.XMLHttpRequest && window.XMLHttpRequest.prototype && window.XMLHttpRequest.prototype.open;
  if (_origOpen) {
    window.XMLHttpRequest.prototype.open = function (...args) {
      const reqUrl = args[1];
      this.addEventListener('load', () => {
        try {
          const content = this.responseText;
          if (typeof content === 'string' && content.trim().startsWith('#EXTM3U')) {
            report('videoMessage', this.responseURL || reqUrl);
          }
        } catch (_) {}
      });
      return _origOpen.apply(this, args);
    };
  }

  // 3. Observe <video>, <source>, and <iframe> elements
  const scanNode = (root) => {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('video').forEach((v) => {
      const src = v.getAttribute('src') || v.currentSrc;
      if (src && !src.startsWith('blob:')) report('videoMessage', src);
      v.querySelectorAll('source').forEach((s) => {
        const ssrc = s.getAttribute('src');
        if (ssrc && !ssrc.startsWith('blob:')) report('videoMessage', ssrc);
      });
    });
    root.querySelectorAll('iframe').forEach((f) => {
      const src = f.getAttribute('src');
      if (src) report('iframeMessage', src);
    });
  };

  const startObserver = () => {
    scanNode(document);
    if (!document.body) return;
    const obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.target) {
          const tag = m.target.nodeName;
          if (tag === 'VIDEO' || tag === 'SOURCE') {
            const src = m.target.getAttribute('src');
            if (src && !src.startsWith('blob:')) report('videoMessage', src);
          } else if (tag === 'IFRAME') {
            const src = m.target.getAttribute('src');
            if (src) report('iframeMessage', src);
          }
        }
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.nodeName === 'VIDEO' || n.nodeName === 'SOURCE') {
            const src = n.getAttribute('src');
            if (src && !src.startsWith('blob:')) report('videoMessage', src);
          } else if (n.nodeName === 'IFRAME') {
            const src = n.getAttribute('src');
            if (src) report('iframeMessage', src);
          } else {
            scanNode(n);
          }
        });
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver);
  } else {
    startObserver();
  }
})();
"""


def _is_ad_url(url: str) -> bool:
    low = (url or "").lower()
    return any(k in low for k in AD_URL_KEYWORDS)


def decode_video_source(iframe_url: str) -> str:
    """Exact port of Predidit/Kazumi lib/utils/media.dart decodeVideoSource."""
    decoded = unquote(iframe_url)
    parsed = urlparse(decoded)
    params = parse_qs(parsed.query)
    for values in params.values():
        for val in values:
            if re.search(r"https?://.*?\.(?:m3u8|mp4)", val, flags=re.IGNORECASE):
                return val
    return iframe_url


def detect_stream_type(url: str) -> str:
    low = (url or "").lower()
    path = urlparse(low).path
    if ".m3u8" in path or "m3u8" in low:
        return "hls"
    if ".mp4" in path or ".webm" in path:
        return "mp4"
    return "unknown"


def _unescape_js(s: str) -> str:
    # Handle %uXXXX and %XX
    s = re.sub(r"%u([0-9a-fA-F]{4})", lambda m: chr(int(m.group(1), 16)), s)
    return unquote(s)


def _extract_maccms_player_url(html_text: str) -> Optional[str]:
    """Extracts direct video URL from MacCMS `var player_aaaa = {...}` or similar inline JSON configs."""
    patterns = [
        r"var\s+player_[a-zA-Z0-9_]+\s*=\s*(\{.*?\})\s*[;<]",
        r"window\.player_data\s*=\s*(\{.*?\})\s*[;<]",
        r"player_data\s*=\s*(\{.*?\})\s*[;<]",
    ]
    for pat in patterns:
        m = re.search(pat, html_text, flags=re.DOTALL)
        if not m:
            continue
        raw_obj = m.group(1)
        try:
            obj = json.loads(raw_obj)
        except Exception:
            continue
        raw_url = str(obj.get("url") or "").strip()
        if not raw_url:
            continue
        encrypt = int(obj.get("encrypt") or 0)
        if encrypt == 1:
            raw_url = _unescape_js(raw_url)
        elif encrypt == 2:
            try:
                raw_url = _unescape_js(base64.b64decode(raw_url).decode("utf-8", errors="ignore"))
            except Exception:
                pass
        raw_url = raw_url.replace("\\/", "/")
        if raw_url.startswith(("http://", "https://")) and not _is_ad_url(raw_url):
            if re.search(r"\.(?:m3u8|mp4|flv|webm)(?:\?|$)", raw_url, flags=re.IGNORECASE) or "m3u8" in raw_url.lower():
                return raw_url
    return None


def _extract_media_from_html(html_text: str, page_url: str) -> tuple[Optional[str], list[str]]:
    """Returns (direct_video_url, candidate_iframe_urls)."""
    # 1. MacCMS player_aaaa
    maccms = _extract_maccms_player_url(html_text)
    if maccms:
        return maccms, []

    # 2. <video src=...> / <source src=...>
    for m in re.finditer(r"<(?:video|source)\b[^>]*?\bsrc=[\"']([^\"']+)[\"']", html_text, flags=re.IGNORECASE):
        src = m.group(1).strip()
        if not src or src.startswith("blob:") or _is_ad_url(src):
            continue
        full = urljoin(page_url, src)
        if full.startswith(("http://", "https://")):
            return full, []

    # 3. Direct m3u8 / mp4 URLs in scripts
    for m in MEDIA_URL_RE.finditer(html_text):
        cand = m.group(1).replace("\\/", "/")
        if _is_ad_url(cand):
            continue
        if any(skip in cand.lower() for skip in (".js", ".css", ".png", ".jpg", ".svg", "poster", "thumb")):
            continue
        return cand, []

    # 4. Candidate iframes
    iframes: list[str] = []
    for m in re.finditer(r"<iframe\b[^>]*?\bsrc=[\"']([^\"']+)[\"']", html_text, flags=re.IGNORECASE):
        src = m.group(1).strip()
        if not src or src.startswith(("about:", "javascript:")) or _is_ad_url(src):
            continue
        full = urljoin(page_url, src)
        # Check if iframe query string already embeds the final video URL!
        decoded = decode_video_source(full)
        if decoded != full and decoded.startswith(("http://", "https://")) and not _is_ad_url(decoded):
            return decoded, []
        if full.startswith(("http://", "https://")) and full not in iframes:
            iframes.append(full)

    return None, iframes


@dataclass
class ResolvedVideo:
    url: str
    method: str  # direct | static | playwright
    referer: str = ""
    user_agent: str = ""


class DualStageVideoResolver:
    """
    Render-optimized dual-stage Kazumi video resolver:
    - Stage 1: Zero-RAM fast HTTP/HTML/MacCMS/iframe extractor (<1s).
    - Stage 2: On-demand headless Chromium (Playwright) with serialized lock + idle auto-shutdown
               so Render Free Tier (512MB RAM) idles at ~45MB and never OOMs.
    """

    CACHE_TTL_SECONDS = 600
    CACHE_MAX_SIZE = 200
    PLAYWRIGHT_HINT_TTL = 1800

    def __init__(self, store: RuntimeStore) -> None:
        self.store = store
        self._browser_lock = asyncio.Lock()
        self._pw: Any = None
        self._browser: Any = None
        self._last_used: float = 0.0
        self._reaper_task: Optional[asyncio.Task[Any]] = None
        self._cache: dict[tuple[str, str], tuple[float, ResolvedVideo]] = {}
        self._inflight: dict[tuple[str, str], asyncio.Task[ResolvedVideo]] = {}
        self._playwright_hints: dict[str, float] = {}

    async def _ensure_browser(self) -> Any:
        if self._browser is not None and self._browser.is_connected():
            self._last_used = time.monotonic()
            return self._browser
        from playwright.async_api import async_playwright

        if self._pw is None:
            self._pw = await async_playwright().start()

        launch_args = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-software-rasterizer",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--mute-audio",
            "--no-first-run",
            "--metrics-recording-only",
            "--blink-settings=imagesEnabled=false",
            "--renderer-process-limit=1",
            "--js-flags=--max-old-space-size=128",
        ]
        proxy_url = self.store.get_proxy_url()
        launch_kwargs: dict[str, Any] = {"headless": True, "args": launch_args}
        if proxy_url:
            launch_kwargs["proxy"] = {"server": proxy_url}

        logger.info("Launching on-demand headless Chromium for video sniffing...")
        self._browser = await self._pw.chromium.launch(**launch_kwargs)
        self._last_used = time.monotonic()
        self._schedule_reaper()
        return self._browser

    def _schedule_reaper(self) -> None:
        if self._reaper_task and not self._reaper_task.done():
            return
        self._reaper_task = asyncio.create_task(self._idle_reaper())

    async def _idle_reaper(self) -> None:
        while True:
            await asyncio.sleep(10)
            if self._browser is None:
                return
            if self._browser_lock.locked():
                continue
            if (time.monotonic() - self._last_used) >= PLAYWRIGHT_IDLE_SECONDS:
                async with self._browser_lock:
                    if self._browser is not None and (time.monotonic() - self._last_used) >= PLAYWRIGHT_IDLE_SECONDS:
                        logger.info("Closing idle headless Chromium to reclaim RAM.")
                        await self._close_browser_unlocked()
                        return

    async def _close_browser_unlocked(self) -> None:
        if self._browser is not None:
            try:
                await self._browser.close()
            except Exception:
                pass
            self._browser = None
        if self._pw is not None:
            try:
                await self._pw.stop()
            except Exception:
                pass
            self._pw = None

    async def dispose(self) -> None:
        if self._reaper_task:
            self._reaper_task.cancel()
        async with self._browser_lock:
            await self._close_browser_unlocked()

    async def _resolve_static(self, plugin: dict[str, Any], episode_url: str, ua: str, referer: str) -> Optional[str]:
        # 1. Unwrap player wrapper URLs (e.g. atom.php?key=0&url=https://.../playlist.m3u8) FIRST
        decoded_direct = decode_video_source(episode_url)
        if decoded_direct != episode_url and decoded_direct.startswith(("http://", "https://")):
            return decoded_direct
        # 2. Only treat episode_url as direct media if its URL PATH (not query string) ends with a media extension
        ep_path = urlparse(episode_url).path
        if re.search(r"\.(?:m3u8|mp4|flv|webm)$", ep_path, flags=re.IGNORECASE):
            return episode_url

        proxy = self.store.get_proxy_url()
        cookie_header = cookie_store.get_cookie_header(plugin["name"], episode_url)
        headers = {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": get_random_accept_language(),
        }
        if referer:
            headers["Referer"] = referer
        if cookie_header:
            headers["Cookie"] = cookie_header

        visited: set[str] = set()
        queue: list[tuple[str, str, int]] = [(episode_url, referer, 0)]

        async with httpx.AsyncClient(
            timeout=httpx.Timeout(6.0, connect=4.0),
            follow_redirects=True,
            proxy=proxy,
            verify=False,
        ) as client:
            while queue:
                curr_url, curr_ref, depth = queue.pop(0)
                if curr_url in visited or depth > 2:
                    continue
                visited.add(curr_url)
                req_h = dict(headers)
                if curr_ref:
                    req_h["Referer"] = curr_ref
                try:
                    resp = await client.get(curr_url, headers=req_h)
                except Exception:
                    continue
                ct = (resp.headers.get("content-type") or "").lower()
                if "mpegurl" in ct or resp.text.lstrip().startswith("#EXTM3U") or ct.startswith("video/"):
                    return str(resp.url)
                found, iframes = _extract_media_from_html(resp.text, str(resp.url))
                if found:
                    return found
                for iframe_url in iframes[:2]:
                    if iframe_url not in visited:
                        queue.append((iframe_url, str(resp.url), depth + 1))
        return None

    async def _resolve_playwright(
        self,
        plugin: dict[str, Any],
        episode_url: str,
        ua: str,
        referer: str,
        timeout_sec: int,
    ) -> str:
        use_legacy = bool(plugin.get("useLegacyParser"))
        found_future: asyncio.Future[str] = asyncio.get_running_loop().create_future()

        def _accept(candidate: str) -> None:
            if found_future.done():
                return
            url = (candidate or "").strip()
            if not url or not url.startswith(("http://", "https://")) or _is_ad_url(url):
                return
            found_future.set_result(url)

        async with self._browser_lock:
            browser = await self._ensure_browser()
            context = await browser.new_context(
                user_agent=ua,
                ignore_https_errors=True,
                viewport={"width": 1280, "height": 720},
                extra_http_headers={"Referer": referer} if referer else {},
            )
            try:
                await context.add_init_script(KAZUMI_INIT_SCRIPT)
                page = await context.new_page()

                # Block heavy assets & ads to save RAM and speed up resolution
                async def _route_filter(route: Any) -> None:
                    req = route.request
                    r_type = req.resource_type
                    r_url = req.url
                    if _is_ad_url(r_url) or r_type in {"image", "font", "stylesheet", "manifest", "other"}:
                        await route.abort()
                        return
                    if r_type == "media" and r_url.startswith(("http://", "https://")) and not _is_ad_url(r_url):
                        _accept(r_url)
                        await route.abort()
                        return
                    if re.search(r"\.(?:m3u8|mp4)(?:\?|$)", urlparse(r_url).path, flags=re.IGNORECASE) and not _is_ad_url(r_url):
                        _accept(r_url)
                    await route.continue_()

                await page.route("**/*", _route_filter)

                def _on_report(_source: Any, message: str) -> None:
                    if message.startswith("videoMessage:"):
                        raw = message[len("videoMessage:") :]
                        if raw.startswith("//"):
                            raw = "https:" + raw
                        _accept(raw)
                    elif message.startswith("iframeMessage:") and use_legacy:
                        raw = message[len("iframeMessage:") :]
                        if raw.startswith("//"):
                            raw = "https:" + raw
                        decoded = decode_video_source(raw)
                        if decoded != raw:
                            _accept(decoded)

                await page.expose_binding("__kazumiReport", _on_report)

                async def _on_response(response: Any) -> None:
                    if found_future.done():
                        return
                    r_url = response.url
                    if _is_ad_url(r_url):
                        return
                    ct = (response.headers.get("content-type") or "").lower()
                    if "mpegurl" in ct or "x-mpegurl" in ct:
                        _accept(r_url)
                        return
                    if ct.startswith("video/") and response.status in {200, 206}:
                        _accept(r_url)
                        return
                    if re.search(r"\.(?:m3u8|mp4)(?:\?|$)", r_url, flags=re.IGNORECASE):
                        _accept(r_url)
                        return
                    if "text" in ct or "octet-stream" in ct or "plain" in ct:
                        if "m3u8" in r_url.lower() or "hls" in r_url.lower() or "playlist" in r_url.lower():
                            try:
                                body = await response.text()
                                if body.lstrip().startswith("#EXTM3U"):
                                    _accept(r_url)
                            except Exception:
                                pass

                page.on("response", lambda r: asyncio.create_task(_on_response(r)))

                nav_task = asyncio.create_task(
                    page.goto(episode_url, wait_until="domcontentloaded", timeout=timeout_sec * 1000)
                )
                try:
                    result = await asyncio.wait_for(found_future, timeout=timeout_sec)
                    return result
                except asyncio.TimeoutError as exc:
                    raise TimeoutError(f"视频源解析超时（{timeout_sec}秒）") from exc
                finally:
                    if not nav_task.done():
                        nav_task.cancel()
                        try:
                            await nav_task
                        except BaseException:
                            pass
            finally:
                self._last_used = time.monotonic()
                try:
                    await context.close()
                except Exception:
                    pass

    async def resolve(self, plugin: dict[str, Any], episode_url: str) -> ResolvedVideo:
        plugin = normalize_plugin_dict(plugin)
        cache_key = (plugin["name"], episode_url)
        now = time.monotonic()

        cached = self._cache.get(cache_key)
        if cached and (now - cached[0]) < self.CACHE_TTL_SECONDS:
            logger.info("Resolved [%s] via cache hit -> %s", plugin["name"], cached[1].url)
            return cached[1]

        inflight = self._inflight.get(cache_key)
        if inflight and not inflight.done():
            return await inflight

        task = asyncio.create_task(self._resolve_uncached(plugin, episode_url))
        self._inflight[cache_key] = task
        try:
            result = await task
            if len(self._cache) >= self.CACHE_MAX_SIZE:
                oldest = next(iter(self._cache))
                self._cache.pop(oldest, None)
            self._cache[cache_key] = (time.monotonic(), result)
            return result
        finally:
            self._inflight.pop(cache_key, None)

    async def _resolve_uncached(self, plugin: dict[str, Any], episode_url: str) -> ResolvedVideo:
        ua = str(plugin.get("userAgent") or "").strip() or get_random_ua()
        explicit_referer = str(plugin.get("referer") or "").strip()
        page_referer = explicit_referer or str(plugin.get("baseURL") or "").strip()
        mode = str(self.store.get_settings().get("resolverMode") or "auto")
        plugin_key = plugin["name"].lower()

        # Always try zero-cost URL unwrap / direct media check first
        decoded_direct = decode_video_source(episode_url)
        if decoded_direct != episode_url and decoded_direct.startswith(("http://", "https://")):
            logger.info("Resolved [%s] via direct unwrap -> %s", plugin["name"], decoded_direct)
            return ResolvedVideo(url=decoded_direct, method="static", referer=explicit_referer, user_agent=ua)
        if re.search(r"\.(?:m3u8|mp4|flv|webm)$", urlparse(episode_url).path, flags=re.IGNORECASE):
            logger.info("Resolved [%s] via direct media URL -> %s", plugin["name"], episode_url)
            return ResolvedVideo(url=episode_url, method="static", referer=explicit_referer, user_agent=ua)

        # Adaptive fast-path: skip slow static HTML crawl if this plugin recently needed Playwright
        pw_hint_ts = self._playwright_hints.get(plugin_key, 0.0)
        prefer_browser = (mode == "auto" and PLAYWRIGHT_ENABLED and (time.monotonic() - pw_hint_ts) < self.PLAYWRIGHT_HINT_TTL)

        if mode != "browser" and not prefer_browser:
            static_url = await self._resolve_static(plugin, episode_url, ua, page_referer)
            if static_url:
                self._playwright_hints.pop(plugin_key, None)
                logger.info("Resolved [%s] via static extractor -> %s", plugin["name"], static_url)
                return ResolvedVideo(url=static_url, method="static", referer=explicit_referer, user_agent=ua)
            if mode == "static" or not PLAYWRIGHT_ENABLED:
                raise RuntimeError("静态解析未能提取到直链，请在设置中启用智能双引擎或无头浏览器解析")

        if not PLAYWRIGHT_ENABLED:
            raise RuntimeError("当前服务未启用 Playwright 浏览器解析（PLAYWRIGHT_ENABLED=false）")

        pw_url = await self._resolve_playwright(plugin, episode_url, ua, page_referer, RESOLVE_TIMEOUT_SECONDS)
        self._playwright_hints[plugin_key] = time.monotonic()
        logger.info("Resolved [%s] via Playwright Chromium -> %s", plugin["name"], pw_url)
        return ResolvedVideo(url=pw_url, method="playwright", referer=explicit_referer, user_agent=ua)


# ============================================================
# Anti-Crawler Captcha Verification Flow (Playwright-backed)
# ============================================================


class CaptchaSessionManager:
    """Port of KazumiWeb CaptchaFlow for anti-crawler sites (e.g. mutefun)."""

    def __init__(self, resolver: DualStageVideoResolver) -> None:
        self.resolver = resolver
        self._lock = asyncio.Lock()
        self._context: Any = None
        self._page: Any = None
        self._plugin: Optional[dict[str, Any]] = None
        self._ua: str = ""

    async def cancel(self) -> None:
        async with self._lock:
            await self._save_cookies_and_close_unlocked()

    async def _save_cookies_and_close_unlocked(self) -> None:
        if self._context is not None and self._plugin is not None:
            try:
                cookies = await self._context.cookies()
                if cookies:
                    cookie_store.save(self._plugin["name"], cookies, self._ua)
            except Exception:
                pass
        if self._context is not None:
            try:
                await self._context.close()
            except Exception:
                pass
        self._context = None
        self._page = None
        self._plugin = None

    async def start(self, plugin: dict[str, Any], keyword: str) -> dict[str, Any]:
        if not PLAYWRIGHT_ENABLED:
            raise RuntimeError("人机验证需要启用 Playwright 无头浏览器")
        plugin = normalize_plugin_dict(plugin)
        anti = plugin.get("antiCrawlerConfig") or {}
        if not anti.get("enabled"):
            raise ValueError("该规则未启用反反爬虫配置")

        from urllib.parse import quote

        search_url = str(plugin.get("searchURL") or "").replace("@keyword", quote(keyword))
        if not search_url:
            raise ValueError("搜索地址为空")

        async with self._lock:
            await self._save_cookies_and_close_unlocked()
            browser = await self.resolver._ensure_browser()
            ua = str(plugin.get("userAgent") or "").strip() or get_random_ua()
            context = await browser.new_context(user_agent=ua, ignore_https_errors=True)
            page = await context.new_page()
            self._context = context
            self._page = page
            self._plugin = plugin
            self._ua = ua

            await page.goto(search_url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(1.0)

            ctype = int(anti.get("captchaType") or 1)
            if ctype == 2:  # autoClickButton
                btn_xpath = str(anti.get("captchaButton") or "").strip()
                if btn_xpath:
                    loc = page.locator(f"xpath={btn_xpath}").first
                    await loc.click(timeout=8000)
                    await asyncio.sleep(2.5)
                await self._save_cookies_and_close_unlocked()
                return {"status": "verified"}

            if ctype == 3:  # customJavaScript
                script = str(anti.get("captchaScript") or "").strip()
                if script:
                    await page.evaluate(script)
                    await asyncio.sleep(2.5)
                await self._save_cookies_and_close_unlocked()
                return {"status": "verified"}

            # captchaType == 1: imageCaptcha
            img_xpath = str(anti.get("captchaImage") or "").strip()
            if not img_xpath:
                raise ValueError("规则未配置验证码图片 XPath")
            img_loc = page.locator(f"xpath={img_xpath}").first
            await img_loc.wait_for(state="visible", timeout=10000)
            png_bytes = await img_loc.screenshot()
            b64 = base64.b64encode(png_bytes).decode("ascii")
            return {"status": "challenge", "image": f"data:image/png;base64,{b64}"}

    async def submit(self, plugin_name: str, code: str) -> bool:
        async with self._lock:
            if not self._page or not self._plugin:
                raise RuntimeError("没有进行中的验证码会话，请重新开始验证")
            anti = self._plugin.get("antiCrawlerConfig") or {}
            input_xpath = str(anti.get("captchaInput") or "").strip()
            btn_xpath = str(anti.get("captchaButton") or "").strip()
            if input_xpath:
                await self._page.locator(f"xpath={input_xpath}").first.fill(code)
            if btn_xpath:
                await self._page.locator(f"xpath={btn_xpath}").first.click()
            await asyncio.sleep(2.5)

            cookies = await self._context.cookies()
            if cookies:
                cookie_store.save(self._plugin["name"], cookies, self._ua)

            # Check if captcha image disappeared
            img_xpath = str(anti.get("captchaImage") or "").strip()
            still_captcha = False
            if img_xpath:
                try:
                    still_captcha = await self._page.locator(f"xpath={img_xpath}").count() > 0
                except Exception:
                    still_captcha = False
            if not still_captcha:
                await self._save_cookies_and_close_unlocked()
                return True
            return False
