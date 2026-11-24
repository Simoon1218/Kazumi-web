"use strict";

/* ==========================================================================
 * Kazumi-web Video Player & Canvas Danmaku Engine
 * Full custom Material 3 Expressive player controls, HLS/MP4, Anime4K SVG
 * sharpening, screenshot, PiP, Web/Native Fullscreen, 18 customizable
 * shortcuts + hold-Right 2x, mobile gestures, Danmaku engine & source picker
 * ========================================================================== */

let _activePlayerDispose = null;

function disposePlayerResources() {
  if (typeof _activePlayerDispose === "function") {
    try { _activePlayerDispose(); } catch (_) {}
    _activePlayerDispose = null;
  }
}

let _hlsPromise = null;
function ensureHlsLib() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (!_hlsPromise) {
    _hlsPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "/assets/hls.min.js";
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error("无法加载 HLS 播放引擎 (/assets/hls.min.js)"));
      document.head.append(s);
    });
  }
  return _hlsPromise;
}

/* ==========================================================================
 * Danmaku Duplicate Merger & Canvas Renderer
 * ========================================================================== */
function mergeDuplicateDanmakus(items) {
  if (!Array.isArray(items) || items.length < 2) return items || [];
  const windowSec = 6.0;
  const recent = new Map();
  const out = [];
  for (const item of items) {
    const key = (item.message || "").trim().toLowerCase();
    if (!key) continue;
    const prev = recent.get(key);
    if (prev && Math.abs((item.time || 0) - prev.time) <= windowSec) {
      prev._count = (prev._count || 1) + 1;
      prev.displayMessage = prev.message + " ×" + prev._count;
    } else {
      const clone = Object.assign({}, item, { _count: 1, displayMessage: item.message });
      recent.set(key, clone);
      out.push(clone);
    }
  }
  return out;
}

function compileShields(list) {
  const matchers = [];
  for (const raw of (list || [])) {
    const s = String(raw || "").trim();
    if (!s) continue;
    if (s.length > 2 && s.startsWith("/") && s.endsWith("/")) {
      try {
        const re = new RegExp(s.slice(1, -1), "i");
        matchers.push((txt) => re.test(txt));
        continue;
      } catch (_) {}
    }
    const low = s.toLowerCase();
    matchers.push((txt) => txt.toLowerCase().includes(low));
  }
  return matchers;
}

class DanmakuLayer {
  constructor(canvas, video, prefs) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.video = video;
    this.prefs = Object.assign({}, prefs);
    this.rawItems = [];
    this.items = [];
    this.shields = compileShields(KazumiStore.getShields());
    this.active = [];
    this.cursor = 0;
    this.rafId = null;
    this.lastFrameTs = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this._ro = null;
    this._boundResize = () => this.resize();

    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this._ro = new ResizeObserver(this._boundResize);
      this._ro.observe(canvas);
    } else {
      window.addEventListener("resize", this._boundResize);
    }
    this.startLoop();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
  }

  setPrefs(patch) {
    Object.assign(this.prefs, patch);
    this.canvas.classList.toggle("is-hidden", !this.prefs.enabled);
    if ("mergeDuplicate" in patch) {
      this.rebuildItems();
    }
  }

  refreshShields() {
    this.shields = compileShields(KazumiStore.getShields());
    this.rebuildItems();
  }

  setItems(list) {
    this.rawItems = Array.isArray(list) ? list.slice().sort((a, b) => (a.time || 0) - (b.time || 0)) : [];
    this.rebuildItems();
  }

  rebuildItems() {
    let list = this.rawItems;
    if (this.shields.length) {
      list = list.filter((d) => {
        const m = d.message || "";
        return !this.shields.some((fn) => fn(m));
      });
    }
    this.items = this.prefs.mergeDuplicate ? mergeDuplicateDanmakus(list) : list.map((d) => Object.assign({}, d, { displayMessage: d.message }));
    this.seek(this.video.currentTime || 0);
  }

  seek(timeSec) {
    this.active = [];
    const target = timeSec + (Number(this.prefs.timeOffset) || 0);
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.items[mid].time || 0) < target - 0.25) lo = mid + 1;
      else hi = mid;
    }
    this.cursor = lo;
    this.clearCanvas();
  }

  sendLocal(text, mode = 1, color = 0xFFFFFF) {
    const msg = (text || "").trim();
    if (!msg) return;
    const d = {
      time: (this.video.currentTime || 0) + (Number(this.prefs.timeOffset) || 0),
      type: mode,
      color,
      message: msg,
      displayMessage: msg,
      local: true,
    };
    this.rawItems.push(d);
    this.spawn(d, true);
  }

  _colorCss(colorInt) {
    if (this.prefs.hideColor) return "#FFFFFF";
    const hex = (Number(colorInt || 0xFFFFFF) & 0xFFFFFF).toString(16).padStart(6, "0");
    return "#" + hex;
  }

  _fontString() {
    const scale = this.width < 520 ? 0.78 : (this.width > 1400 ? 1.15 : 1.0);
    const sz = Math.round((Number(this.prefs.fontSize) || 22) * scale);
    return (this.prefs.bold ? "700 " : "500 ") + sz + 'px "MiSans", system-ui, sans-serif';
  }

  _lineHeight() {
    const scale = this.width < 520 ? 0.78 : (this.width > 1400 ? 1.15 : 1.0);
    return Math.round(((Number(this.prefs.fontSize) || 22) * scale) * 1.32);
  }

  spawn(d, force = false) {
    if (!force && !this.prefs.enabled) return;
    const mode = Number(d.type) || 1;
    if (!force) {
      if (mode === 5 && this.prefs.hideTop) return;
      if (mode === 4 && this.prefs.hideBottom) return;
      if (mode !== 4 && mode !== 5 && this.prefs.hideRolling) return;
    }

    const lh = this._lineHeight();
    const usableH = Math.max(lh * 2, this.height * Math.max(0.2, Math.min(1, Number(this.prefs.area) || 0.75)));
    const maxLanes = Math.max(1, Math.floor((usableH - 12) / lh));

    this.ctx.font = this._fontString();
    const text = d.displayMessage || d.message || "";
    const textW = Math.ceil(this.ctx.measureText(text).width);
    const duration = Math.max(4, Math.min(18, Number(this.prefs.speed) || 10));

    let lane = -1;
    if (mode === 5 || mode === 4) {
      const used = new Set(this.active.filter((a) => a.mode === mode).map((a) => a.lane));
      for (let i = 0; i < maxLanes; i++) {
        if (!used.has(i)) { lane = i; break; }
      }
      if (lane === -1 && !force) return;
      if (lane === -1) lane = 0;
      const y = mode === 5 ? 10 + lane * lh : this.height - 14 - (lane + 1) * lh;
      this.active.push({
        text, mode, lane, y, x: (this.width - textW) / 2, w: textW,
        color: this._colorCss(d.color),
        ttl: 4.2,
        local: !!d.local,
      });
    } else {
      const speedPx = (this.width + textW) / duration;
      for (let i = 0; i < maxLanes; i++) {
        const inLane = this.active.filter((a) => a.mode === 1 && a.lane === i);
        let fits = true;
        for (const other of inLane) {
          const tailX = other.x + other.w + 26;
          if (tailX > this.width) { fits = false; break; }
          // Ensure faster new bullet won't collide with slower old bullet before exit
          if (speedPx > other.speed) {
            const remainOld = (other.x + other.w) / other.speed;
            const catchDist = this.width - tailX;
            if (catchDist / (speedPx - other.speed) < remainOld) { fits = false; break; }
          }
        }
        if (fits) { lane = i; break; }
      }
      if (lane === -1 && !force) return;
      if (lane === -1) lane = Math.floor(Math.random() * maxLanes);
      this.active.push({
        text, mode: 1, lane, y: 10 + lane * lh,
        x: this.width + 6, w: textW, speed: speedPx,
        color: this._colorCss(d.color),
        local: !!d.local,
      });
    }
  }

  clearCanvas() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  startLoop() {
    const tick = (ts) => {
      this.rafId = requestAnimationFrame(tick);
      if (!this.lastFrameTs) this.lastFrameTs = ts;
      const dt = Math.min(0.1, (ts - this.lastFrameTs) / 1000);
      this.lastFrameTs = ts;

      if (!this.prefs.enabled) {
        if (this.active.length) { this.active = []; this.clearCanvas(); }
        return;
      }

      const playing = !this.video.paused && !this.video.ended;
      const nowTime = (this.video.currentTime || 0) + (Number(this.prefs.timeOffset) || 0);

      if (playing) {
        let spawned = 0;
        while (this.cursor < this.items.length && (this.items[this.cursor].time || 0) <= nowTime) {
          const item = this.items[this.cursor++];
          if (nowTime - (item.time || 0) <= 1.2 && spawned < 12) {
            this.spawn(item);
            spawned++;
          }
        }
      }

      this.clearCanvas();
      if (!this.active.length) return;

      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, Number(this.prefs.opacity) || 0.85));
      ctx.font = this._fontString();
      ctx.textBaseline = "top";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;

      const nextActive = [];
      const rate = Math.max(0.25, this.video.playbackRate || 1);
      for (const item of this.active) {
        if (playing) {
          if (item.mode === 1) {
            item.x -= item.speed * dt * rate;
            if (item.x + item.w < -16) continue;
          } else {
            item.ttl -= dt;
            if (item.ttl <= 0) continue;
          }
        }
        if (this.prefs.stroke) {
          ctx.strokeStyle = "rgba(0,0,0,0.78)";
          ctx.strokeText(item.text, item.x, item.y);
        }
        ctx.fillStyle = item.color;
        ctx.fillText(item.text, item.x, item.y);
        if (item.local) {
          ctx.strokeStyle = "#98D596";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(item.x - 4, item.y - 2, item.w + 8, this._lineHeight() - 2);
          ctx.lineWidth = 3;
        }
        nextActive.push(item);
      }
      ctx.restore();
      this.active = nextActive;
    };
    this.rafId = requestAnimationFrame(tick);
  }

  dispose() {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    if (this._ro) this._ro.disconnect();
    window.removeEventListener("resize", this._boundResize);
  }
}

