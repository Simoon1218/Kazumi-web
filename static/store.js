"use strict";

/**
 * Hybrid Browser + Server Persistence (KazumiStore)
 *
 * Render Free Tier wipes server disk after 15 min idle sleep.
 * KazumiStore keeps a durable mirror of rules, collects, watch histories,
 * danmaku shields, custom aliases, keyboard shortcuts, and player/danmaku prefs
 * inside browser localStorage, and transparently hydrates the Render container
 * on startup so zero data is ever lost across cold restarts.
 */
const KAZUMI_STORE_KEYS = {
  plugins: "kazumi_plugins_v1",
  collects: "kazumi_collects_v1",
  histories: "kazumi_histories_v1",
  shields: "kazumi_shields_v1",
  shortcuts: "kazumi_shortcuts_v1",
  playerPrefs: "playerPrefs",
  danmakuPrefs: "danmakuConfig",
  customAliases: "kazumi_aliases_v1",
};

const DEFAULT_SHORTCUTS = {
  playorpause: " ",
  forward: "ArrowRight",
  rewind: "ArrowLeft",
  next: "n",
  prev: "p",
  volumeup: "ArrowUp",
  volumedown: "ArrowDown",
  togglemute: "m",
  fullscreen: "f",
  webfullscreen: "w",
  toggledanmaku: "d",
  screenshot: "s",
  skip: "k",
  speed1: "1",
  speed2: "2",
  speed3: "3",
  speedup: "x",
  speeddown: "z",
};

const SHORTCUT_LABELS = {
  playorpause: "播放 / 暂停",
  forward: "快进 5 秒（长按倍速）",
  rewind: "快退 5 秒",
  next: "下一集",
  prev: "上一集",
  volumeup: "音量增加",
  volumedown: "音量减少",
  togglemute: "静音切换",
  fullscreen: "全屏切换",
  webfullscreen: "网页全屏",
  toggledanmaku: "弹幕开关",
  screenshot: "视频截图",
  skip: "跳过片头（默认 80 秒）",
  speed1: "倍速 1.0x",
  speed2: "倍速 2.0x",
  speed3: "倍速 3.0x",
  speedup: "加快倍速",
  speeddown: "减慢倍速",
};

function _readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_) {
    return fallback;
  }
}

function _writeLS(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {}
}

