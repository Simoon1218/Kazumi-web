from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any, Optional

from app.config import (
    AUTO_INSTALL_RULES,
    BUNDLED_RULES_FILE,
    DANDAN_API_DOMAIN,
    DATA_DIR,
    DEFAULT_PROXY_URL,
    RECOMMENDED_RULES,
    logger,
)


def plugin_name_key(name: str) -> str:
    return (name or "").strip().lower()


DEFAULT_SETTINGS: dict[str, Any] = {
    "enableBangumiProxy": False,
    "enableGitProxy": False,
    "proxyEnable": bool(DEFAULT_PROXY_URL),
    "proxyUrl": DEFAULT_PROXY_URL,
    "ruleRepositoryUrl": "",
    "danmakuApiDomain": DANDAN_API_DOMAIN,
    "danmakuChConvert": 0,  # 0=none, 1=simplified, 2=traditional
    "resolverMode": "auto",  # auto | static | browser
    "bangumiToken": "",
    "bangumiUsername": "",
    "bangumiAutoSync": False,
    "webdavUrl": "",
    "webdavUsername": "",
    "webdavPassword": "",
    "webdavPath": "/kazumiSync",
}


class RuntimeStore:
    """Thread-safe JSON persistence with bundled KazumiRules fallback and Render cold-start hydration."""

    def __init__(self, data_dir: Path = DATA_DIR) -> None:
        self._lock = threading.RLock()
        self.data_dir = data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._settings_path = self.data_dir / "settings.json"
        self._plugins_path = self.data_dir / "plugins.json"
        self._collects_path = self.data_dir / "collects.json"
        self._histories_path = self.data_dir / "histories.json"
        self._shields_path = self.data_dir / "shields.json"

        self.settings: dict[str, Any] = dict(DEFAULT_SETTINGS)
        self.plugins: list[dict[str, Any]] = []
        self.collects: dict[str, dict[str, Any]] = {}  # str(bangumiId) -> record
        self.histories: dict[str, dict[str, Any]] = {}  # f"{plugin}::{bangumiId}" -> record
        self.shields: list[str] = []
        self._bundled_cache: Optional[dict[str, Any]] = None

        self._load_all()

    def _read_json(self, path: Path, default: Any) -> Any:
        if not path.exists():
            return default
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("Failed reading %s: %s", path.name, exc)
            return default

    def _write_json(self, path: Path, data: Any) -> None:
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def load_bundled_rules(self) -> dict[str, Any]:
        if self._bundled_cache is None:
            self._bundled_cache = self._read_json(BUNDLED_RULES_FILE, {"catalog": [], "rules": {}})
        return self._bundled_cache

    def _load_all(self) -> None:
        with self._lock:
            saved_settings = self._read_json(self._settings_path, {})
            if isinstance(saved_settings, dict):
                self.settings.update(saved_settings)

            saved_plugins = self._read_json(self._plugins_path, None)
            if isinstance(saved_plugins, list):
                self.plugins = saved_plugins
            else:
                self.plugins = []
                self._seed_initial_rules()

            saved_collects = self._read_json(self._collects_path, {})
            if isinstance(saved_collects, dict):
                self.collects = saved_collects

            saved_histories = self._read_json(self._histories_path, {})
            if isinstance(saved_histories, dict):
                self.histories = saved_histories

            saved_shields = self._read_json(self._shields_path, [])
            if isinstance(saved_shields, list):
                self.shields = [str(x) for x in saved_shields if str(x).strip()]

    def _seed_initial_rules(self) -> None:
        mode = AUTO_INSTALL_RULES.lower()
        if not mode or mode in {"none", "false", "0"}:
            return
        bundled = self.load_bundled_rules()
        rules_map = bundled.get("rules", {})
        if not isinstance(rules_map, dict) or not rules_map:
            return
        if mode == "all":
            names = list(rules_map.keys())
        elif mode == "recommended":
            names = [n for n in RECOMMENDED_RULES if n in rules_map]
        else:
            names = [x.strip() for x in AUTO_INSTALL_RULES.split(",") if x.strip() in rules_map]
        for name in names:
            rule = rules_map.get(name)
            if isinstance(rule, dict):
                self.plugins.append(rule)
        if self.plugins:
            self._write_json(self._plugins_path, self.plugins)
            logger.info("Seeded %d starter Kazumi rules (%s)", len(self.plugins), mode)

    # ---------- Settings ----------
    def get_settings(self) -> dict[str, Any]:
        with self._lock:
            return dict(self.settings)

    def get_public_settings(self) -> dict[str, Any]:
        with self._lock:
            s = dict(self.settings)
            # Mask secret values slightly for UI convenience while keeping functionality
            s["hasDandanCredentials"] = bool(
                (self.settings.get("danmakuApiDomain") and self.settings.get("danmakuApiDomain") != "https://api.dandanplay.net")
                or self._has_env_dandan()
            )
            return s

    @staticmethod
    def _has_env_dandan() -> bool:
        from app.config import DANDANAPI_APPID, DANDANAPI_KEY

        return bool(DANDANAPI_APPID and DANDANAPI_KEY)

    def update_settings(self, patch: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            for k, v in patch.items():
                if k in DEFAULT_SETTINGS:
                    self.settings[k] = v
            self._write_json(self._settings_path, self.settings)
            return self.get_public_settings()

    def get_proxy_url(self) -> Optional[str]:
        with self._lock:
            if not self.settings.get("proxyEnable"):
                return None
            url = str(self.settings.get("proxyUrl") or "").strip()
            if not url:
                return None
            if "://" not in url:
                url = f"http://{url}"
            return url

    # ---------- Plugins ----------
    def list_plugins(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(p) for p in self.plugins]

    def find_plugin(self, name: str) -> Optional[dict[str, Any]]:
        target = plugin_name_key(name)
        with self._lock:
            for p in self.plugins:
                if plugin_name_key(str(p.get("name", ""))) == target:
                    return dict(p)
        return None

    def upsert_plugin(self, plugin: dict[str, Any]) -> dict[str, Any]:
        key = plugin_name_key(str(plugin.get("name", "")))
        if not key:
            raise ValueError("规则名称不能为空")
        with self._lock:
            replaced = False
            for idx, existing in enumerate(self.plugins):
                if plugin_name_key(str(existing.get("name", ""))) == key:
                    self.plugins[idx] = plugin
                    replaced = True
                    break
            if not replaced:
                self.plugins.append(plugin)
            self._write_json(self._plugins_path, self.plugins)
            return dict(plugin)

    def upsert_plugins(self, plugins: list[dict[str, Any]]) -> int:
        count = 0
        with self._lock:
            for plugin in plugins:
                key = plugin_name_key(str(plugin.get("name", "")))
                if not key:
                    continue
                replaced = False
                for idx, existing in enumerate(self.plugins):
                    if plugin_name_key(str(existing.get("name", ""))) == key:
                        self.plugins[idx] = plugin
                        replaced = True
                        break
                if not replaced:
                    self.plugins.append(plugin)
                count += 1
            if count:
                self._write_json(self._plugins_path, self.plugins)
        return count

    def remove_plugin(self, name: str) -> bool:
        target = plugin_name_key(name)
        with self._lock:
            before = len(self.plugins)
            self.plugins = [p for p in self.plugins if plugin_name_key(str(p.get("name", ""))) != target]
            changed = len(self.plugins) != before
            if changed:
                self._write_json(self._plugins_path, self.plugins)
            return changed

    def reorder_plugins(self, ordered_names: list[str]) -> list[dict[str, Any]]:
        with self._lock:
            by_key = {plugin_name_key(str(p.get("name", ""))): p for p in self.plugins}
            reordered: list[dict[str, Any]] = []
            seen: set[str] = set()
            for name in ordered_names:
                k = plugin_name_key(name)
                if k in by_key and k not in seen:
                    reordered.append(by_key[k])
                    seen.add(k)
            for p in self.plugins:
                k = plugin_name_key(str(p.get("name", "")))
                if k not in seen:
                    reordered.append(p)
                    seen.add(k)
            self.plugins = reordered
            self._write_json(self._plugins_path, self.plugins)
            return [dict(p) for p in self.plugins]

    # ---------- Collects ----------
    def get_collect(self, bangumi_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            item = self.collects.get(str(bangumi_id))
            return dict(item) if item else None

    def list_collects(self, filter_type: Optional[int] = None) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self.collects.values())
            if filter_type and filter_type > 0:
                items = [c for c in items if c.get("type") == filter_type]
            items.sort(key=lambda x: x.get("time", 0), reverse=True)
            return [dict(c) for c in items]

    def put_collect(self, bangumi_id: int, collect_type: int, bangumi: dict[str, Any]) -> dict[str, Any]:
        now_ms = int(time.time() * 1000)
        with self._lock:
            key = str(bangumi_id)
            if collect_type <= 0:
                self.collects.pop(key, None)
                self._write_json(self._collects_path, self.collects)
                return {"bangumiId": bangumi_id, "type": 0, "time": now_ms}
            record = {
                "bangumiId": bangumi_id,
                "type": collect_type,
                "time": now_ms,
                "bangumi": bangumi,
            }
            self.collects[key] = record
            self._write_json(self._collects_path, self.collects)
            return dict(record)

    def delete_collect(self, bangumi_id: int) -> None:
        with self._lock:
            self.collects.pop(str(bangumi_id), None)
            self._write_json(self._collects_path, self.collects)

    # ---------- Histories ----------
    @staticmethod
    def _history_key(plugin_name: str, bangumi_id: int) -> str:
        return f"{plugin_name}::{bangumi_id}"

    def get_history(self, plugin_name: str, bangumi_id: int) -> Optional[dict[str, Any]]:
        with self._lock:
            item = self.histories.get(self._history_key(plugin_name, bangumi_id))
            return dict(item) if item else None

    def list_histories(self, device: Optional[str] = None) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self.histories.values())
            if device:
                filtered = [
                    h
                    for h in items
                    if not h.get("devices") or device in h.get("devices", []) or h.get("deviceId") == device
                ]
                items = filtered
            items.sort(key=lambda x: x.get("lastWatchTime", 0), reverse=True)
            return [dict(h) for h in items]

    def update_progress(
        self,
        *,
        bangumi_id: int,
        plugin_name: str,
        episode: int,
        road: int,
        progress_ms: int,
        last_src: str,
        episode_name: str,
        bangumi: dict[str, Any],
        device_id: Optional[str] = None,
        src: str = "",
    ) -> dict[str, Any]:
        now_ms = int(time.time() * 1000)
        key = self._history_key(plugin_name, bangumi_id)
        with self._lock:
            existing = self.histories.get(key) or {
                "bangumiId": bangumi_id,
                "pluginName": plugin_name,
                "progresses": {},
                "devices": [],
            }
            progresses = dict(existing.get("progresses") or {})
            progresses[str(episode)] = {
                "episode": episode,
                "road": road,
                "progressMs": progress_ms,
                "updatedAt": now_ms,
            }
            devices = list(existing.get("devices") or [])
            if device_id and device_id not in devices:
                devices.append(device_id)
            record = {
                "bangumiId": bangumi_id,
                "pluginName": plugin_name,
                "lastWatchEpisode": episode,
                "lastWatchEpisodeName": episode_name,
                "lastWatchTime": now_ms,
                "lastSrc": last_src or existing.get("lastSrc", ""),
                "src": src or existing.get("src", ""),
                "bangumi": bangumi or existing.get("bangumi", {}),
                "progresses": progresses,
                "devices": devices,
                "deviceId": device_id or existing.get("deviceId", ""),
            }
            self.histories[key] = record
            self._write_json(self._histories_path, self.histories)
            return dict(record)

    def delete_history(self, plugin_name: str, bangumi_id: int) -> None:
        with self._lock:
            self.histories.pop(self._history_key(plugin_name, bangumi_id), None)
            self._write_json(self._histories_path, self.histories)

    def clear_histories(self) -> None:
        with self._lock:
            self.histories.clear()
            self._write_json(self._histories_path, self.histories)

    # ---------- Danmaku Shields ----------
    def get_shields(self) -> list[str]:
        with self._lock:
            return list(self.shields)

    def set_shields(self, shields: list[str]) -> list[str]:
        with self._lock:
            deduped: list[str] = []
            seen: set[str] = set()
            for item in shields:
                s = str(item).strip()
                if s and len(s) <= 64 and s not in seen:
                    deduped.append(s)
                    seen.add(s)
            self.shields = deduped
            self._write_json(self._shields_path, self.shields)
            return list(self.shields)

    # ---------- Full Export / Import / Render Cold-Start Hydrate ----------
    def export_backup(self) -> dict[str, Any]:
        with self._lock:
            return {
                "schema": "kazumi-web-backup-v1",
                "exportedAt": int(time.time() * 1000),
                "plugins": self.plugins,
                "collects": list(self.collects.values()),
                "histories": list(self.histories.values()),
                "shields": self.shields,
                "settings": self.settings,
            }

    def hydrate_from_client(self, payload: dict[str, Any], overwrite: bool = False) -> dict[str, Any]:
        """Merges client localStorage state into server state (vital after Render Free Tier sleep/reset)."""
        with self._lock:
            added_plugins = 0
            added_collects = 0
            added_histories = 0

            client_plugins = payload.get("plugins")
            if isinstance(client_plugins, list):
                if overwrite:
                    self.plugins = [p for p in client_plugins if isinstance(p, dict) and p.get("name")]
                    added_plugins = len(self.plugins)
                    self._write_json(self._plugins_path, self.plugins)
                else:
                    existing_keys = {plugin_name_key(str(p.get("name", ""))) for p in self.plugins}
                    for p in client_plugins:
                        if not isinstance(p, dict) or not p.get("name"):
                            continue
                        k = plugin_name_key(str(p["name"]))
                        if k not in existing_keys:
                            self.plugins.append(p)
                            existing_keys.add(k)
                            added_plugins += 1
                    if added_plugins:
                        self._write_json(self._plugins_path, self.plugins)

            client_collects = payload.get("collects")
            if isinstance(client_collects, list):
                if overwrite:
                    self.collects = {}
                for c in client_collects:
                    if not isinstance(c, dict) or not c.get("bangumiId"):
                        continue
                    key = str(c["bangumiId"])
                    cur = self.collects.get(key)
                    if overwrite or not cur or (c.get("time", 0) > cur.get("time", 0)):
                        self.collects[key] = c
                        added_collects += 1
                if added_collects or overwrite:
                    self._write_json(self._collects_path, self.collects)

            client_histories = payload.get("histories")
            if isinstance(client_histories, list):
                if overwrite:
                    self.histories = {}
                for h in client_histories:
                    if not isinstance(h, dict) or not h.get("bangumiId") or not h.get("pluginName"):
                        continue
                    key = self._history_key(str(h["pluginName"]), int(h["bangumiId"]))
                    cur = self.histories.get(key)
                    if overwrite or not cur or (h.get("lastWatchTime", 0) > cur.get("lastWatchTime", 0)):
                        self.histories[key] = h
                        added_histories += 1
                if added_histories or overwrite:
                    self._write_json(self._histories_path, self.histories)

            client_shields = payload.get("shields")
            if isinstance(client_shields, list):
                if overwrite:
                    self.set_shields(client_shields)
                elif client_shields and not self.shields:
                    self.set_shields(client_shields)

            client_settings = payload.get("settings")
            if isinstance(client_settings, dict) and overwrite:
                for k, v in client_settings.items():
                    if k in DEFAULT_SETTINGS:
                        self.settings[k] = v
                self._write_json(self._settings_path, self.settings)

            return {
                "pluginsSynced": added_plugins,
                "collectsSynced": added_collects,
                "historiesSynced": added_histories,
                "totalPlugins": len(self.plugins),
            }


store = RuntimeStore()