/* ==========================================================================
 * 3-Step DanDanPlay Danmaku Source Picker Sheet
 * ========================================================================== */
function openDanmakuSourceSheet(ctx) {
  openSheet({
    title: "手动切换弹幕源",
    desc: "通过弹弹play 搜索番剧并绑定对应的分集弹幕",
    content: ({ body, close }) => {
      let step = 1;
      const stepBar = el("div", { class: "step-bar" }, el("span"), el("span"), el("span"));
      const stage = el("div", {});
      body.append(stepBar, stage);

      function updateSteps(n) {
        step = n;
        Array.from(stepBar.children).forEach((sp, i) => {
          sp.className = i + 1 < step ? "is-done" : (i + 1 === step ? "is-current" : "");
        });
      }

      function showSearch(initialKw) {
        updateSteps(1);
        stage.innerHTML = "";
        const kwInput = el("input", { class: "text-field", value: initialKw || ctx.title || "", placeholder: "输入番剧名称搜索弹弹play库…" });
        const resArea = el("div", { style: { marginTop: "12px" } });
        const doSearch = async () => {
          const kw = kwInput.value.trim();
          if (!kw) return;
          resArea.innerHTML = "";
          resArea.append(inlineLoading("正在检索弹幕库…"));
          try {
            const res = await fetchJson("/api/danmaku/search?keyword=" + encodeURIComponent(kw));
            const list = res.items || [];
            resArea.innerHTML = "";
            if (!list.length) {
              resArea.append(emptyState({ compact: true, icon: "subtitles_off", title: "未检索到匹配的弹幕番剧" }));
              return;
            }
            resArea.append(splitList(list.map((a) => splitRow(
              tile({
                title: a.animeTitle,
                desc: [a.typeDescription, a.episodeCount ? a.episodeCount + " 集" : ""].filter(Boolean).join(" · "),
                chevron: true,
                onClick: () => showEpisodes(a),
              })
            )), { tight: true }));
          } catch (e) {
            resArea.innerHTML = "";
            resArea.append(errorState(e, doSearch, { compact: true }));
          }
        };
        kwInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });
        stage.append(el("div", { class: "field-row" }, kwInput, button("搜索", doSearch, { small: true, icon: "search" })), resArea);
        if (kwInput.value.trim()) doSearch();
      }

      async function showEpisodes(anime) {
        updateSteps(2);
        stage.innerHTML = "";
        stage.append(
          button("返回重新搜索", () => showSearch(anime.animeTitle), { variant: "text", small: true, icon: "arrow_back" }),
          inlineLoading("加载分集列表…")
        );
        try {
          const res = await fetchJson("/api/danmaku/episodes?animeId=" + encodeURIComponent(anime.animeId));
          const eps = res.items || [];
          stage.innerHTML = "";
          stage.append(
            el("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" } },
              el("strong", {}, anime.animeTitle),
              button("重选番剧", () => showSearch(anime.animeTitle), { variant: "text", small: true })
            )
          );
          if (!eps.length) {
            stage.append(emptyState({ compact: true, icon: "subtitles_off", title: "该番剧暂无分集信息" }));
            return;
          }
          stage.append(splitList(eps.map((ep, idx) => splitRow(
            tile({
              title: ep.episodeTitle || ("第 " + (idx + 1) + " 话"),
              chevron: true,
              onClick: () => loadEpisodeDanmaku(ep),
            })
          )), { tight: true }));
        } catch (e) {
          stage.innerHTML = "";
          stage.append(errorState(e, () => showEpisodes(anime), { compact: true }));
        }
      }

      async function loadEpisodeDanmaku(ep) {
        updateSteps(3);
        stage.innerHTML = "";
        stage.append(inlineLoading("正在拉取分集弹幕…"));
        try {
          const res = await fetchJson("/api/danmaku/episode?episodeId=" + encodeURIComponent(ep.episodeId));
          const items = res.items || [];
          if (typeof ctx.onLoaded === "function") ctx.onLoaded(items, ep.episodeTitle);
          toast("已切换弹幕源，共加载 " + items.length + " 条弹幕");
          close();
        } catch (e) {
          stage.innerHTML = "";
          stage.append(errorState(e, () => loadEpisodeDanmaku(ep), { compact: true }));
        }
      }

      showSearch(ctx.title || "");
      return null;
    },
  });
}

/* ==========================================================================
 * Main Video Player Page (/play)
 * ========================================================================== */
