from __future__ import annotations

import logging
import os
import random
import secrets
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

APP_VERSION = "2.4.6-web.1"
API_LEVEL = 9
UPSTREAM_REPO = "https://github.com/Predidit/Kazumi"
WEB_REPO = "https://github.com/Simoon1218/Kazumi-web"

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
BUNDLED_RULES_FILE = BASE_DIR / "data" / "bundled_rules.json"

DATA_DIR = Path(os.getenv("DATA_DIR", str(BASE_DIR / "data" / "runtime")))
DATA_DIR.mkdir(parents=True, exist_ok=True)

PORT = int(os.getenv("PORT", os.getenv("KAZUMI_WEB_PORT", "8333")))
ACCESS_PASSWORD = os.getenv("ACCESS_PASSWORD", "").strip()
AUTH_SECRET = os.getenv("AUTH_SECRET", "").strip() or secrets.token_hex(32)

# DanDanPlay Open Platform credentials (optional; set via Render Env Vars)
DANDANAPI_APPID = os.getenv("DANDANAPI_APPID", "").strip()
DANDANAPI_KEY = os.getenv("DANDANAPI_KEY", "").strip()
DANDAN_API_DOMAIN = os.getenv("DANDAN_API_DOMAIN", "https://api.dandanplay.net").strip().rstrip("/")

# Optional outbound HTTP/SOCKS proxy (e.g. http://127.0.0.1:7890)
DEFAULT_PROXY_URL = os.getenv("KAZUMI_PROXY", "").strip()

# Video resolver controls (tuned for Render 512MB RAM)
PLAYWRIGHT_ENABLED = os.getenv("PLAYWRIGHT_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}
PLAYWRIGHT_IDLE_SECONDS = max(15, int(os.getenv("PLAYWRIGHT_IDLE_SECONDS", "45")))
RESOLVE_TIMEOUT_SECONDS = max(10, int(os.getenv("RESOLVE_TIMEOUT_SECONDS", "25")))

# Auto-seed starter rules on an empty runtime store (comma-separated rule names or "recommended" or "none")
AUTO_INSTALL_RULES = os.getenv("AUTO_INSTALL_RULES", "recommended").strip()
RECOMMENDED_RULES = ["giriGiriLove", "LMM", "AGE", "MXdm", "dalvdm", "moonci", "TvTFun", "xfdmnext"]

# Official rule repository & mirrors (aligned with Predidit/Kazumi api_endpoints.dart)
OFFICIAL_RULE_REPO = "https://raw.githubusercontent.com/Predidit/KazumiRules/main/"
RULE_REPO_MIRRORS = [
    "https://gh-proxy.org/https://raw.githubusercontent.com/Predidit/KazumiRules/main/",
    "https://ghfast.top/https://raw.githubusercontent.com/Predidit/KazumiRules/main/",
    "https://raw.gitcode.com/gh_mirrors/ka/KazumiRules/raw/main/",
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.1",
]

ACCEPT_LANGUAGES = [
    "zh-CN,zh;q=0.9",
    "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "zh-CN,zh-TW;q=0.9,zh;q=0.8,en-US;q=0.7,en;q=0.6",
]

BANGUMI_USER_AGENT = f"Predidit/Kazumi/{APP_VERSION} (Web) ({UPSTREAM_REPO})"


def get_random_ua() -> str:
    return random.choice(USER_AGENTS)


def get_random_accept_language() -> str:
    return random.choice(ACCEPT_LANGUAGES)


class RingLogHandler(logging.Handler):
    """In-memory ring buffer so users can inspect live runtime logs in Settings -> Storage & Logs."""

    def __init__(self, maxlen: int = 300) -> None:
        super().__init__()
        self.records: deque[dict[str, Any]] = deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            ts = datetime.fromtimestamp(record.created, tz=timezone.utc).strftime("%H:%M:%S")
            self.records.append(
                {
                    "time": ts,
                    "level": record.levelname,
                    "logger": record.name,
                    "message": self.format(record),
                }
            )
        except Exception:
            pass

    def get_logs(self) -> list[dict[str, Any]]:
        return list(self.records)

    def clear(self) -> None:
        self.records.clear()


ring_log_handler = RingLogHandler(maxlen=300)
ring_log_handler.setFormatter(logging.Formatter("%(message)s"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("kazumi")
logger.addHandler(ring_log_handler)