const KazumiStore = {
  // ---- Plugins ----
  getPlugins() {
    const list = _readLS(KAZUMI_STORE_KEYS.plugins, []);
    return Array.isArray(list) ? list : [];
  },
  setPlugins(list) {
    if (Array.isArray(list)) _writeLS(KAZUMI_STORE_KEYS.plugins, list);
  },

  // ---- Collects ----
  getCollectsMap() {
    const obj = _readLS(KAZUMI_STORE_KEYS.collects, {});
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  },
  getCollectsList() {
    return Object.values(this.getCollectsMap()).sort((a, b) => (b.time || 0) - (a.time || 0));
  },
  saveCollectRecord(record) {
    if (!record || !record.bangumiId) return;
    const map = this.getCollectsMap();
    if (!record.type) delete map[String(record.bangumiId)];
    else map[String(record.bangumiId)] = record;
    _writeLS(KAZUMI_STORE_KEYS.collects, map);
  },
  setCollectsFromList(items) {
    const map = {};
    for (const c of items || []) {
      if (c && c.bangumiId && c.type) map[String(c.bangumiId)] = c;
    }
    _writeLS(KAZUMI_STORE_KEYS.collects, map);
  },

  // ---- Histories ----
  getHistoriesMap() {
    const obj = _readLS(KAZUMI_STORE_KEYS.histories, {});
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  },
  getHistoriesList() {
    return Object.values(this.getHistoriesMap()).sort((a, b) => (b.lastWatchTime || 0) - (a.lastWatchTime || 0));
  },
  saveHistoryRecord(record) {
    if (!record || !record.bangumiId || !record.pluginName) return;
    const map = this.getHistoriesMap();
    map[record.pluginName + "::" + record.bangumiId] = record;
    _writeLS(KAZUMI_STORE_KEYS.histories, map);
  },
  removeHistoryRecord(pluginName, bangumiId) {
    const map = this.getHistoriesMap();
    delete map[pluginName + "::" + bangumiId];
    _writeLS(KAZUMI_STORE_KEYS.histories, map);
  },
  clearHistories() {
    _writeLS(KAZUMI_STORE_KEYS.histories, {});
  },
  setHistoriesFromList(items) {
    const map = {};
    for (const h of items || []) {
      if (h && h.bangumiId && h.pluginName) map[h.pluginName + "::" + h.bangumiId] = h;
    }
    _writeLS(KAZUMI_STORE_KEYS.histories, map);
  },

  // ---- Danmaku Shields ----
  getShields() {
    const arr = _readLS(KAZUMI_STORE_KEYS.shields, []);
    return Array.isArray(arr) ? arr : [];
  },
  setShields(arr) {
    if (Array.isArray(arr)) _writeLS(KAZUMI_STORE_KEYS.shields, arr);
  },

  // ---- Custom Bangumi Aliases ----
  getAliases(bid) {
    const map = _readLS(KAZUMI_STORE_KEYS.customAliases, {});
    const arr = map[String(bid)];
    return Array.isArray(arr) ? arr : [];
  },
  addAlias(bid, alias) {
    const a = (alias || "").trim();
    if (!a) return;
    const map = _readLS(KAZUMI_STORE_KEYS.customAliases, {});
    const arr = Array.isArray(map[String(bid)]) ? map[String(bid)] : [];
    if (!arr.includes(a)) arr.push(a);
    map[String(bid)] = arr;
    _writeLS(KAZUMI_STORE_KEYS.customAliases, map);
  },
  removeAlias(bid, alias) {
    const map = _readLS(KAZUMI_STORE_KEYS.customAliases, {});
    const arr = Array.isArray(map[String(bid)]) ? map[String(bid)].filter((x) => x !== alias) : [];
    map[String(bid)] = arr;
    _writeLS(KAZUMI_STORE_KEYS.customAliases, map);
  },

  // ---- Keyboard Shortcuts ----
  getShortcuts() {
    return Object.assign({}, DEFAULT_SHORTCUTS, _readLS(KAZUMI_STORE_KEYS.shortcuts, {}));
  },
  setShortcuts(obj) {
    _writeLS(KAZUMI_STORE_KEYS.shortcuts, obj);
  },
  resetShortcuts() {
    localStorage.removeItem(KAZUMI_STORE_KEYS.shortcuts);
  },

  // ---- Player Preferences ----
  getPlayerPrefs() {
    const d = {
      rate: 1.0,
      fit: "contain",
      autoNext: true,
      skipSeconds: 80,
      superRes: "off", // off | fast | quality
      autoResume: true,
      volume: 1.0,
    };
    return Object.assign(d, _readLS(KAZUMI_STORE_KEYS.playerPrefs, {}));
  },
  setPlayerPrefs(patch) {
    const next = Object.assign(this.getPlayerPrefs(), patch);
    _writeLS(KAZUMI_STORE_KEYS.playerPrefs, next);
    return next;
  },

  // ---- Danmaku Preferences ----
  getDanmakuPrefs() {
    const d = {
      enabled: true,
      fontSize: 22,
      opacity: 0.85,
      speed: 10,
      area: 0.75,
      bold: true,
      stroke: true,
      hideTop: false,
      hideBottom: false,
      hideRolling: false,
      hideColor: false,
      mergeDuplicate: true,
      timeOffset: 0,
    };
    return Object.assign(d, _readLS(KAZUMI_STORE_KEYS.danmakuPrefs, {}));
  },
  setDanmakuPrefs(patch) {
    const next = Object.assign(this.getDanmakuPrefs(), patch);
    _writeLS(KAZUMI_STORE_KEYS.danmakuPrefs, next);
    return next;
  },

  // ---- Full Backup Export / Import ----
  buildFullBackup() {
    return {
      schema: "kazumi-web-backup-v1",
      exportedAt: Date.now(),
      plugins: this.getPlugins(),
      collects: this.getCollectsList(),
      histories: this.getHistoriesList(),
      shields: this.getShields(),
      shortcuts: this.getShortcuts(),
      playerPrefs: this.getPlayerPrefs(),
      danmakuPrefs: this.getDanmakuPrefs(),
      themePrefs: getThemePrefs(),
    };
  },

  applyFullBackup(data) {
    if (!data || typeof data !== "object") return;
    if (Array.isArray(data.plugins)) this.setPlugins(data.plugins);
    if (Array.isArray(data.collects)) this.setCollectsFromList(data.collects);
    if (Array.isArray(data.histories)) this.setHistoriesFromList(data.histories);
    if (Array.isArray(data.shields)) this.setShields(data.shields);
    if (data.shortcuts && typeof data.shortcuts === "object") this.setShortcuts(data.shortcuts);
    if (data.playerPrefs && typeof data.playerPrefs === "object") this.setPlayerPrefs(data.playerPrefs);
    if (data.danmakuPrefs && typeof data.danmakuPrefs === "object") this.setDanmakuPrefs(data.danmakuPrefs);
    if (data.themePrefs && typeof data.themePrefs === "object") setThemePrefs(data.themePrefs);
  },

  // ---- Hydrate Render container on boot ----
  async syncWithServer() {
    try {
      const localPlugins = this.getPlugins();
      const localCollects = this.getCollectsList();
      const localHistories = this.getHistoriesList();
      const localShields = this.getShields();
      if (localPlugins.length || localCollects.length || localHistories.length || localShields.length) {
        await fetch("/api/sync/hydrate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            plugins: localPlugins,
            collects: localCollects,
            histories: localHistories,
            shields: localShields,
            overwrite: false,
          }),
        });
      }
      // Pull merged canonical copies back into localStorage
      const [pRes, cRes, hRes, sRes] = await Promise.all([
        fetch("/api/plugins?full=1").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/collect/list").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/history/list").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/danmaku/shields").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (Array.isArray(pRes) && pRes.length) this.setPlugins(pRes);
      if (cRes && Array.isArray(cRes.items) && cRes.items.length) this.setCollectsFromList(cRes.items);
      if (hRes && Array.isArray(hRes.items) && hRes.items.length) this.setHistoriesFromList(hRes.items);
      if (sRes && Array.isArray(sRes.items) && sRes.items.length) this.setShields(sRes.items);
    } catch (_) {
      // Offline / unauthenticated — silent
    }
  },

  async refreshLocalPluginsFromServer() {
    try {
      const res = await fetch("/api/plugins?full=1");
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) this.setPlugins(list);
      }
    } catch (_) {}
  },

  estimateLocalStorageBytes() {
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k) || "";
        total += (k.length + v.length) * 2;
      }
    } catch (_) {}
    return total;
  },
};