function renderPlayer(app, params) {
  renderNavRail("");
  disposePlayerResources();

  const state = {
    plugin: params.plugin || "",
    src: params.src || "",
    bangumiId: Number(params.bangumiId || 0),
    title: params.title || "视频播放",
    road: Number(params.road || 0),
    episode: Math.max(1, Number(params.episode || 1)),
    episodeUrl: params.episodeUrl || "",
    episodeName: params.episodeName || ("第 " + (params.episode || 1) + " 话"),
    roads: [],
    history: null,
    bangumi: null,
    resolved: null,
    danmakuCount: 0,
    danmakuSourceLabel: "自动匹配",
    danmakuError: "",
  };

  let playerPrefs = KazumiStore.getPlayerPrefs();
  let dmPrefs = KazumiStore.getDanmakuPrefs();
  let hlsInstance = null;
  let dmLayer = null;
  let hideCtrlTimer = null;
  let hudTimer = null;
  let shutdownTimer = null;
  let shutdownEndAt = 0;
  let progressInterval = null;
  let autoNextTimer = null;
  let isWebFullscreen = false;
  let brightnessVal = 1.0;

  const barTitle = el("span", {}, state.title + " · " + state.episodeName);
  const bar = appBar({
    title: barTitle,
    compact: true,
    back: true,
    actions: [
      state.bangumiId ? iconBtn("info", () => go("/bangumi?id=" + state.bangumiId), { title: "番剧详情" }) : null,
      iconBtn("settings", () => go("/settings/player"), { title: "播放器设置" }),
    ].filter(Boolean),
  });

  // ---- Stage Elements ----
  const video = el("video", { playsinline: true, "webkit-playsinline": "true", preload: "auto", crossorigin: "anonymous" });
  const dmCanvas = el("canvas", { class: "danmaku-canvas" + (dmPrefs.enabled ? "" : " is-hidden") });
  const brightnessVeil = el("div", { class: "player-brightness-veil" });
  const hud = el("div", { class: "player-hud" });
  const centerPlayBtn = el("button", { type: "button", class: "player-center-play", title: "播放 / 暂停" }, iconNode("play"));

  const topTitleEl = el("div", { class: "player-top-title" }, state.title + " - " + state.episodeName);
  const btnPip = el("button", { type: "button", class: "p-btn p-hide-xs", title: "画中画 (PiP)" }, iconNode("pip"));
  const btnShot = el("button", { type: "button", class: "p-btn p-hide-xs", title: "截图" }, iconNode("camera"));
  const btnTimer = el("button", { type: "button", class: "p-btn", title: "定时关闭" }, iconNode("timer"));
  const btnExt = el("button", { type: "button", class: "p-btn", title: "外部播放器 / 复制直链" }, iconNode("open_in_new"));

  const topBar = el("div", { class: "player-top-bar" },
    el("button", { type: "button", class: "p-btn", title: "返回 / 退出网页全屏", onClick: () => { if (isWebFullscreen) toggleWebFullscreen(false); else history.back(); } }, iconNode("arrow_back")),
    topTitleEl,
    btnPip, btnShot, btnTimer, btnExt
  );

  // Seekbar
  const seekBuf = el("div", { class: "player-seek-buf" });
  const seekCur = el("div", { class: "player-seek-cur" });
  const seekThumb = el("div", { class: "player-seek-thumb" });
  const seekTip = el("div", { class: "player-seek-tip" }, "00:00");
  const seekWrap = el("div", { class: "player-seek-wrap" },
    seekTip,
    el("div", { class: "player-seek-track" }, seekBuf, seekCur, seekThumb)
  );

  // Control buttons
  const btnPlay = el("button", { type: "button", class: "p-btn", title: "播放 / 暂停" }, iconNode("play"));
  const btnPrev = el("button", { type: "button", class: "p-btn p-hide-xs", title: "上一集" }, iconNode("skip_previous"));
  const btnNext = el("button", { type: "button", class: "p-btn", title: "下一集" }, iconNode("skip_next"));
  const btnSkip = el("button", { type: "button", class: "p-btn p-hide-xs", title: "跳过片头" }, iconNode("fast_forward"), el("span", {}, "+" + (playerPrefs.skipSeconds || 80) + "s"));
  const timeEl = el("span", { class: "p-time" }, "00:00 / 00:00");

  const btnMute = el("button", { type: "button", class: "p-btn", title: "静音" }, iconNode("volume_up"));
  const volRange = el("input", { type: "range", class: "p-vol-range", min: 0, max: 1, step: 0.02, value: playerPrefs.volume ?? 1 });
  const volWrap = el("div", { class: "p-vol-wrap" }, btnMute, volRange);

  const btnDm = el("button", { type: "button", class: "p-btn" + (dmPrefs.enabled ? " is-active" : ""), title: "弹幕开关" }, iconNode(dmPrefs.enabled ? "subtitles" : "subtitles_off"));
  const btnSpeed = el("button", { type: "button", class: "p-btn", title: "倍速" }, el("span", {}, (playerPrefs.rate || 1).toFixed(playerPrefs.rate % 1 === 0 ? 1 : 2) + "x"));
  const btnAspect = el("button", { type: "button", class: "p-btn p-hide-xs", title: "画面比例" }, iconNode("aspect_ratio"));
  const btnSr = el("button", { type: "button", class: "p-btn p-hide-xs" + (playerPrefs.superRes !== "off" ? " is-active" : ""), title: "画质锐化 (Anime4K 滤镜)" }, iconNode("auto_awesome"));
  const btnWebFs = el("button", { type: "button", class: "p-btn", title: "网页全屏" }, iconNode("web_fullscreen"));
  const btnFs = el("button", { type: "button", class: "p-btn", title: "全屏" }, iconNode("fullscreen"));

  const bottomBar = el("div", { class: "player-bottom-bar" },
    seekWrap,
    el("div", { class: "player-ctrl-row" },
      btnPlay, btnPrev, btnNext, btnSkip, timeEl,
      el("div", { class: "p-spacer" }),
      volWrap, btnDm, btnSpeed, btnAspect, btnSr, btnWebFs, btnFs
    )
  );

  const overlay = el("div", { class: "player-overlay" }, topBar, bottomBar);
  const stage = el("div", { class: "player-stage show-controls is-paused" },
    video, dmCanvas, brightnessVeil, centerPlayBtn, overlay, hud
  );

  // Quickbar below video (send danmaku + quick tools)
  const dmInput = el("input", { type: "text", placeholder: "发一条弹幕见证此刻…" });
  const dmColorSel = el("input", { type: "color", value: "#FFFFFF", title: "弹幕颜色", style: { width: "26px", height: "26px", border: "none", background: "transparent", cursor: "pointer" } });
  const dmModeSel = el("select", { class: "btn btn-surface is-small", style: { minHeight: "32px", padding: "0 26px 0 10px" } },
    el("option", { value: "1" }, "滚动"),
    el("option", { value: "5" }, "顶部"),
    el("option", { value: "4" }, "底部")
  );
  const sendLocalDm = () => {
    const txt = dmInput.value.trim();
    if (!txt || !dmLayer) return;
    const colInt = parseInt(dmColorSel.value.replace("#", ""), 16) || 0xFFFFFF;
    dmLayer.sendLocal(txt, Number(dmModeSel.value) || 1, colInt);
    dmInput.value = "";
    toast("弹幕已发送（本地实时呈现）");
  };
  dmInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); sendLocalDm(); } });

  const quickBar = el("div", { class: "player-quickbar" },
    el("div", { class: "dm-send-bar" },
      dmColorSel,
      dmModeSel,
      dmInput,
      button("发送", sendLocalDm, { small: true, icon: "send" })
    ),
    button("换弹幕源", () => openDanmakuSourceSheet({ title: state.title, onLoaded: (items, lbl) => applyLoadedDanmaku(items, lbl) }), { variant: "tonal", small: true, icon: "subtitles" })
  );

  const metaLine = el("div", { class: "player-meta" }, "正在解析视频流地址…");
  const errBox = el("div", {});

  // ---- Side Panel (4 Tabs: 选集 / 评论 / 弹幕 / 详情) ----
  let activeSideTab = "episodes";
  const sideTabs = el("div", { class: "tabs" });
  const sideBody = el("div", {});
  const sidePanel = el("aside", { class: "player-panel" }, sideTabs, sideBody);

  const mainCol = el("div", {}, stage, errBox, quickBar, metaLine);
  const layout = el("div", { class: "player-layout" }, mainCol, sidePanel);
  const page = el("div", { class: "page wide" }, layout);
  app.append(bar, page);

  // ---- Helper Functions ----
  function showHud(text, ms = 1400) {
    hud.textContent = text;
    hud.classList.add("is-visible");
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => hud.classList.remove("is-visible"), ms);
  }

  function showControls(autoHide = true) {
    stage.classList.add("show-controls");
    clearTimeout(hideCtrlTimer);
    if (autoHide && !video.paused) {
      hideCtrlTimer = setTimeout(() => stage.classList.remove("show-controls"), 3200);
    }
  }

  function applyFit(fit) {
    playerPrefs = KazumiStore.setPlayerPrefs({ fit });
    video.style.objectFit = fit === "cover" ? "cover" : (fit === "fill" ? "fill" : "contain");
    if (fit === "16:9") stage.style.aspectRatio = "16 / 9";
    else if (fit === "4:3") stage.style.aspectRatio = "4 / 3";
    else stage.style.aspectRatio = "";
  }

  function applySuperRes(sr) {
    playerPrefs = KazumiStore.setPlayerPrefs({ superRes: sr });
    video.classList.remove("sr-fast", "sr-quality");
    if (sr === "fast") video.classList.add("sr-fast");
    else if (sr === "quality") video.classList.add("sr-quality");
    btnSr.classList.toggle("is-active", sr !== "off");
  }

  function setRate(r, persist = true) {
    const clamped = Math.max(0.25, Math.min(3.0, Number(r) || 1.0));
    video.playbackRate = clamped;
    btnSpeed.querySelector("span").textContent = (clamped % 1 === 0 ? clamped.toFixed(1) : String(clamped)) + "x";
    if (persist) playerPrefs = KazumiStore.setPlayerPrefs({ rate: clamped });
  }

  function togglePlay() {
    if (video.paused || video.ended) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
    showControls();
  }

  function toggleWebFullscreen(force) {
    isWebFullscreen = force !== undefined ? !!force : !isWebFullscreen;
    stage.classList.toggle("is-web-fullscreen", isWebFullscreen);
    document.body.style.overflow = isWebFullscreen ? "hidden" : "";
    btnWebFs.classList.toggle("is-active", isWebFullscreen);
    if (dmLayer) setTimeout(() => dmLayer.resize(), 60);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(() => toggleWebFullscreen());
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    } else {
      toggleWebFullscreen();
    }
  }

  function takeScreenshot() {
    if (!video.videoWidth || !video.videoHeight) { toast("视频尚未加载画面"); return; }
    try {
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const g = c.getContext("2d");
      g.drawImage(video, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL("image/png");
      const filename = (state.title + "_" + state.episodeName + "_" + Math.floor(video.currentTime) + "s.png").replace(/[\\/:*?"<>|]/g, "_");
      openSheet({
        title: "视频截图预览",
        desc: c.width + " × " + c.height,
        content: ({ close }) => el("div", {},
          el("img", { src: dataUrl, style: { width: "100%", borderRadius: "14px", background: "#000" } }),
          el("div", { class: "sheet-actions" },
            button("关闭", close, { variant: "text" }),
            button("下载 PNG", () => {
              const a = document.createElement("a");
              a.href = dataUrl;
              a.download = filename;
              a.click();
              toast("截图已保存");
            }, { icon: "download" })
          )
        ),
      });
    } catch (e) {
      toast("截图失败：" + e.message);
    }
  }

  function openExternalSheet() {
    const orig = state.resolved && state.resolved.originalUrl;
    const prox = state.resolved && state.resolved.playUrl ? (location.origin + state.resolved.playUrl) : "";
    if (!orig && !prox) { toast("视频流尚未解析完成"); return; }
    const target = orig || prox;
    openSheet({
      title: "外部播放器与直链",
      desc: "可将解析后的视频流直接发送到本机播放器",
      content: ({ close }) => el("div", {},
        splitList([
          splitRow(tile({ title: "PotPlayer (Windows)", desc: "potplayer://", chevron: true, onClick: () => { location.href = "potplayer://" + target; } })),
          splitRow(tile({ title: "IINA (macOS)", desc: "iina://weblink", chevron: true, onClick: () => { location.href = "iina://weblink?url=" + encodeURIComponent(target); } })),
          splitRow(tile({ title: "VLC Player", desc: "vlc://", chevron: true, onClick: () => { location.href = "vlc://" + target; } })),
          splitRow(tile({ title: "复制原始流地址", desc: orig || "无", icon: "copy", onClick: () => { navigator.clipboard?.writeText(orig || "").then(() => toast("已复制原始地址")); } })),
          splitRow(tile({ title: "复制代理播放地址（免防盗链）", desc: prox || "无", icon: "link", onClick: () => { navigator.clipboard?.writeText(prox || "").then(() => toast("已复制代理地址")); } })),
        ], { tight: true }),
        el("div", { class: "sheet-actions" }, button("关闭", close, { variant: "text" }))
      ),
    });
  }

  function openShutdownMenu(anchor) {
    const opts = [
      { label: "关闭定时", min: 0 },
      { label: "15 分钟后暂停", min: 15 },
      { label: "30 分钟后暂停", min: 30 },
      { label: "60 分钟后暂停", min: 60 },
      { label: "90 分钟后暂停", min: 90 },
    ];
    openMenu(anchor, opts.map((o) => ({
      label: o.label,
      icon: "timer",
      onClick: () => {
        clearTimeout(shutdownTimer);
        shutdownEndAt = 0;
        btnTimer.classList.remove("is-active");
        if (o.min > 0) {
          shutdownEndAt = Date.now() + o.min * 60000;
          btnTimer.classList.add("is-active");
          shutdownTimer = setTimeout(() => {
            video.pause();
            btnTimer.classList.remove("is-active");
            toast("定时休眠时间到，已自动暂停播放");
          }, o.min * 60000);
          toast("已设定 " + o.min + " 分钟后自动暂停");
        } else {
          toast("已取消定时关闭");
        }
      },
    })));
  }

  function getRoadEpisodes(rIdx) {
    const road = state.roads[rIdx != null ? rIdx : state.road];
    return typeof extractRoadEpisodes === "function" ? extractRoadEpisodes(road) : [];
  }

  function hasPrevEpisode() { return state.episode > 1; }
  function hasNextEpisode() { return state.episode < getRoadEpisodes().length; }

  function switchEpisode(nextEp, nextRoad) {
    const rIdx = nextRoad != null ? nextRoad : state.road;
    const eps = getRoadEpisodes(rIdx);
    if (!eps.length || nextEp < 1 || nextEp > eps.length) return;
    saveProgressNow();
    const target = eps[nextEp - 1];
    go(playEpisodeParams({
      plugin: state.plugin,
      src: state.src,
      bangumiId: state.bangumiId,
      title: state.title,
      road: rIdx,
      episode: nextEp,
      episodeUrl: target.url,
      episodeName: target.name,
    }));
  }

  // ---- Wire Controls ----
  btnPlay.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
  centerPlayBtn.addEventListener("click", (e) => { e.stopPropagation(); togglePlay(); });
  btnPrev.addEventListener("click", (e) => { e.stopPropagation(); switchEpisode(state.episode - 1); });
  btnNext.addEventListener("click", (e) => { e.stopPropagation(); switchEpisode(state.episode + 1); });
  btnSkip.addEventListener("click", (e) => {
    e.stopPropagation();
    const sec = Number(playerPrefs.skipSeconds) || 80;
    video.currentTime = Math.min(video.duration || 1e9, (video.currentTime || 0) + sec);
    showHud("已跳过 " + sec + " 秒");
  });
  btnMute.addEventListener("click", (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    btnMute.innerHTML = iconSvg(video.muted || video.volume === 0 ? "volume_off" : "volume_up");
  });
  volRange.addEventListener("input", () => {
    const v = Number(volRange.value);
    video.volume = v;
    video.muted = v === 0;
    btnMute.innerHTML = iconSvg(video.muted ? "volume_off" : "volume_up");
    playerPrefs = KazumiStore.setPlayerPrefs({ volume: v });
  });
  btnDm.addEventListener("click", (e) => {
    e.stopPropagation();
    dmPrefs = KazumiStore.setDanmakuPrefs({ enabled: !dmPrefs.enabled });
    btnDm.classList.toggle("is-active", dmPrefs.enabled);
    btnDm.innerHTML = iconSvg(dmPrefs.enabled ? "subtitles" : "subtitles_off");
    if (dmLayer) dmLayer.setPrefs({ enabled: dmPrefs.enabled });
    showHud(dmPrefs.enabled ? "弹幕：开" : "弹幕：关");
  });
  btnSpeed.addEventListener("click", (e) => {
    e.stopPropagation();
    const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
    openMenu(e.currentTarget, speeds.map((s) => ({
      label: s.toFixed(s % 1 === 0 ? 1 : 2) + "x",
      selected: Math.abs((video.playbackRate || 1) - s) < 0.01,
      icon: Math.abs((video.playbackRate || 1) - s) < 0.01 ? "check" : "speed",
      onClick: () => { setRate(s); showHud("倍速 " + s + "x"); },
    })));
  });
  btnAspect.addEventListener("click", (e) => {
    e.stopPropagation();
    const fits = [
      { id: "contain", label: "自适应（默认）" },
      { id: "cover", label: "填充裁剪 (Cover)" },
      { id: "fill", label: "拉伸铺满 (Fill)" },
      { id: "16:9", label: "强制 16:9" },
      { id: "4:3", label: "强制 4:3" },
    ];
    openMenu(e.currentTarget, fits.map((f) => ({
      label: f.label,
      selected: playerPrefs.fit === f.id,
      icon: playerPrefs.fit === f.id ? "check" : "aspect_ratio",
      onClick: () => { applyFit(f.id); showHud("画面比例：" + f.label); },
    })));
  });
  btnSr.addEventListener("click", (e) => {
    e.stopPropagation();
    const modes = [
      { id: "off", label: "关闭画质锐化" },
      { id: "fast", label: "Anime4K 轻量锐化（推荐）" },
      { id: "quality", label: "Anime4K 强力超分锐化" },
    ];
    openMenu(e.currentTarget, modes.map((m) => ({
      label: m.label,
      selected: playerPrefs.superRes === m.id,
      icon: playerPrefs.superRes === m.id ? "check" : "auto_awesome",
      onClick: () => { applySuperRes(m.id); showHud(m.label); },
    })));
  });
  btnWebFs.addEventListener("click", (e) => { e.stopPropagation(); toggleWebFullscreen(); });
  btnFs.addEventListener("click", (e) => { e.stopPropagation(); toggleFullscreen(); });
  btnPip.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (video.requestPictureInPicture) await video.requestPictureInPicture();
      else toast("当前浏览器不支持画中画");
    } catch (err) { toast("画中画切换失败：" + err.message); }
  });
  btnShot.addEventListener("click", (e) => { e.stopPropagation(); takeScreenshot(); });
  btnTimer.addEventListener("click", (e) => { e.stopPropagation(); openShutdownMenu(e.currentTarget); });
  btnExt.addEventListener("click", (e) => { e.stopPropagation(); openExternalSheet(); });

  // ---- Interactive Seekbar ----
  let draggingSeek = false;
  function seekAtClientX(clientX, commit = true) {
    const rect = seekWrap.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    const dur = video.duration || 0;
    const t = ratio * dur;
    seekCur.style.width = (ratio * 100).toFixed(2) + "%";
    seekThumb.style.left = (ratio * 100).toFixed(2) + "%";
    seekTip.style.left = (ratio * 100).toFixed(2) + "%";
    seekTip.textContent = formatDuration(t);
    if (commit && dur > 0) {
      video.currentTime = t;
      if (dmLayer) dmLayer.seek(t);
    }
  }
  seekWrap.addEventListener("pointerdown", (e) => {
    e.stopPropagation();
    draggingSeek = true;
    seekTip.style.display = "block";
    seekWrap.setPointerCapture(e.pointerId);
    seekAtClientX(e.clientX, false);
  });
  seekWrap.addEventListener("pointermove", (e) => {
    if (draggingSeek) {
      seekAtClientX(e.clientX, false);
    } else if (video.duration > 0) {
      const rect = seekWrap.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      seekTip.style.display = "block";
      seekTip.style.left = (ratio * 100).toFixed(2) + "%";
      seekTip.textContent = formatDuration(ratio * video.duration);
    }
  });
  seekWrap.addEventListener("pointerleave", () => { if (!draggingSeek) seekTip.style.display = "none"; });
  seekWrap.addEventListener("pointerup", (e) => {
    if (!draggingSeek) return;
    draggingSeek = false;
    seekTip.style.display = "none";
    seekAtClientX(e.clientX, true);
  });

  // ---- Video Events ----
  video.volume = playerPrefs.volume ?? 1;
  applyFit(playerPrefs.fit || "contain");
  applySuperRes(playerPrefs.superRes || "off");
  setRate(playerPrefs.rate || 1.0, false);

  video.addEventListener("play", () => {
    stage.classList.remove("is-paused");
    btnPlay.innerHTML = iconSvg("pause");
    showControls(true);
  });
  video.addEventListener("pause", () => {
    stage.classList.add("is-paused");
    btnPlay.innerHTML = iconSvg("play");
    showControls(false);
    saveProgressNow();
  });
  video.addEventListener("timeupdate", () => {
    if (draggingSeek) return;
    const cur = video.currentTime || 0;
    const dur = video.duration || 0;
    timeEl.textContent = formatDuration(cur) + " / " + formatDuration(dur);
    if (dur > 0) {
      const pct = (cur / dur) * 100;
      seekCur.style.width = pct.toFixed(2) + "%";
      seekThumb.style.left = pct.toFixed(2) + "%";
    }
  });
  video.addEventListener("progress", () => {
    const dur = video.duration || 0;
    if (dur > 0 && video.buffered.length > 0) {
      const end = video.buffered.end(video.buffered.length - 1);
      seekBuf.style.width = Math.min(100, (end / dur) * 100).toFixed(2) + "%";
    }
  });
  video.addEventListener("seeked", () => { if (dmLayer) dmLayer.seek(video.currentTime || 0); });
  video.addEventListener("ended", () => {
    saveProgressNow();
    if (playerPrefs.autoNext && hasNextEpisode()) {
      showHud("即将自动播放下一集…", 2800);
      autoNextTimer = setTimeout(() => switchEpisode(state.episode + 1), 2400);
    }
  });

  // Mouse move & click/double-click on stage
  stage.addEventListener("mousemove", () => showControls(true));
  let lastTapTime = 0;
  let tapTimer = null;
  stage.addEventListener("click", (e) => {
    if (e.target.closest(".player-top-bar") || e.target.closest(".player-bottom-bar") || e.target.closest(".player-center-play")) return;
    const now = Date.now();
    const rect = stage.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
    if (now - lastTapTime < 280) {
      clearTimeout(tapTimer);
      lastTapTime = 0;
      if (relX < 0.28) {
        video.currentTime = Math.max(0, (video.currentTime || 0) - 10);
        showHud("快退 10 秒");
      } else if (relX > 0.72) {
        video.currentTime = Math.min(video.duration || 1e9, (video.currentTime || 0) + 10);
        showHud("快进 10 秒");
      } else {
        togglePlay();
      }
    } else {
      lastTapTime = now;
      tapTimer = setTimeout(() => {
        if (stage.classList.contains("show-controls") && !video.paused) stage.classList.remove("show-controls");
        else showControls(true);
      }, 280);
    }
  });

  // Mobile Touch Gestures (long press 2x, swipe seek, vertical brightness/volume)
  let touchStart = null;
  let longPressTimer = null;
  let tempFastActive = false;
  let savedRateBeforeFast = 1.0;

  stage.addEventListener("touchstart", (e) => {
    if (e.touches.length !== 1 || e.target.closest(".player-bottom-bar") || e.target.closest(".player-top-bar")) return;
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY, time: video.currentTime || 0, vol: video.volume, bright: brightnessVal, mode: null };
    longPressTimer = setTimeout(() => {
      if (touchStart && !touchStart.mode && !video.paused) {
        tempFastActive = true;
        savedRateBeforeFast = video.playbackRate || 1.0;
        video.playbackRate = 2.0;
        showHud("2.0x 倍速播放中…", 60000);
      }
    }, 450);
  }, { passive: true });

  stage.addEventListener("touchmove", (e) => {
    if (!touchStart || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    if (!touchStart.mode && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) {
      clearTimeout(longPressTimer);
      if (tempFastActive) { video.playbackRate = savedRateBeforeFast; tempFastActive = false; }
      const rect = stage.getBoundingClientRect();
      if (Math.abs(dx) > Math.abs(dy)) touchStart.mode = "seek";
      else touchStart.mode = (touchStart.x - rect.left) < rect.width / 2 ? "bright" : "vol";
    }
    if (!touchStart.mode) return;
    e.preventDefault();
    if (touchStart.mode === "seek" && video.duration > 0) {
      const target = Math.max(0, Math.min(video.duration, touchStart.time + dx * 0.35));
      touchStart.seekTarget = target;
      showHud(formatDuration(target) + " / " + formatDuration(video.duration));
    } else if (touchStart.mode === "vol") {
      const v = Math.max(0, Math.min(1, touchStart.vol - dy / 180));
      video.volume = v;
      video.muted = v === 0;
      volRange.value = v;
      showHud("音量 " + Math.round(v * 100) + "%");
    } else if (touchStart.mode === "bright") {
      brightnessVal = Math.max(0.25, Math.min(1.0, touchStart.bright - dy / 180));
      brightnessVeil.style.opacity = String((1 - brightnessVal).toFixed(2));
      showHud("亮度 " + Math.round(brightnessVal * 100) + "%");
    }
  }, { passive: false });

  stage.addEventListener("touchend", () => {
    clearTimeout(longPressTimer);
    if (tempFastActive) {
      video.playbackRate = savedRateBeforeFast;
      tempFastActive = false;
      hud.classList.remove("is-visible");
    }
    if (touchStart && touchStart.mode === "seek" && touchStart.seekTarget != null) {
      video.currentTime = touchStart.seekTarget;
      if (dmLayer) dmLayer.seek(touchStart.seekTarget);
    }
    touchStart = null;
  });

  // ---- All 18 Customizable Keyboard Shortcuts + Hold-Right 2x ----
  let holdRightTimer = null;
  let holdRightBoost = false;
  let rateBeforeHold = 1.0;

  const matchShortcut = (e, keyName) => {
    if (!keyName) return false;
    if (keyName === " ") return e.key === " " || e.code === "Space";
    return e.key.toLowerCase() === keyName.toLowerCase();
  };

  const onKeyDown = (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT" || e.target.isContentEditable)) return;
    const sc = KazumiStore.getShortcuts();

    if (e.key === "Escape" && isWebFullscreen) { toggleWebFullscreen(false); return; }

    if (matchShortcut(e, sc.forward)) {
      e.preventDefault();
      if (!e.repeat) {
        holdRightTimer = setTimeout(() => {
          holdRightBoost = true;
          rateBeforeHold = video.playbackRate || 1.0;
          video.playbackRate = 2.0;
          showHud("长按 2.0x 倍速播放", 60000);
        }, 320);
      }
      return;
    }
    if (matchShortcut(e, sc.playorpause)) { e.preventDefault(); togglePlay(); }
    else if (matchShortcut(e, sc.rewind)) { e.preventDefault(); video.currentTime = Math.max(0, (video.currentTime || 0) - 5); showHud("快退 5 秒"); }
    else if (matchShortcut(e, sc.next)) { e.preventDefault(); if (hasNextEpisode()) switchEpisode(state.episode + 1); }
    else if (matchShortcut(e, sc.prev)) { e.preventDefault(); if (hasPrevEpisode()) switchEpisode(state.episode - 1); }
    else if (matchShortcut(e, sc.volumeup)) { e.preventDefault(); const v = Math.min(1, video.volume + 0.08); video.volume = v; volRange.value = v; showHud("音量 " + Math.round(v * 100) + "%"); }
    else if (matchShortcut(e, sc.volumedown)) { e.preventDefault(); const v = Math.max(0, video.volume - 0.08); video.volume = v; volRange.value = v; showHud("音量 " + Math.round(v * 100) + "%"); }
    else if (matchShortcut(e, sc.togglemute)) { e.preventDefault(); btnMute.click(); showHud(video.muted ? "已静音" : "取消静音"); }
    else if (matchShortcut(e, sc.fullscreen)) { e.preventDefault(); toggleFullscreen(); }
    else if (matchShortcut(e, sc.webfullscreen)) { e.preventDefault(); toggleWebFullscreen(); }
    else if (matchShortcut(e, sc.toggledanmaku)) { e.preventDefault(); btnDm.click(); }
    else if (matchShortcut(e, sc.screenshot)) { e.preventDefault(); takeScreenshot(); }
    else if (matchShortcut(e, sc.skip)) { e.preventDefault(); btnSkip.click(); }
    else if (matchShortcut(e, sc.speed1)) { e.preventDefault(); setRate(1.0); showHud("倍速 1.0x"); }
    else if (matchShortcut(e, sc.speed2)) { e.preventDefault(); setRate(2.0); showHud("倍速 2.0x"); }
    else if (matchShortcut(e, sc.speed3)) { e.preventDefault(); setRate(3.0); showHud("倍速 3.0x"); }
    else if (matchShortcut(e, sc.speedup)) { e.preventDefault(); const r = Math.min(3.0, Number(((video.playbackRate || 1) + 0.25).toFixed(2))); setRate(r); showHud("倍速 " + r + "x"); }
    else if (matchShortcut(e, sc.speeddown)) { e.preventDefault(); const r = Math.max(0.25, Number(((video.playbackRate || 1) - 0.25).toFixed(2))); setRate(r); showHud("倍速 " + r + "x"); }
  };

  const onKeyUp = (e) => {
    const sc = KazumiStore.getShortcuts();
    if (matchShortcut(e, sc.forward)) {
      clearTimeout(holdRightTimer);
      if (holdRightBoost) {
        holdRightBoost = false;
        video.playbackRate = rateBeforeHold;
        hud.classList.remove("is-visible");
      } else {
        video.currentTime = Math.min(video.duration || 1e9, (video.currentTime || 0) + 5);
        showHud("快进 5 秒");
      }
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // ---- Hybrid Progress Sync ----
  let lastSavedSec = -1;
  function saveProgressNow(useKeepalive = false) {
    if (!state.bangumiId || !state.plugin || !video.duration) return;
    const curMs = Math.floor((video.currentTime || 0) * 1000);
    if (curMs < 1500) return;
    const curSec = Math.floor(curMs / 1000);
    if (!useKeepalive && Math.abs(curSec - lastSavedSec) < 3) return;
    lastSavedSec = curSec;

    const payload = {
      bangumiId: state.bangumiId,
      pluginName: state.plugin,
      episode: state.episode,
      road: state.road,
      progressMs: curMs,
      lastSrc: state.episodeUrl,
      src: state.src,
      episodeName: state.episodeName,
      bangumi: state.bangumi || { id: state.bangumiId, nameCn: state.title, name: state.title, images: {} },
      deviceId: getDeviceId(),
    };

    // Synchronous localStorage write so Render resets never lose progress
    const prevMap = KazumiStore.getHistoriesMap();
    const existing = prevMap[state.plugin + "::" + state.bangumiId] || { progresses: {} };
    const progresses = Object.assign({}, existing.progresses || {});
    progresses[String(state.episode)] = { episode: state.episode, road: state.road, progressMs: curMs, updatedAt: Date.now() };
    KazumiStore.saveHistoryRecord({
      bangumiId: state.bangumiId,
      pluginName: state.plugin,
      lastWatchEpisode: state.episode,
      lastWatchEpisodeName: state.episodeName,
      lastWatchTime: Date.now(),
      lastSrc: state.episodeUrl,
      src: state.src,
      bangumi: payload.bangumi,
      progresses,
      deviceId: payload.deviceId,
    });

    fetch("/api/history/progress", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: useKeepalive,
    }).catch(() => {});
  }

  const onPageHide = () => saveProgressNow(true);
  window.addEventListener("pagehide", onPageHide);
  progressInterval = setInterval(() => { if (!video.paused) saveProgressNow(false); }, 5000);

  // ---- Danmaku Engine Setup ----
  dmLayer = new DanmakuLayer(dmCanvas, video, dmPrefs);

  function applyLoadedDanmaku(items, label) {
    state.danmakuCount = items.length;
    state.danmakuSourceLabel = label || "已加载";
    state.danmakuError = "";
    if (dmLayer) dmLayer.setItems(items);
    if (activeSideTab === "danmaku") renderSideBody();
  }

  async function loadAutoDanmaku() {
    if (!state.bangumiId) {
      state.danmakuSourceLabel = "未关联 Bangumi（可手动搜索或上传 XML）";
      if (activeSideTab === "danmaku") renderSideBody();
      return;
    }
    try {
      const res = await fetchJson("/api/danmaku?bangumiId=" + state.bangumiId + "&episode=" + state.episode);
      applyLoadedDanmaku(res.items || [], res.dandanBangumiId ? "弹弹play #" + res.dandanBangumiId : "未匹配到自动源");
    } catch (e) {
      state.danmakuError = e.message || "弹幕加载失败";
      if (activeSideTab === "danmaku") renderSideBody();
    }
  }

  // ---- Side Panel Rendering ----
  const SIDE_TABS = [
    { id: "episodes", label: "选集" },
    { id: "comments", label: "评论" },
    { id: "danmaku", label: "弹幕" },
    { id: "detail", label: "详情" },
  ];

  function renderSideTabs() {
    sideTabs.innerHTML = "";
    for (const t of SIDE_TABS) {
      sideTabs.append(el("button", {
        type: "button",
        class: "tab sl" + (activeSideTab === t.id ? " is-active" : ""),
        onClick: () => { activeSideTab = t.id; renderSideTabs(); renderSideBody(); },
      }, t.label));
    }
  }

  function renderSideBody() {
    sideBody.innerHTML = "";
    if (activeSideTab === "episodes") {
      if (!state.roads.length) {
        sideBody.append(state.src ? inlineLoading("正在加载选集列表…") : emptyState({ compact: true, icon: "list", title: "单集直连播放" }));
        return;
      }
      sideBody.append(episodePanel({
        roads: state.roads,
        road: state.road,
        history: state.history,
        currentEpisode: state.episode,
        currentRoad: state.road,
        onSelect: (sel) => switchEpisode(sel.episode, sel.road),
      }));
      return;
    }

    if (activeSideTab === "comments") {
      sideBody.append(episodeCommentsPanel(state.bangumiId, state.episode));
      return;
    }

    if (activeSideTab === "danmaku") {
      const xmlInput = el("input", { type: "file", accept: ".xml", style: { display: "none" } });
      xmlInput.addEventListener("change", async () => {
        const f = xmlInput.files && xmlInput.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const res = await fetch("/api/danmaku/parse-xml", { method: "POST", body: text }).then(_handleJsonResponse);
          applyLoadedDanmaku(res.items || [], "本地 XML：" + f.name);
          toast("已导入 " + (res.count || 0) + " 条本地 XML 弹幕");
        } catch (err) { toast(err.message); }
      });

      const offsetLabel = el("span", { class: "slider-value" }, (dmPrefs.timeOffset >= 0 ? "+" : "") + (dmPrefs.timeOffset || 0) + "s");
      const adjustOffset = (delta) => {
        const next = delta === 0 ? 0 : Math.round(((dmPrefs.timeOffset || 0) + delta) * 10) / 10;
        dmPrefs = KazumiStore.setDanmakuPrefs({ timeOffset: next });
        offsetLabel.textContent = (next >= 0 ? "+" : "") + next + "s";
        if (dmLayer) { dmLayer.setPrefs({ timeOffset: next }); dmLayer.seek(video.currentTime || 0); }
      };

      sideBody.append(
        section("弹幕源（共 " + state.danmakuCount + " 条）", splitList([
          splitRow(tile({ title: state.danmakuSourceLabel, desc: state.danmakuError || "支持弹弹play 检索及本地 B站 XML 导入", icon: "subtitles" })),
          splitRow(el("div", { style: { padding: "10px 14px", display: "flex", gap: "8px", flexWrap: "wrap" } },
            xmlInput,
            button("手动切换弹幕源", () => openDanmakuSourceSheet({ title: state.title, onLoaded: applyLoadedDanmaku }), { small: true, icon: "search" }),
            button("导入本地 XML", () => xmlInput.click(), { variant: "tonal", small: true, icon: "upload" }),
            button("屏蔽词管理", () => go("/settings/danmaku"), { variant: "surface", small: true, icon: "shield" })
          )),
        ], { tight: true })),

        section("时间轴微调", splitList([
          splitRow(el("div", { style: { padding: "12px 14px" } },
            el("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" } },
              el("span", { class: "t-body-medium" }, "弹幕时间偏移"),
              offsetLabel
            ),
            el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
              button("-5s", () => adjustOffset(-5), { variant: "surface", small: true }),
              button("-1s", () => adjustOffset(-1), { variant: "surface", small: true }),
              button("重置", () => adjustOffset(0), { variant: "tonal", small: true }),
              button("+1s", () => adjustOffset(1), { variant: "surface", small: true }),
              button("+5s", () => adjustOffset(5), { variant: "surface", small: true })
            )
          )),
        ])),

        section("显示参数", splitList([
          switchTile({ title: "开启弹幕显示", checked: dmPrefs.enabled, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ enabled: v }); if (dmLayer) dmLayer.setPrefs({ enabled: v }); btnDm.classList.toggle("is-active", v); } }),
          sliderTile({ label: "弹幕字号", min: 14, max: 36, step: 1, value: dmPrefs.fontSize, format: (v) => v + "px", onInput: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ fontSize: v }); if (dmLayer) dmLayer.setPrefs({ fontSize: v }); } }),
          sliderTile({ label: "不透明度", min: 0.2, max: 1.0, step: 0.05, value: dmPrefs.opacity, format: (v) => Math.round(v * 100) + "%", onInput: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ opacity: v }); if (dmLayer) dmLayer.setPrefs({ opacity: v }); } }),
          sliderTile({ label: "滚动时长（越小越快）", min: 5, max: 16, step: 1, value: dmPrefs.speed, format: (v) => v + " 秒", onInput: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ speed: v }); if (dmLayer) dmLayer.setPrefs({ speed: v }); } }),
          sliderTile({ label: "显示区域", min: 0.25, max: 1.0, step: 0.25, value: dmPrefs.area, format: (v) => Math.round(v * 100) + "%", onInput: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ area: v }); if (dmLayer) dmLayer.setPrefs({ area: v }); } }),
          switchTile({ title: "合并重复弹幕", checked: dmPrefs.mergeDuplicate, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ mergeDuplicate: v }); if (dmLayer) dmLayer.setPrefs({ mergeDuplicate: v }); } }),
          switchTile({ title: "字体加粗", checked: dmPrefs.bold, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ bold: v }); if (dmLayer) dmLayer.setPrefs({ bold: v }); } }),
          switchTile({ title: "文字描边", checked: dmPrefs.stroke, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ stroke: v }); if (dmLayer) dmLayer.setPrefs({ stroke: v }); } }),
          switchTile({ title: "屏蔽顶部弹幕", checked: dmPrefs.hideTop, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ hideTop: v }); if (dmLayer) dmLayer.setPrefs({ hideTop: v }); } }),
          switchTile({ title: "屏蔽底部弹幕", checked: dmPrefs.hideBottom, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ hideBottom: v }); if (dmLayer) dmLayer.setPrefs({ hideBottom: v }); } }),
          switchTile({ title: "屏蔽滚动弹幕", checked: dmPrefs.hideRolling, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ hideRolling: v }); if (dmLayer) dmLayer.setPrefs({ hideRolling: v }); } }),
          switchTile({ title: "屏蔽彩色弹幕", checked: dmPrefs.hideColor, onChange: (v) => { dmPrefs = KazumiStore.setDanmakuPrefs({ hideColor: v }); if (dmLayer) dmLayer.setPrefs({ hideColor: v }); } }),
        ], { tight: true }))
      );
      return;
    }

    if (activeSideTab === "detail") {
      const b = state.bangumi;
      sideBody.append(
        el("div", { class: "tonal-card", style: { display: "flex", flexDirection: "column", gap: "12px" } },
          b ? el("div", { style: { display: "flex", gap: "12px" } },
            coverImg(bestBangumiImage(b.images), "", b.nameCn || b.name),
            el("div", { style: { flex: 1, minWidth: 0 } },
              el("div", { class: "t-title-medium w700" }, b.nameCn || b.name),
              b.ratingScore ? el("div", { class: "t-body-small c-primary", style: { marginTop: "4px" } }, "Bangumi ★ " + Number(b.ratingScore).toFixed(1)) : null,
              el("div", { class: "t-body-small c-variant", style: { marginTop: "4px" } }, "当前视频源：" + state.plugin)
            )
          ) : el("div", { class: "t-title-medium w700" }, state.title),
          b && b.summary ? el("div", { class: "t-body-small c-variant", style: { lineHeight: 1.6 } }, b.summary.slice(0, 260) + (b.summary.length > 260 ? "…" : "")) : null,
          el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
            b ? button("切换其他视频源", () => openSourcePicker(b), { small: true, icon: "swap" }) : null,
            state.bangumiId ? button("打开详情页", () => go("/bangumi?id=" + state.bangumiId), { variant: "tonal", small: true, icon: "info" }) : null
          )
        )
      );
      const img = sideBody.querySelector("img");
      if (img) { img.style.width = "76px"; img.style.height = "110px"; img.style.borderRadius = "10px"; img.style.objectFit = "cover"; }
    }
  }

  renderSideTabs();
  renderSideBody();

  // ---- Resolve & Attach Stream ----
  async function attachVideoStream() {
    errBox.innerHTML = "";
    metaLine.textContent = "正在解析视频地址（规则：" + state.plugin + "）…";
    try {
      const res = await fetchJson("/api/resolve?plugin=" + encodeURIComponent(state.plugin) + "&episodeUrl=" + encodeURIComponent(state.episodeUrl));
      state.resolved = res;
      const methodText = res.resolveMethod === "static" ? "静态极速提取" : "Playwright 浏览器嗅探";
      metaLine.textContent = "规则：" + res.pluginName + " · 解析引擎：" + methodText + " · 格式：" + (res.streamType || "auto").toUpperCase();

      const playUrl = res.playUrl;
      const isHls = res.streamType === "hls" || /\.m3u8/i.test(res.originalUrl || "");

      if (isHls) {
        const Hls = await ensureHlsLib();
        if (Hls && Hls.isSupported()) {
          if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
          hlsInstance = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            enableWorker: true,
          });
          hlsInstance.loadSource(playUrl);
          hlsInstance.attachMedia(video);
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            maybeResumeAndPlay();
          });
          hlsInstance.on(Hls.Events.ERROR, (_ev, data) => {
            if (data && data.fatal) {
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hlsInstance.startLoad();
              else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hlsInstance.recoverMediaError();
              else showStreamError("HLS 流播放失败：" + (data.details || "未知错误"));
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = playUrl;
          video.addEventListener("loadedmetadata", maybeResumeAndPlay, { once: true });
        } else {
          showStreamError("当前浏览器不支持 HLS 流播放");
        }
      } else {
        video.src = playUrl;
        video.addEventListener("loadedmetadata", maybeResumeAndPlay, { once: true });
        video.addEventListener("error", () => showStreamError("MP4 视频流加载失败，请尝试切换线路或使用外部播放器"), { once: true });
      }
    } catch (e) {
      showStreamError(e.message || "视频解析失败");
    }
  }

  let resumedOnce = false;
  function maybeResumeAndPlay() {
    if (resumedOnce) return;
    resumedOnce = true;
    setRate(playerPrefs.rate || 1.0, false);
    if (playerPrefs.autoResume && state.history && state.history.progresses) {
      const p = state.history.progresses[String(state.episode)];
      if (p && p.progressMs > 5000 && video.duration && p.progressMs / 1000 < video.duration - 10) {
        video.currentTime = p.progressMs / 1000;
        showHud("已续播至 " + formatPosition(p.progressMs), 2200);
      }
    }
    video.play().catch(() => {});
  }

  function showStreamError(msg) {
    metaLine.textContent = "解析或播放出错";
    errBox.innerHTML = "";
    errBox.append(el("div", { class: "player-error" },
      el("div", { class: "w700" }, "无法播放当前源"),
      el("div", { class: "t-body-small", style: { marginTop: "4px" } }, msg),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" } },
        button("重试解析", attachVideoStream, { small: true, icon: "refresh" }),
        state.bangumi ? button("切换视频源", () => openSourcePicker(state.bangumi), { variant: "tonal", small: true, icon: "swap" }) : null,
        state.resolved ? button("外部播放器", openExternalSheet, { variant: "surface", small: true, icon: "open_in_new" }) : null
      )
    ));
  }

  // ---- Parallel Initial Data Load ----
  (async () => {
    const tasks = [];
    if (state.src) {
      tasks.push(
        loadRoadsAndHistory(state.plugin, state.src, state.bangumiId).then(({ roads, history }) => {
          state.roads = roads;
          state.history = history;
          btnPrev.disabled = !hasPrevEpisode();
          btnNext.disabled = !hasNextEpisode();
          if (activeSideTab === "episodes") renderSideBody();
        }).catch(() => {})
      );
    }
    if (state.bangumiId) {
      tasks.push(
        fetchJson("/api/bangumi/" + state.bangumiId).then((b) => {
          state.bangumi = b;
          if (activeSideTab === "detail") renderSideBody();
        }).catch(() => {})
      );
    }
    tasks.push(loadAutoDanmaku());
    tasks.push(attachVideoStream());
    await Promise.all(tasks);
  })();

  // ---- Disposal ----
  _activePlayerDispose = () => {
    saveProgressNow(true);
    clearTimeout(hideCtrlTimer);
    clearTimeout(hudTimer);
    clearTimeout(shutdownTimer);
    clearTimeout(autoNextTimer);
    clearTimeout(holdRightTimer);
    clearTimeout(longPressTimer);
    clearInterval(progressInterval);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pagehide", onPageHide);
    document.body.style.overflow = "";
    if (dmLayer) { dmLayer.dispose(); dmLayer = null; }
    if (hlsInstance) { hlsInstance.destroy(); hlsInstance = null; }
    video.pause();
    video.removeAttribute("src");
    video.load();
  };
}
