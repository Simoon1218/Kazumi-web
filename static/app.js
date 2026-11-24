"use strict";

/* ==========================================================================
 * Kazumi-web Core UI Kit, Router & Primary Views
 * Faithful Material 3 Expressive port of Predidit/Kazumi v2.4.6
 * ========================================================================== */

const DEFAULT_ANIME_TAGS = [
  "日常", "原创", "校园", "搞笑", "奇幻", "百合", "恋爱", "悬疑",
  "热血", "后宫", "机战", "轻改", "偶像", "治愈", "异世界",
];

const COLLECT_LABELS = {
  0: "未追番",
  1: "在看",
  2: "想看",
  3: "搁置",
  4: "看过",
  5: "抛弃",
};

const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const APP_SETTINGS = {
  enableBangumiProxy: false,
  enableGitProxy: false,
  proxyEnable: false,
  proxyUrl: "",
  ruleRepositoryUrl: "",
  danmakuApiDomain: "https://api.dandanplay.net",
  danmakuChConvert: 0,
  resolverMode: "auto",
  bangumiToken: "",
  bangumiUsername: "",
  bangumiAutoSync: false,
  webdavUrl: "",
  webdavUsername: "",
  webdavPassword: "",
  webdavPath: "/kazumiSync",
  hasDandanCredentials: false,
};

let AUTH_STATE = { authEnabled: false, authenticated: true };
let _activeCleanups = [];
let _currentRouteKey = "";

function registerCleanup(fn) {
  if (typeof fn === "function") _activeCleanups.push(fn);
}

function runCleanups() {
  for (const fn of _activeCleanups) {
    try { fn(); } catch (_) {}
  }
  _activeCleanups = [];
  if (typeof disposePlayerResources === "function") {
    try { disposePlayerResources(); } catch (_) {}
  }
}

/* ==========================================================================
 * Material Symbols SVG Icons
 * ========================================================================== */
const ICONS = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  home_outline: "M12 5.69l5 4.5V18h-2v-6H9v6H7v-7.81l5-4.5M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z",
  timeline: "M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V9h14v10zM7 11h5v5H7z",
  timeline_outline: "M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z",
  favorite: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
  favorite_border: "M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  person_outline: "M12 6c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2m0 10c2.7 0 5.8 1.29 6 2H6c.23-.72 3.31-2 6-2m0-12C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  search: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  image_search: "M18 13v7H4V6h5.02c.05-.71.22-1.38.48-2H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-5l-2-2zm-1.5 5h-11l2.75-3.53 1.96 2.36 2.75-3.54L16.5 18zm2.8-9.11c.44-.7.7-1.51.7-2.39C20 4.01 17.99 2 15.5 2S11 4.01 11 6.5s2.01 4.5 4.49 4.5c.88 0 1.7-.26 2.39-.7L21 13.42 22.42 12 19.3 8.89zM15.5 9a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
  arrow_back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  arrow_forward: "M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z",
  arrow_upward: "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z",
  arrow_downward: "M20 12l-1.41-1.41L13 16.17V4h-2v12.17l-5.58-5.59L4 12l8 8 8-8z",
  more_vert: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  close: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  check_circle: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  refresh: "M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z",
  delete: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  tune: "M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z",
  sort: "M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z",
  star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  star_border: "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z",
  star_half: "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4V6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z",
  bookmark: "M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z",
  bookmark_border: "M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2zm0 15l-5-2.18L7 18V5h10v13z",
  play: "M8 5v14l11-7z",
  pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
  skip_next: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
  skip_previous: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
  fast_forward: "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z",
  volume_up: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
  volume_off: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
  fullscreen: "M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z",
  fullscreen_exit: "M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z",
  web_fullscreen: "M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z",
  pip: "M19 7h-8v6h8V7zm2-4H3c-1.1 0-2 .9-2 2v14c0 1.1.9 1.98 2 1.98h18c1.1 0 2-.88 2-1.98V5c0-1.1-.9-2-2-2zm0 16.01H3V4.98h18v14.03z",
  speed: "M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z",
  aspect_ratio: "M19 12h-2v3h-3v2h5v-5zM7 9h3V7H5v5h2V9zm14-6H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16.01H3V4.99h18v14.02z",
  camera: "M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
  timer: "M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A8.962 8.962 0 0 0 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9a8.994 8.994 0 0 0 7.03-14.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z",
  open_in_new: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  subtitles: "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z",
  subtitles_off: "M20 4H6.83l2 2H20v11.17l1.76 1.76c.15-.28.24-.59.24-.93V6c0-1.1-.9-2-2-2zM1.04 3.87l1.2 1.2C2.09 5.35 2 5.66 2 6v12c0 1.1.9 2 2 2h13.17l2.96 2.96 1.41-1.41L2.45 2.45 1.04 3.87zM4 12h4v2H4v-2zm0 4h9.17l.83.83V18H4v-2z",
  shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z",
  send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  upload: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  cloud: "M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z",
  sync: "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  extension: "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z",
  history: "M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z",
  palette: "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z",
  keyboard: "M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z",
  lan: "M13 22h8v-7h-3v-4h-5V9h3V2H8v7h3v2H6v4H3v7h8v-7H8v-2h8v2h-3v7z",
  storage: "M2 20h20v-4H2v4zm2-3h2v2H4v-2zM2 4v4h20V4H2zm4 3H4V5h2v2zm-4 7h20v-4H2v4zm2-3h2v2H4v-2z",
  terminal: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16c1.1 0 2-.9 2-2V6a2 2 0 0 0-2-2zm0 14H4V8h16v10zm-2-1h-6v-2h6v2zM7.5 17l-1.41-1.41L8.67 13l-2.59-2.59L7.5 9l4 4-4 4z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
  key: "M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z",
  share: "M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z",
  copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  chevron_right: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  expand_more: "M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  grid: "M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z",
  error: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  auto_awesome: "M19 9l1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25L19 9zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12l-5.5-2.5zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25L19 15z",
  bug_report: "M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5c-.49 0-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z",
  store: "M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z",
  code: "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z",
  link: "M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z",
  swap: "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z",
  movie: "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  label: "M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z",
};

function initCookieShapes() {
  const makePolygon = (petals, amp) => {
    const pts = [];
    const steps = petals * 12;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const r = 46 + amp * Math.cos(petals * a);
      const x = (50 + r * Math.cos(a)).toFixed(2);
      const y = (50 + r * Math.sin(a)).toFixed(2);
      pts.push(x + "% " + y + "%");
    }
    return "polygon(" + pts.join(",") + ")";
  };
  document.documentElement.style.setProperty("--cookie4", makePolygon(4, 4.2));
  document.documentElement.style.setProperty("--cookie9", makePolygon(9, 2.8));
}
initCookieShapes();

/* ==========================================================================
 * DOM & UI Kit Primitives
 * ========================================================================== */
function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  if (attrs && typeof attrs === "object") {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
      else if (k === "dataset" && typeof v === "object") Object.assign(node.dataset, v);
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === "html") node.innerHTML = v;
      else if (v === true) node.setAttribute(k, "");
      else node.setAttribute(k, String(v));
    }
  }
  for (const ch of children.flat(Infinity)) {
    if (ch === undefined || ch === null || ch === false) continue;
    node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
  }
  return node;
}

function iconSvg(name) {
  const d = ICONS[name] || ICONS.info;
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
}

function iconNode(name, cls) {
  return el("span", { class: "icon" + (cls ? " " + cls : ""), html: iconSvg(name) });
}

function iconBtn(name, onClick, opts = {}) {
  const cls = ["icon-btn sl", opts.variant ? "is-" + opts.variant : "", opts.cls || ""].filter(Boolean).join(" ");
  const b = el("button", {
    type: "button",
    class: cls,
    title: opts.title || "",
    "aria-label": opts.title || name,
    disabled: !!opts.disabled,
    onClick,
  }, iconNode(name));
  if (opts.dot) b.append(el("span", { class: "dot" }));
  return b;
}

function button(label, onClick, opts = {}) {
  const variant = opts.variant || "filled";
  const cls = [
    "btn sl",
    "btn-" + variant,
    opts.small ? "is-small" : "",
    opts.tall ? "is-tall" : "",
    opts.badge ? "has-badge" : "",
    opts.cls || "",
  ].filter(Boolean).join(" ");
  const kids = [];
  if (opts.icon) kids.push(iconNode(opts.icon));
  if (label) kids.push(el("span", {}, label));
  if (opts.badge) kids.push(el("span", { class: "badge" }, String(opts.badge)));
  return el("button", {
    type: opts.type || "button",
    class: cls,
    disabled: !!opts.disabled,
    title: opts.title || "",
    onClick,
  }, ...kids);
}

function appBar(opts = {}) {
  const cls = [
    "app-bar",
    opts.compact ? "is-compact" : "",
    opts.large ? "is-large" : "",
    opts.back ? "has-back" : "",
  ].filter(Boolean).join(" ");
  const left = [];
  if (opts.back) {
    left.push(iconBtn("arrow_back", typeof opts.back === "function" ? opts.back : () => history.back(), { title: "返回" }));
  }
  const titleEl = typeof opts.title === "string"
    ? el("div", { class: "app-bar-title" }, opts.title)
    : el("div", { class: "app-bar-title" }, opts.title);
  const actions = el("div", { class: "app-bar-actions" }, ...(opts.actions || []));
  const bar = el("header", { class: cls }, ...left, titleEl, actions);
  if (opts.large) {
    const onScroll = () => bar.classList.toggle("is-collapsed", window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive: true });
    registerCleanup(() => window.removeEventListener("scroll", onScroll));
  }
  return bar;
}

function loadingNode(text) {
  return el("div", { class: "loading" },
    el("div", { class: "loader" }),
    text ? el("div", { class: "t-body-medium" }, text) : null
  );
}

function inlineLoading(text) {
  return el("div", { class: "loading is-inline" },
    el("div", { class: "loader is-small" }),
    text ? el("span", { class: "t-body-small" }, text) : null
  );
}

function emptyState(opts = {}) {
  return el("div", { class: "state" + (opts.compact ? " is-compact" : "") },
    el("div", { class: "state-badge" }, iconNode(opts.icon || "movie")),
    el("div", { class: "state-title" }, opts.title || "这里还没有内容"),
    opts.message ? el("div", { class: "state-msg" }, opts.message) : null,
    opts.actions && opts.actions.length ? el("div", { class: "state-actions" }, ...opts.actions) : null
  );
}

function errorState(err, retry, opts = {}) {
  const msg = typeof err === "string" ? err : (err && err.message ? err.message : "请求失败");
  const acts = [];
  if (typeof retry === "function") acts.push(button("重试", retry, { variant: "tonal", icon: "refresh", small: !!opts.compact }));
  if (opts.extraAction) acts.push(opts.extraAction);
  return el("div", { class: "state is-error" + (opts.compact ? " is-compact" : "") },
    el("div", { class: "state-badge" }, iconNode("error")),
    el("div", { class: "state-title" }, opts.title || "加载失败"),
    el("div", { class: "state-msg" }, msg),
    acts.length ? el("div", { class: "state-actions" }, ...acts) : null
  );
}

function splitList(rows, opts = {}) {
  const cls = ["split-list", opts.tight ? "is-tight" : "", opts.r20 ? "r20" : "", opts.cls || ""].filter(Boolean).join(" ");
  return el("div", { class: cls }, ...(rows || []).filter(Boolean));
}

function splitRow(child, opts = {}) {
  const cls = ["split-row", opts.onClick ? "is-clickable sl" : "", opts.cls || ""].filter(Boolean).join(" ");
  return el("div", { class: cls, onClick: opts.onClick }, child);
}

function section(title, child, opts = {}) {
  return el("section", { class: "section" },
    title ? el("div", { class: "section-header" },
      el("div", { class: "section-title" }, title),
      opts.desc ? el("div", { class: "section-desc" }, opts.desc) : null
    ) : null,
    child,
    opts.foot ? el("div", { class: "section-foot" }, opts.foot) : null
  );
}

function tile(opts = {}) {
  const tag = opts.onClick ? "button" : "div";
  const attrs = { class: "tile" + (opts.onClick ? " sl" : ""), onClick: opts.onClick };
  if (tag === "button") attrs.type = "button";
  const leading = opts.badgeIcon
    ? el("span", { class: "tile-badge" }, iconNode(opts.badgeIcon))
    : opts.icon
      ? el("span", { class: "tile-leading" }, iconNode(opts.icon))
      : null;
  const trailing = opts.trailing !== undefined
    ? el("span", { class: "tile-trailing" }, opts.trailing)
    : (opts.chevron ? el("span", { class: "tile-trailing" }, iconNode("chevron_right")) : null);
  return el(tag, attrs,
    leading,
    el("span", { class: "tile-body" },
      el("div", { class: "tile-title" }, opts.title || ""),
      opts.desc ? el("div", { class: "tile-desc" }, opts.desc) : null
    ),
    opts.value ? el("span", { class: "tile-value" }, opts.value) : null,
    trailing
  );
}

function switchTile(opts = {}) {
  let checked = !!opts.checked;
  const sw = el("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked ? "true" : "false",
    class: "m3-switch",
    onClick: (e) => {
      e.stopPropagation();
      toggle();
    },
  });
  function toggle() {
    checked = !checked;
    sw.setAttribute("aria-checked", checked ? "true" : "false");
    if (typeof opts.onChange === "function") opts.onChange(checked, sw);
  }
  return splitRow(tile({
    icon: opts.icon,
    badgeIcon: opts.badgeIcon,
    title: opts.title,
    desc: opts.desc,
    trailing: sw,
    onClick: toggle,
  }));
}

function sliderTile(opts = {}) {
  const min = opts.min ?? 0;
  const max = opts.max ?? 100;
  const step = opts.step ?? 1;
  let val = opts.value ?? min;
  const fmt = opts.format || ((v) => String(v));
  const valNode = el("span", { class: "slider-value" }, fmt(val));
  const input = el("input", { type: "range", min, max, step, value: val });
  const syncPct = (v) => {
    const pct = max === min ? 0 : ((v - min) / (max - min)) * 100;
    input.style.setProperty("--pct", pct.toFixed(1) + "%");
  };
  syncPct(val);
  input.addEventListener("input", () => {
    val = Number(input.value);
    valNode.textContent = fmt(val);
    syncPct(val);
    if (typeof opts.onInput === "function") opts.onInput(val);
  });
  input.addEventListener("change", () => {
    val = Number(input.value);
    if (typeof opts.onChange === "function") opts.onChange(val);
  });
  return splitRow(el("div", { class: "slider-tile" },
    el("div", { class: "slider-head" },
      el("span", { class: "slider-label" }, opts.label || ""),
      valNode
    ),
    opts.desc ? el("div", { class: "t-body-small c-variant", style: { marginTop: "2px" } }, opts.desc) : null,
    input
  ));
}

function filterChip(opts = {}) {
  const cls = ["chip sl", opts.selected ? "is-selected" : "", opts.static ? "is-static" : ""].filter(Boolean).join(" ");
  return el("button", { type: "button", class: cls, onClick: opts.onClick },
    opts.selected && !opts.noCheck ? iconNode("check") : (opts.icon ? iconNode(opts.icon) : null),
    el("span", {}, opts.label || ""),
    opts.count != null ? el("span", { class: "count" }, String(opts.count)) : null
  );
}

let _toastTimer = null;
function toast(msg, ms = 2600) {
  document.querySelectorAll(".toast").forEach((n) => n.remove());
  if (!msg) return;
  const node = el("div", { class: "toast", role: "status" }, String(msg));
  document.body.append(node);
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => node.remove(), ms);
}

function openSheet(opts = {}) {
  const mask = el("div", { class: "sheet-mask" });
  const body = el("div", { class: "sheet-body" });
  const close = () => {
    if (mask.classList.contains("is-closing")) return;
    mask.classList.add("is-closing");
    if (typeof opts.onClose === "function") {
      try { opts.onClose(); } catch (_) {}
    }
    setTimeout(() => mask.remove(), 170);
  };
  const header = el("div", { class: "sheet-header" + (opts.compact ? " is-compact" : "") },
    el("div", { class: "sheet-heading" },
      el("div", { class: "sheet-title" }, opts.title || ""),
      opts.desc ? el("div", { class: "sheet-desc" }, opts.desc) : null
    ),
    ...(opts.headerActions || []),
    iconBtn("close", close, { title: "关闭" })
  );
  const sheet = el("div", { class: "sheet" },
    el("div", { class: "sheet-handle" }),
    header,
    body
  );
  if (opts.content) {
    if (typeof opts.content === "function") {
      const c = opts.content({ close, body });
      if (c) body.append(c);
    } else {
      body.append(opts.content);
    }
  }
  mask.append(sheet);
  mask.addEventListener("click", (e) => { if (e.target === mask) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); window.removeEventListener("keydown", onKey); } };
  window.addEventListener("keydown", onKey);
  document.body.append(mask);
  return { close, body, sheet, mask };
}

function openMenu(anchor, items) {
  document.querySelectorAll(".menu").forEach((n) => n.remove());
  const menu = el("div", { class: "menu", role: "menu" });
  const close = () => {
    menu.remove();
    document.removeEventListener("click", onOutside, true);
    window.removeEventListener("keydown", onEsc);
  };
  for (const item of items) {
    if (!item) continue;
    if (item.divider) {
      menu.append(el("div", { class: "menu-divider" }));
      continue;
    }
    const cls = ["menu-item sl", item.selected ? "is-selected" : "", item.danger ? "is-danger" : ""].filter(Boolean).join(" ");
    const btn = el("button", {
      type: "button",
      class: cls,
      onClick: (e) => {
        e.stopPropagation();
        close();
        if (typeof item.onClick === "function") item.onClick();
      },
    },
      item.icon ? iconNode(item.icon) : null,
      el("span", {}, item.label || ""),
      item.sub ? el("span", { class: "sub" }, item.sub) : null
    );
    menu.append(btn);
  }
  document.body.append(menu);
  const rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 16, bottom: 56, right: 16, top: 16 };
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  let left = Math.min(rect.left, window.innerWidth - mw - 10);
  if (rect.right > window.innerWidth / 2) left = Math.max(10, rect.right - mw);
  left = Math.max(10, Math.min(left, window.innerWidth - mw - 10));
  let top = rect.bottom + 6;
  if (top + mh > window.innerHeight - 10) top = Math.max(10, rect.top - mh - 6);
  menu.style.left = left + "px";
  menu.style.top = top + "px";

  const onOutside = (e) => { if (!menu.contains(e.target)) close(); };
  const onEsc = (e) => { if (e.key === "Escape") close(); };
  setTimeout(() => {
    document.addEventListener("click", onOutside, true);
    window.addEventListener("keydown", onEsc);
  }, 0);
  return { close };
}

function onScrollBottom(cb) {
  let ticking = false;
  const handler = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const doc = document.documentElement;
      if (window.innerHeight + window.scrollY >= doc.scrollHeight - 480) cb();
    });
  };
  window.addEventListener("scroll", handler, { passive: true });
  registerCleanup(() => window.removeEventListener("scroll", handler));
}

/* ==========================================================================
 * Formatting, Image Mirror & Network Helpers
 * ========================================================================== */
function getDeviceId() {
  let id = localStorage.getItem("kazumi_device_id");
  if (!id) {
    id = "web-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localStorage.setItem("kazumi_device_id", id);
  }
  return id;
}

function getImageMirror() {
  return localStorage.getItem("webImageMirror") === "1";
}

function setImageMirror(enabled) {
  localStorage.setItem("webImageMirror", enabled ? "1" : "0");
}

function bangumiImageUrl(url) {
  if (!url) return "/assets/noface.jpeg";
  let u = String(url).trim();
  if (u.startsWith("//")) u = "https:" + u;
  if (getImageMirror()) {
    u = u.replace("https://lain.bgm.tv/", "https://api.kazumi.fyi/lain/");
  }
  return u;
}

function bestBangumiImage(images) {
  if (!images) return "/assets/noface.jpeg";
  if (typeof images === "string") return bangumiImageUrl(images);
  const raw = images.large || images.common || images.medium || images.small || images.grid || "";
  return bangumiImageUrl(raw);
}

function coverImg(src, cls, alt) {
  const img = el("img", {
    src: bangumiImageUrl(src),
    class: cls || "",
    alt: alt || "",
    loading: "lazy",
    referrerpolicy: "no-referrer",
  });
  img.addEventListener("error", () => {
    if (!img.dataset.fallback) {
      img.dataset.fallback = "1";
      img.src = "/assets/noface.jpeg";
    }
  });
  return img;
}

function formatDuration(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const p = (n) => (n < 10 ? "0" + n : String(n));
  return h > 0 ? h + ":" + p(m) + ":" + p(r) : p(m) + ":" + p(r);
}

function formatPosition(ms) {
  return formatDuration(Math.floor((Number(ms) || 0) / 1000));
}

function formatRelTime(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
  if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

async function _handleJsonResponse(res) {
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (res.status === 401 && data && data.code === "unauthorized") {
    AUTH_STATE.authEnabled = true;
    AUTH_STATE.authenticated = false;
    showAuthGate();
    throw new Error("需要访问口令解锁");
  }
  if (!res.ok) {
    const err = new Error((data && data.message) || ("HTTP " + res.status));
    err.status = res.status;
    err.code = data && data.code;
    err.data = data;
    throw err;
  }
  return data;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  return _handleJsonResponse(res);
}

async function fetchJsonPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return _handleJsonResponse(res);
}

async function fetchJsonPut(url, body) {
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  return _handleJsonResponse(res);
}

async function fetchJsonDelete(url) {
  const res = await fetch(url, { method: "DELETE" });
  return _handleJsonResponse(res);
}

/* ==========================================================================
 * Password Unlock Gate (for Render ACCESS_PASSWORD)
 * ========================================================================== */
function showAuthGate() {
  if (document.getElementById("kazumi-auth-gate")) return;
  const pwdInput = el("input", {
    type: "password",
    class: "text-field",
    placeholder: "请输入访问口令",
    autocomplete: "current-password",
  });
  const hint = el("div", { class: "field-hint" });
  const submitBtn = button("进入 Kazumi", doLogin, { icon: "lock" });
  submitBtn.style.width = "100%";

  async function doLogin() {
    const password = pwdInput.value;
    if (!password) { hint.textContent = "请输入访问口令"; return; }
    hint.textContent = "";
    submitBtn.disabled = true;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        hint.textContent = data.message || "口令错误";
        submitBtn.disabled = false;
        pwdInput.focus();
        return;
      }
      AUTH_STATE.authenticated = true;
      gate.remove();
      await initAfterAuth();
      dispatch();
    } catch (e) {
      hint.textContent = e.message || "网络错误";
      submitBtn.disabled = false;
    }
  }

  pwdInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  const gate = el("div", { id: "kazumi-auth-gate", class: "auth-gate" },
    el("div", { class: "auth-card" },
      el("img", { src: "/assets/icon-192.png", class: "auth-logo", alt: "Kazumi" }),
      el("div", { class: "t-headline-small w700" }, "Kazumi"),
      el("div", { class: "t-body-medium c-variant" }, "该实例已开启私密访问保护，请输入口令解锁"),
      pwdInput,
      hint,
      submitBtn
    )
  );
  document.body.append(gate);
  setTimeout(() => pwdInput.focus(), 60);
}

/* ==========================================================================
 * Navigation Rail / Bottom Bar & Router
 * ========================================================================== */
const NAV_TABS = [
  { id: "popular", label: "推荐", icon: "home_outline", activeIcon: "home", path: "/home?tab=popular" },
  { id: "timeline", label: "时间表", icon: "timeline_outline", activeIcon: "timeline", path: "/home?tab=timeline" },
  { id: "collect", label: "追番", icon: "favorite_border", activeIcon: "favorite", path: "/home?tab=collect" },
  { id: "my", label: "我的", icon: "person_outline", activeIcon: "person", path: "/home?tab=my" },
];

function renderNavRail(activeTab) {
  const rail = document.getElementById("nav-rail");
  if (!rail) return;
  rail.innerHTML = "";
  rail.append(
    el("button", {
      type: "button",
      class: "nav-search sl",
      title: "搜索番剧与规则",
      onClick: () => go("/search"),
    }, iconNode("search")),
    el("div", { class: "nav-main" },
      ...NAV_TABS.map((t) => {
        const isActive = t.id === activeTab;
        return el("button", {
          type: "button",
          class: "nav-item" + (isActive ? " is-active" : ""),
          onClick: () => go(t.path),
        },
          el("span", { class: "nav-indicator sl" }, iconNode(isActive ? t.activeIcon : t.icon)),
          el("span", { class: "label" }, t.label)
        );
      })
    )
  );
}

function go(path) {
  const target = path.startsWith("#") ? path : "#" + (path.startsWith("/") ? path : "/" + path);
  if (location.hash === target) {
    dispatch();
  } else {
    location.hash = target;
  }
}

function parseRoute() {
  const raw = (location.hash || "#/home?tab=popular").replace(/^#/, "");
  const [pathPart, qs] = raw.split("?");
  const path = pathPart || "/home";
  const params = {};
  if (qs) {
    for (const [k, v] of new URLSearchParams(qs).entries()) {
      params[k] = v;
    }
  }
  return { path, params, raw };
}

/* ==========================================================================
 * Shared Bangumi Actions (Collect, Aliases, Rating Dialog, Source Picker)
 * ========================================================================== */
async function setCollectStatus(bangumi, type) {
  const bid = Number(bangumi.id || bangumi.bangumiId || 0);
  if (!bid) return;
  const res = await fetchJsonPut("/api/collect", { bangumiId: bid, type, bangumi });
  if (type === 0) {
    KazumiStore.saveCollectRecord({ bangumiId: bid, type: 0 });
    toast("已移出追番列表");
  } else {
    KazumiStore.saveCollectRecord(res.record || { bangumiId: bid, type, time: Date.now(), bangumi });
    toast("已标记为「" + (COLLECT_LABELS[type] || "已追番") + "」");
  }
  return res;
}

function openCollectMenu(anchor, bangumi, currentType, onChanged) {
  const items = [1, 2, 3, 4, 5].map((t) => ({
    label: COLLECT_LABELS[t],
    icon: t === currentType ? "check" : "bookmark_border",
    selected: t === currentType,
    onClick: async () => {
      try {
        await setCollectStatus(bangumi, t);
        if (onChanged) onChanged(t);
      } catch (e) { toast(e.message); }
    },
  }));
  if (currentType > 0) {
    items.push({ divider: true });
    items.push({
      label: "取消追番",
      icon: "delete",
      danger: true,
      onClick: async () => {
        try {
          await setCollectStatus(bangumi, 0);
          if (onChanged) onChanged(0);
        } catch (e) { toast(e.message); }
      },
    });
  }
  openMenu(anchor, items);
}

function openBangumiRateSheet(bangumi, currentType) {
  if (!APP_SETTINGS.bangumiToken) {
    openSheet({
      title: "Bangumi 账号同步",
      desc: "同步评分与短评需要先配置 Bangumi Access Token",
      content: ({ close }) => el("div", {},
        el("p", { class: "t-body-medium c-variant" }, "前往「设置 → 同步与备份」绑定 Bangumi Access Token 后，即可直接在本页面向 Bangumi 提交追番状态、1~10 分评价和吐槽。"),
        el("div", { class: "sheet-actions" },
          button("取消", close, { variant: "text" }),
          button("前往配置", () => { close(); go("/settings/sync"); }, { icon: "sync" })
        )
      ),
    });
    return;
  }
  let selectedType = currentType > 0 ? currentType : 1;
  let rateVal = 8;
  const commentArea = el("textarea", { class: "text-field", rows: 3, placeholder: "写下你的简评/吐槽（可选，最多 200 字）" });
  const typeChips = el("div", { class: "chips" });
  function renderTypeChips() {
    typeChips.innerHTML = "";
    for (const t of [1, 2, 3, 4, 5]) {
      typeChips.append(filterChip({
        label: COLLECT_LABELS[t],
        selected: selectedType === t,
        onClick: () => { selectedType = t; renderTypeChips(); },
      }));
    }
  }
  renderTypeChips();

  const rateSlider = sliderTile({
    label: "评分（0 表示不评分）",
    min: 0, max: 10, step: 1, value: rateVal,
    format: (v) => v === 0 ? "不评分" : v + " 分",
    onInput: (v) => { rateVal = v; },
  });

  openSheet({
    title: "提交评分与吐槽到 Bangumi",
    desc: bangumi.nameCn || bangumi.name,
    content: ({ close }) => el("div", {},
      el("div", { class: "field-group" }, el("div", { class: "field-label" }, "收藏状态"), typeChips),
      splitList([rateSlider]),
      el("div", { class: "field-group", style: { marginTop: "14px" } },
        el("div", { class: "field-label" }, "短评 / 吐槽"),
        commentArea
      ),
      el("div", { class: "sheet-actions" },
        button("取消", close, { variant: "text" }),
        button("同步到 Bangumi", async () => {
          try {
            await setCollectStatus(bangumi, selectedType);
            await fetchJsonPost("/api/bangumi/account/push", {
              bangumiId: bangumi.id,
              type: selectedType,
              rate: rateVal > 0 ? rateVal : null,
              comment: commentArea.value.trim() || null,
            });
            toast("已同步状态与评价到 Bangumi");
            close();
          } catch (e) { toast(e.message); }
        }, { icon: "check" })
      )
    ),
  });
}

function openAliasesSheet(bangumi) {
  const bid = bangumi.id;
  const input = el("input", { class: "text-field", placeholder: "输入番剧别名（用于规则多源检索）" });
  const listWrap = el("div", { class: "chips", style: { marginTop: "12px" } });

  function renderAliases() {
    listWrap.innerHTML = "";
    const aliases = KazumiStore.getAliases(bid);
    if (!aliases.length) {
      listWrap.append(el("span", { class: "t-body-small c-variant" }, "暂未添加自定义别名"));
      return;
    }
    for (const a of aliases) {
      listWrap.append(el("button", {
        type: "button",
        class: "chip is-selected sl",
        title: "点击删除该别名",
        onClick: () => { KazumiStore.removeAlias(bid, a); renderAliases(); },
      }, el("span", {}, a), iconNode("close")));
    }
  }
  renderAliases();

  const add = () => {
    const v = input.value.trim();
    if (!v) return;
    KazumiStore.addAlias(bid, v);
    input.value = "";
    renderAliases();
    toast("已添加别名「" + v + "」");
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });

  openSheet({
    title: "管理检索别名",
    desc: "当视频源站使用简称或日文名时，添加别名可一键切换搜索关键词",
    content: () => el("div", {},
      el("div", { class: "field-row" }, input, button("添加", add, { icon: "add", small: true })),
      listWrap
    ),
  });
}

/* ==========================================================================
 * Captcha Flow & Multi-Rule Source Picker
 * ========================================================================== */
function startCaptchaFlow(pluginName, keyword, onDone) {
  const sheetRef = openSheet({
    title: "人机验证 · " + pluginName,
    desc: "部分视频源站点开启了反爬验证，完成验证后将自动保存 Cookie 并重新检索",
    onClose: () => { fetchJsonPost("/api/captcha/cancel", {}).catch(() => {}); },
    content: ({ body, close }) => {
      body.append(loadingNode("正在启动验证会话…"));
      (async () => {
        try {
          const res = await fetchJsonPost("/api/captcha/start", { plugin: pluginName, keyword });
          body.innerHTML = "";
          if (res.status === "verified") {
            toast("自动验证已通过！");
            close();
            if (onDone) onDone(true);
            return;
          }
          if (res.status === "challenge" && res.image) {
            const img = el("img", { src: res.image, class: "captcha-image", alt: "验证码" });
            const codeInput = el("input", { class: "text-field", placeholder: "请输入图片中的验证码" });
            const hint = el("div", { class: "field-hint" });
            const submit = async () => {
              const code = codeInput.value.trim();
              if (!code) { hint.textContent = "请输入验证码"; return; }
              hint.textContent = "";
              submitBtn.disabled = true;
              try {
                const subRes = await fetchJsonPost("/api/captcha/submit", { plugin: pluginName, code });
                if (subRes.ok) {
                  toast("验证通过！");
                  close();
                  if (onDone) onDone(true);
                } else {
                  hint.textContent = "验证码可能不正确，请重试或重新加载";
                  submitBtn.disabled = false;
                }
              } catch (e) {
                hint.textContent = e.message;
                submitBtn.disabled = false;
              }
            };
            const submitBtn = button("提交验证", submit, { icon: "check" });
            codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
            body.append(
              img,
              el("div", { class: "field-row" }, codeInput, submitBtn),
              hint
            );
            setTimeout(() => codeInput.focus(), 60);
          } else {
            body.append(errorState("未返回有效验证码内容"));
          }
        } catch (e) {
          body.innerHTML = "";
          body.append(errorState(e, () => { close(); startCaptchaFlow(pluginName, keyword, onDone); }, { compact: true }));
        }
      })();
      return null;
    },
  });
  return sheetRef;
}

function openSourcePicker(bangumi) {
  const candidates = [];
  const pushCand = (s) => {
    const t = (s || "").trim();
    if (t && !candidates.includes(t)) candidates.push(t);
  };
  pushCand(bangumi.nameCn);
  pushCand(bangumi.name);
  for (const a of (bangumi.alias || [])) pushCand(a);
  for (const a of KazumiStore.getAliases(bangumi.id)) pushCand(a);

  let currentKeyword = candidates[0] || "";

  openSheet({
    title: "选择视频源",
    desc: bangumi.nameCn || bangumi.name,
    content: ({ body, close }) => {
      const kwInput = el("input", { type: "search", value: currentKeyword, placeholder: "输入番剧名搜索全部已安装规则…" });
      const searchBar = el("div", { class: "search-box is-high" },
        iconNode("search"),
        kwInput,
        button("重搜", () => runAll(kwInput.value.trim()), { variant: "tonal", small: true })
      );
      const aliasRow = el("div", { class: "chips", style: { margin: "10px 0 12px" } });
      for (const c of candidates.slice(0, 8)) {
        aliasRow.append(filterChip({
          label: c,
          noCheck: true,
          onClick: () => { kwInput.value = c; runAll(c); },
        }));
      }
      const listArea = el("div", {});
      body.append(searchBar, candidates.length > 1 ? aliasRow : null, listArea);

      kwInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") runAll(kwInput.value.trim());
      });

      let runToken = 0;

      async function runAll(keyword) {
        if (!keyword) { toast("请输入检索关键词"); return; }
        currentKeyword = keyword;
        const myToken = ++runToken;
        listArea.innerHTML = "";
        listArea.append(inlineLoading("正在加载已安装规则…"));
        let plugins = [];
        try {
          plugins = await fetchJson("/api/plugins");
        } catch (e) {
          listArea.innerHTML = "";
          listArea.append(errorState(e, () => runAll(keyword), { compact: true }));
          return;
        }
        if (myToken !== runToken) return;
        listArea.innerHTML = "";
        if (!plugins.length) {
          listArea.append(emptyState({
            compact: true,
            icon: "extension",
            title: "尚未安装任何规则",
            message: "请先从规则仓库安装或导入至少一条视频源规则",
            actions: [button("前往规则仓库", () => { close(); go("/my/rules?shop=1"); }, { icon: "store" })],
          }));
          return;
        }

        const groupsWrap = el("div", {});
        listArea.append(groupsWrap);

        // Concurrency pool of 4 so Render free tier stays responsive
        const queue = plugins.slice();
        const groupNodes = new Map();

        for (const p of plugins) {
          const statusEl = el("span", { class: "src-status" }, "排队检索…");
          const bodyInner = el("div", {}, inlineLoading("正在检索 " + p.name + "…"));
          const group = el("div", { class: "src-group" },
            el("button", {
              type: "button",
              class: "src-head sl",
              onClick: () => group.classList.toggle("is-open"),
            },
              el("span", { class: "src-name" }, p.name),
              statusEl,
              el("span", { class: "src-chev" }, iconNode("expand_more"))
            ),
            el("div", { class: "src-body" }, el("div", {}, bodyInner))
          );
          groupsWrap.append(group);
          groupNodes.set(p.name, { group, statusEl, bodyInner, plugin: p });
        }

        async function searchOne(p) {
          const ref = groupNodes.get(p.name);
          if (!ref || myToken !== runToken) return;
          ref.statusEl.className = "src-status";
          ref.statusEl.textContent = "检索中…";
          try {
            const res = await fetchJson("/api/search?plugin=" + encodeURIComponent(p.name) + "&keyword=" + encodeURIComponent(keyword));
            if (myToken !== runToken) return;
            const items = res.items || [];
            ref.bodyInner.innerHTML = "";
            if (!items.length) {
              ref.statusEl.textContent = "无结果";
              ref.bodyInner.append(el("div", { class: "t-body-small c-variant", style: { padding: "8px 16px 14px" } }, "该源站未找到匹配番剧"));
              return;
            }
            ref.statusEl.className = "src-status is-ok";
            ref.statusEl.textContent = items.length + " 条结果";
            ref.group.classList.add("is-open");
            // Move successful groups toward the top
            groupsWrap.prepend(ref.group);

            let expanded = false;
            const renderItems = () => {
              ref.bodyInner.innerHTML = "";
              const shown = expanded ? items : items.slice(0, 6);
              const rows = shown.map((it) => splitRow(
                el("div", { class: "src-row" },
                  el("span", { class: "name" }, it.name),
                  el("span", { class: "play" }, iconNode("play"))
                ),
                {
                  onClick: () => {
                    close();
                    go("/episodes?plugin=" + encodeURIComponent(p.name) +
                      "&src=" + encodeURIComponent(it.src) +
                      "&bangumiId=" + encodeURIComponent(bangumi.id) +
                      "&title=" + encodeURIComponent(bangumi.nameCn || bangumi.name || it.name));
                  },
                }
              ));
              if (!expanded && items.length > 6) {
                rows.push(splitRow(
                  el("div", { class: "src-more" }, "展开其余 " + (items.length - 6) + " 条结果", iconNode("expand_more")),
                  { onClick: () => { expanded = true; renderItems(); } }
                ));
              }
              ref.bodyInner.append(splitList(rows, { tight: true }));
            };
            renderItems();
          } catch (e) {
            if (myToken !== runToken) return;
            ref.bodyInner.innerHTML = "";
            if (e.code === "captcha_required" || e.status === 423) {
              ref.statusEl.className = "src-status is-error";
              ref.statusEl.textContent = "需人机验证";
              ref.group.classList.add("is-open");
              ref.bodyInner.append(splitList([splitRow(
                el("div", { class: "src-inline" },
                  iconNode("shield"),
                  el("div", {},
                    el("div", { class: "t-body-medium" }, "该规则需要完成人机验证"),
                    el("div", { class: "acts" },
                      button("开始验证", () => startCaptchaFlow(p.name, keyword, () => searchOne(p)), { small: true, icon: "shield" }),
                      button("重试", () => searchOne(p), { variant: "tonal", small: true })
                    )
                  )
                )
              )]));
            } else {
              ref.statusEl.className = "src-status is-error";
              ref.statusEl.textContent = "失败";
              ref.bodyInner.append(splitList([splitRow(
                el("div", { class: "src-inline" },
                  iconNode("error"),
                  el("div", {},
                    el("div", { class: "t-body-small c-variant" }, e.message || "检索失败"),
                    el("div", { class: "acts" }, button("重试", () => searchOne(p), { variant: "tonal", small: true, icon: "refresh" }))
                  )
                )
              )]));
            }
          }
        }

        const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length && myToken === runToken) {
            const next = queue.shift();
            if (next) await searchOne(next);
          }
        });
        await Promise.all(workers);
      }

      runAll(currentKeyword);
      return null;
    },
  });
}

/* ==========================================================================
 * Shared Episodes Loader, Episode Panel & Episode Comments Panel
 * ========================================================================== */
async function loadRoadsAndHistory(plugin, src, bangumiId) {
  const [epRes, histRes] = await Promise.all([
    fetchJson("/api/episodes?plugin=" + encodeURIComponent(plugin) + "&src=" + encodeURIComponent(src)),
    bangumiId
      ? fetchJson("/api/history?bangumiId=" + encodeURIComponent(bangumiId) + "&pluginName=" + encodeURIComponent(plugin)).catch(() => ({ history: null }))
      : Promise.resolve({ history: null }),
  ]);
  return { roads: epRes.roads || [], history: histRes.history || null };
}

function playEpisodeParams(ctx) {
  const qs = new URLSearchParams();
  if (ctx.plugin) qs.set("plugin", ctx.plugin);
  if (ctx.src) qs.set("src", ctx.src);
  if (ctx.bangumiId) qs.set("bangumiId", String(ctx.bangumiId));
  if (ctx.title) qs.set("title", ctx.title);
  if (ctx.road != null) qs.set("road", String(ctx.road));
  if (ctx.episode != null) qs.set("episode", String(ctx.episode));
  if (ctx.episodeUrl) qs.set("episodeUrl", ctx.episodeUrl);
  if (ctx.episodeName) qs.set("episodeName", ctx.episodeName);
  return "/play?" + qs.toString();
}

function episodePanel(opts) {
  const roads = opts.roads || [];
  let roadIdx = Math.max(0, Math.min(opts.road || 0, Math.max(0, roads.length - 1)));
  let reverseOrder = false;
  let rangeIndex = 0;
  const CHUNK = 50;
  const wrap = el("div", {});

  function render() {
    wrap.innerHTML = "";
    if (!roads.length) {
      wrap.append(emptyState({ compact: true, icon: "movie", title: "未解析到播放线路", message: "该视频源暂无可用剧集，请尝试切换其他规则源" }));
      return;
    }
    const road = roads[roadIdx] || { name: "线路 1", data: [], identifier: [] };
    const urls = road.data || [];
    const names = road.identifier || [];

    if (roads.length > 1) {
      const routeBtn = el("button", {
        type: "button",
        class: "route-btn sl",
        onClick: (e) => {
          openMenu(e.currentTarget, roads.map((r, i) => ({
            label: (r.name || ("播放列表 " + (i + 1))) + " (" + (r.data ? r.data.length : 0) + " 集)",
            selected: i === roadIdx,
            icon: i === roadIdx ? "check" : "list",
            onClick: () => { roadIdx = i; rangeIndex = 0; if (opts.onRoadChange) opts.onRoadChange(i); render(); },
          })));
        },
      },
        iconNode("swap"),
        el("div", { class: "body" },
          el("div", { class: "label" }, "当前播放线路（共 " + roads.length + " 条）"),
          el("div", { class: "name" }, road.name || ("播放列表 " + (roadIdx + 1)))
        ),
        iconNode("expand_more")
      );
      wrap.append(routeBtn);
    }

    const toolbar = el("div", { class: "ep-toolbar" },
      el("span", { class: "ep-count" }, "共 " + urls.length + " 集"),
      el("div", { style: { display: "flex", gap: "4px" } },
        opts.currentEpisode ? button("定位当前", () => {
          const elCur = wrap.querySelector(".ep-row.is-current");
          if (elCur) elCur.scrollIntoView({ behavior: "smooth", block: "center" });
        }, { variant: "text", small: true }) : null,
        button(reverseOrder ? "倒序" : "正序", () => { reverseOrder = !reverseOrder; render(); }, { variant: "text", small: true, icon: "sort" })
      )
    );
    wrap.append(toolbar);

    const indexed = urls.map((u, i) => ({
      ep: i + 1,
      url: u,
      name: (names[i] || ("第 " + (i + 1) + " 话")).trim(),
    }));
    const ordered = reverseOrder ? indexed.slice().reverse() : indexed;

    // Chunk selector for long anime (> 50 episodes)
    let pageItems = ordered;
    if (ordered.length > CHUNK) {
      const strip = el("div", { class: "ep-range-strip" });
      const totalPages = Math.ceil(ordered.length / CHUNK);
      if (rangeIndex >= totalPages) rangeIndex = 0;
      for (let p = 0; p < totalPages; p++) {
        const start = p * CHUNK + 1;
        const end = Math.min(ordered.length, (p + 1) * CHUNK);
        strip.append(filterChip({
          label: start + "-" + end,
          selected: p === rangeIndex,
          noCheck: true,
          onClick: () => { rangeIndex = p; render(); },
        }));
      }
      wrap.append(strip);
      pageItems = ordered.slice(rangeIndex * CHUNK, (rangeIndex + 1) * CHUNK);
    }

    const progresses = (opts.history && opts.history.progresses) || {};
    const rows = pageItems.map((item) => {
      const isCur = opts.currentEpisode === item.ep && (opts.currentRoad == null || opts.currentRoad === roadIdx);
      const prog = progresses[String(item.ep)];
      const subText = prog && prog.progressMs > 3000 ? "上次观看到 " + formatPosition(prog.progressMs) : "";
      const rowContent = el("div", { class: "ep-row" + (isCur ? " is-current" : "") },
        el("div", { class: "body" },
          el("div", { class: "clamp-1" }, item.name),
          subText ? el("div", { class: "sub" }, subText) : null
        ),
        isCur ? iconNode("play") : null
      );
      return splitRow(rowContent, {
        onClick: () => {
          if (opts.onSelect) {
            opts.onSelect({ road: roadIdx, episode: item.ep, episodeUrl: item.url, episodeName: item.name });
          }
        },
      });
    });
    wrap.append(splitList(rows, { tight: true }));
  }

  render();
  return wrap;
}

function episodeCommentsPanel(bangumiId, initialEp) {
  const wrap = el("div", {});
  let epNum = Math.max(1, Number(initialEp) || 1);

  async function load() {
    wrap.innerHTML = "";
    if (!bangumiId) {
      wrap.append(emptyState({ compact: true, icon: "info", title: "无关联 Bangumi 条目", message: "规则直搜播放暂无 Bangumi 分集评论" }));
      return;
    }
    const header = el("div", { class: "ep-comments-header" },
      iconBtn("skip_previous", () => { if (epNum > 1) { epNum--; load(); } }, { title: "上一话评论", disabled: epNum <= 1 }),
      el("div", { class: "ep-comments-current" },
        el("div", { class: "ep-comments-current-top" }, "第 " + epNum + " 话 讨论"),
        el("div", { class: "ep-comments-current-sub" }, "正在加载 Bangumi 剧集吐槽…")
      ),
      iconBtn("skip_next", () => { epNum++; load(); }, { title: "下一话评论" })
    );
    wrap.append(header, inlineLoading("加载评论中…"));

    try {
      const res = await fetchJson("/api/bangumi/" + bangumiId + "/episode-comments?episode=" + epNum);
      wrap.innerHTML = "";
      const epInfo = res.episode;
      header.querySelector(".ep-comments-current-sub").textContent = epInfo
        ? ((epInfo.nameCn || epInfo.name || "") || ("共 " + (res.items || []).length + " 条讨论"))
        : "暂无该话信息";
      wrap.append(header);
      const items = res.items || [];
      if (!items.length) {
        wrap.append(emptyState({ compact: true, icon: "info", title: "本话暂无评论" }));
        return;
      }
      const rows = items.map((c) => {
        const u = c.user || {};
        const replies = (c.replies || []).slice(0, 3);
        return splitRow(el("div", { class: "comment-row" },
          el("div", { class: "comment-head" },
            coverImg(u.avatar, "", ""),
            el("span", { class: "username" }, u.nickname || u.username || "匿名"),
            el("span", { class: "time" }, formatRelTime(c.createdAt))
          ),
          el("div", { class: "comment-body" }, c.content || ""),
          replies.length ? el("div", { style: { marginTop: "8px", paddingLeft: "12px", borderLeft: "2px solid var(--outline-variant)" } },
            ...replies.map((r) => el("div", { class: "t-body-small c-variant", style: { marginTop: "4px" } },
              el("strong", {}, (r.user && (r.user.nickname || r.user.username)) || "匿名"),
              "：",
              r.content || ""
            ))
          ) : null
        ));
      });
      wrap.append(splitList(rows, { tight: true }));
    } catch (e) {
      wrap.innerHTML = "";
      wrap.append(header, errorState(e, load, { compact: true }));
    }
  }

  load();
  return wrap;
}

/* ==========================================================================
 * TAB 1: Popular (推荐 + 15 官方标签)
 * ========================================================================== */
const _popularState = { tag: "", items: [], offset: 0, loading: false, ended: false };

function renderTabPopular(app) {
  renderNavRail("popular");
  const isCompactNav = () => window.matchMedia("(max-width: 767px), ((orientation: portrait) and (max-width: 839px))").matches;

  const titleText = el("span", { class: "text" }, _popularState.tag || "推荐");
  const titleBtn = el("button", {
    type: "button",
    class: "title-btn sl",
    onClick: (e) => {
      openMenu(e.currentTarget, [
        { label: "推荐（热门趋势）", selected: !_popularState.tag, icon: !_popularState.tag ? "check" : "auto_awesome", onClick: () => selectTag("") },
        { divider: true },
        ...DEFAULT_ANIME_TAGS.map((t) => ({
          label: t,
          selected: _popularState.tag === t,
          icon: _popularState.tag === t ? "check" : "label",
          onClick: () => selectTag(t),
        })),
      ]);
    },
  }, titleText, iconNode("expand_more"));

  const actions = [];
  if (isCompactNav()) {
    actions.push(iconBtn("image_search", () => go("/search/image"), { title: "以图搜番" }));
    actions.push(iconBtn("search", () => go("/search"), { title: "搜索番剧" }));
  } else {
    actions.push(iconBtn("image_search", () => go("/search/image"), { title: "以图搜番 (trace.moe)" }));
  }
  actions.push(iconBtn("refresh", () => resetAndLoad(), { title: "刷新推荐" }));

  const bar = appBar({ title: titleBtn, large: true, actions });

  // Horizontal quick tag strip
  const tagStrip = el("div", { class: "chips", style: { flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", paddingBottom: "12px" } });
  function renderTagStrip() {
    tagStrip.innerHTML = "";
    tagStrip.append(filterChip({
      label: "热门",
      selected: !_popularState.tag,
      noCheck: true,
      onClick: () => selectTag(""),
    }));
    for (const t of DEFAULT_ANIME_TAGS) {
      tagStrip.append(filterChip({
        label: t,
        selected: _popularState.tag === t,
        noCheck: true,
        onClick: () => selectTag(t),
      }));
    }
  }
  renderTagStrip();

  const progressLine = el("div", { class: "progress-line", style: { display: "none" } });
  const grid = el("div", { class: "poster-grid" });
  const foot = el("div", { class: "results-more" });
  const topFab = el("button", {
    type: "button",
    class: "fab is-hidden sl",
    title: "回到顶部",
    onClick: () => window.scrollTo({ top: 0, behavior: "smooth" }),
  }, iconNode("arrow_upward"));

  const onScrollFab = () => topFab.classList.toggle("is-hidden", window.scrollY < 420);
  window.addEventListener("scroll", onScrollFab, { passive: true });
  registerCleanup(() => window.removeEventListener("scroll", onScrollFab));

  const page = el("div", { class: "page wide" }, tagStrip, progressLine, grid, foot);
  app.append(bar, page, topFab);

  function selectTag(tag) {
    if (_popularState.tag === tag && _popularState.items.length) return;
    _popularState.tag = tag;
    titleText.textContent = tag || "推荐";
    renderTagStrip();
    resetAndLoad();
  }

  function appendCards(items) {
    for (const item of items) {
      const card = el("article", {
        class: "poster-card sl",
        onClick: () => go("/bangumi?id=" + item.id),
      },
        el("div", { class: "poster-img-wrap" },
          coverImg(bestBangumiImage(item.images), "", item.nameCn || item.name),
          item.ratingScore ? el("span", { class: "poster-score" }, Number(item.ratingScore).toFixed(1)) : null
        ),
        el("div", { class: "name" }, item.nameCn || item.name || "未命名")
      );
      grid.append(card);
    }
  }

  async function loadMore() {
    if (_popularState.loading || _popularState.ended) return;
    _popularState.loading = true;
    progressLine.style.display = _popularState.items.length === 0 ? "block" : "none";
    foot.innerHTML = "";
    foot.append(inlineLoading("加载更多番剧…"));
    try {
      const url = "/api/popular?offset=" + _popularState.offset + "&limit=24" +
        (_popularState.tag ? "&tag=" + encodeURIComponent(_popularState.tag) : "");
      const res = await fetchJson(url);
      const batch = res.items || [];
      // Deduplicate by id
      const seen = new Set(_popularState.items.map((x) => x.id));
      const fresh = batch.filter((x) => x && x.id && !seen.has(x.id));
      _popularState.items.push(...fresh);
      _popularState.offset += batch.length;
      if (!batch.length) _popularState.ended = true;
      appendCards(fresh);
      foot.innerHTML = "";
      if (_popularState.ended) {
        foot.append(el("span", { class: "t-body-small c-variant" }, "已经到底啦"));
      } else {
        foot.append(button("加载更多", loadMore, { variant: "tonal", small: true }));
      }
    } catch (e) {
      foot.innerHTML = "";
      if (!_popularState.items.length) {
        foot.append(errorState(e, () => loadMore()));
      } else {
        foot.append(errorState(e, () => loadMore(), { compact: true }));
      }
    } finally {
      _popularState.loading = false;
      progressLine.style.display = "none";
    }
  }

  function resetAndLoad() {
    _popularState.items = [];
    _popularState.offset = 0;
    _popularState.ended = false;
    grid.innerHTML = "";
    loadMore();
  }

  if (_popularState.items.length) {
    appendCards(_popularState.items);
    foot.append(button("加载更多", loadMore, { variant: "tonal", small: true }));
  } else {
    loadMore();
  }
  onScrollBottom(loadMore);
}

/* ==========================================================================
 * TAB 2: Timeline (20 年新番季度时间表 + 排序与筛选)
 * ========================================================================== */
function renderTabTimeline(app) {
  renderNavRail("timeline");
  const now = new Date();
  let currentSeason = ""; // empty = latest calendar
  let activeDay = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  let sortBy = "default"; // default | score | rank | date
  let onlyCollected = false;
  let daysData = [[], [], [], [], [], [], []];
  let collectedIds = new Set();

  const seasonLabel = () => {
    if (!currentSeason) return "本季新番";
    const [y, q] = currentSeason.split("-");
    const qNames = { "1": "冬 (1月)", "2": "春 (4月)", "3": "夏 (7月)", "4": "秋 (10月)" };
    return y + " 年 " + (qNames[q] || ("Q" + q));
  };

  const sortBtn = iconBtn("sort", (e) => {
    openMenu(e.currentTarget, [
      { label: "默认顺序", selected: sortBy === "default", icon: sortBy === "default" ? "check" : "sort", onClick: () => { sortBy = "default"; renderDayList(); } },
      { label: "按评分降序", selected: sortBy === "score", icon: sortBy === "score" ? "check" : "star", onClick: () => { sortBy = "score"; renderDayList(); } },
      { label: "按排名升序", selected: sortBy === "rank", icon: sortBy === "rank" ? "check" : "auto_awesome", onClick: () => { sortBy = "rank"; renderDayList(); } },
      { divider: true },
      { label: onlyCollected ? "显示全部番剧" : "仅看已追番", icon: onlyCollected ? "check" : "bookmark", selected: onlyCollected, onClick: () => { onlyCollected = !onlyCollected; renderDayList(); } },
    ]);
  }, { title: "排序与筛选" });

  const bar = appBar({
    title: "时间表",
    actions: [sortBtn, iconBtn("refresh", () => loadSeason(), { title: "刷新" })],
  });

  const seasonTitleEl = el("span", { class: "season-name" }, seasonLabel());
  const seasonSubEl = el("div", { class: "season-sub" }, "每日新番放送时间表，支持回溯 20 年历史季度");
  const seasonHead = el("div", { class: "season-head" },
    seasonTitleEl,
    el("button", { type: "button", class: "season-expand sl", title: "切换年份季度", onClick: openSeasonPicker }, iconNode("expand_more"))
  );

  const weekTabs = el("div", { class: "week-tabs" });
  const weekBar = el("div", { class: "week-bar" }, weekTabs);
  const listWrap = el("div", {});

  const page = el("div", { class: "page timeline" }, seasonHead, seasonSubEl, weekBar, listWrap);
  app.append(bar, page);

  function openSeasonPicker() {
    const thisYear = now.getFullYear();
    const seasons = [];
    for (let y = thisYear; y >= thisYear - 19; y--) {
      for (let q = 4; q >= 1; q--) {
        seasons.push({ key: y + "-" + q, label: y + " " + ["冬", "春", "夏", "秋"][q - 1] });
      }
    }
    openSheet({
      title: "选择放送季度",
      desc: "回溯近 20 年 Bangumi 动画季度放送表",
      content: ({ close }) => el("div", {},
        button("回到当前最新放送表", () => {
          currentSeason = "";
          seasonTitleEl.textContent = seasonLabel();
          close();
          loadSeason();
        }, { variant: currentSeason === "" ? "filled" : "tonal", icon: "timeline", cls: "w700" }),
        el("div", { class: "season-grid", style: { marginTop: "14px" } },
          ...seasons.map((s) => el("button", {
            type: "button",
            class: "season-opt sl" + (currentSeason === s.key ? " is-selected" : ""),
            onClick: () => {
              currentSeason = s.key;
              seasonTitleEl.textContent = seasonLabel();
              close();
              loadSeason();
            },
          }, s.label))
        )
      ),
    });
  }

  function renderWeekTabs() {
    weekTabs.innerHTML = "";
    WEEKDAY_NAMES.forEach((name, idx) => {
      const cnt = (daysData[idx] || []).length;
      weekTabs.append(el("button", {
        type: "button",
        class: "week-tab sl" + (idx === activeDay ? " is-active" : ""),
        onClick: () => { activeDay = idx; renderWeekTabs(); renderDayList(); },
      },
        el("span", {}, name),
        el("span", { class: "count" }, String(cnt))
      ));
    });
  }

  function renderDayList() {
    listWrap.innerHTML = "";
    let items = (daysData[activeDay] || []).slice();
    if (onlyCollected) items = items.filter((x) => collectedIds.has(x.id));
    if (sortBy === "score") items.sort((a, b) => (b.ratingScore || 0) - (a.ratingScore || 0));
    else if (sortBy === "rank") items.sort((a, b) => ((a.rank || 999999) - (b.rank || 999999)));

    if (!items.length) {
      listWrap.append(emptyState({ icon: "timeline", title: onlyCollected ? "当日没有已追番剧" : "当日暂无放送番剧" }));
      return;
    }
    const grid = el("div", { class: "timeline-grid" });
    for (const item of items) {
      const isCol = collectedIds.has(item.id);
      grid.append(el("article", {
        class: "tl-card sl",
        onClick: () => go("/bangumi?id=" + item.id),
      },
        coverImg(bestBangumiImage(item.images), "cover", item.nameCn || item.name),
        el("div", { class: "tl-body" },
          el("div", { class: "tl-title" }, item.nameCn || item.name),
          el("div", { class: "tl-meta" }, [item.airDate, item.rank ? "Rank #" + item.rank : ""].filter(Boolean).join(" · ") || item.name || ""),
          el("div", { class: "tl-foot" },
            item.ratingScore
              ? el("span", { class: "rating-pill" }, iconNode("star"), el("span", {}, Number(item.ratingScore).toFixed(1)))
              : el("span", { class: "t-label-small c-variant" }, "暂无评分"),
            isCol ? el("span", { class: "bookmark", title: "已在追番列表中" }, iconNode("bookmark")) : null
          )
        )
      ));
    }
    listWrap.append(grid);
  }

  async function loadSeason() {
    listWrap.innerHTML = "";
    listWrap.append(loadingNode("正在加载放送时间表…"));
    collectedIds = new Set(KazumiStore.getCollectsList().map((c) => c.bangumiId));
    try {
      const [tlRes, colRes] = await Promise.all([
        fetchJson("/api/timeline" + (currentSeason ? "?season=" + encodeURIComponent(currentSeason) : "")),
        fetchJson("/api/collect/list").catch(() => null),
      ]);
      if (colRes && Array.isArray(colRes.items)) {
        collectedIds = new Set(colRes.items.map((c) => c.bangumiId));
      }
      daysData = Array.isArray(tlRes.days) && tlRes.days.length === 7 ? tlRes.days : [[], [], [], [], [], [], []];
      renderWeekTabs();
      renderDayList();
    } catch (e) {
      listWrap.innerHTML = "";
      listWrap.append(errorState(e, loadSeason));
    }
  }

  loadSeason();
}

/* ==========================================================================
 * TAB 3: Collect (6 态追番列表 + 搜索/排序/网格视图 + Bangumi 同步)
 * ========================================================================== */
function renderTabCollect(app) {
  renderNavRail("collect");
  const TABS = [
    { type: 0, label: "全部" },
    { type: 1, label: "在看" },
    { type: 2, label: "想看" },
    { type: 3, label: "搁置" },
    { type: 4, label: "看过" },
    { type: 5, label: "抛弃" },
  ];
  let activeType = 1;
  let query = "";
  let sortBy = localStorage.getItem("collectSort") || "time"; // time | score | name | airDate
  let viewMode = localStorage.getItem("collectView") || "grid"; // grid | list
  let allItems = KazumiStore.getCollectsList();

  const bar = appBar({
    title: "追番",
    actions: [
      iconBtn("sync", () => go("/settings/sync"), { title: "云同步 / Bangumi 账号同步" }),
      iconBtn("refresh", () => loadCollects(), { title: "刷新" }),
    ],
  });

  const catTabs = el("div", { class: "cat-tabs" });
  const countEl = el("span", { class: "collect-count" }, "");
  const head = el("div", { class: "collect-head" }, catTabs, countEl);

  const searchInput = el("input", { type: "search", placeholder: "搜索已追番剧…" });
  searchInput.addEventListener("input", () => { query = searchInput.value.trim().toLowerCase(); renderList(); });

  const sortSelect = el("select", { class: "btn btn-surface is-small", "aria-label": "排序方式" },
    el("option", { value: "time" }, "最近更新"),
    el("option", { value: "score" }, "按评分"),
    el("option", { value: "airDate" }, "按放送日期"),
    el("option", { value: "name" }, "按名称")
  );
  sortSelect.value = sortBy;
  sortSelect.addEventListener("change", () => {
    sortBy = sortSelect.value;
    localStorage.setItem("collectSort", sortBy);
    renderList();
  });

  const segGrid = el("button", { type: "button", class: "seg-btn sl" + (viewMode === "grid" ? " is-active" : ""), title: "海报网格" }, iconNode("grid"));
  const segList = el("button", { type: "button", class: "seg-btn sl" + (viewMode === "list" ? " is-active" : ""), title: "列表视图" }, iconNode("list"));
  segGrid.addEventListener("click", () => { viewMode = "grid"; localStorage.setItem("collectView", "grid"); updateSeg(); renderList(); });
  segList.addEventListener("click", () => { viewMode = "list"; localStorage.setItem("collectView", "list"); updateSeg(); renderList(); });
  function updateSeg() {
    segGrid.classList.toggle("is-active", viewMode === "grid");
    segList.classList.toggle("is-active", viewMode === "list");
  }

  const controls = el("div", { class: "collect-controls" },
    el("div", { class: "search-box" }, iconNode("search"), searchInput),
    sortSelect,
    el("div", { class: "seg-toggle" }, segGrid, segList)
  );

  const bodyWrap = el("div", {});
  const page = el("div", { class: "page collect" }, head, controls, bodyWrap);
  app.append(bar, page);

  function renderTabs() {
    catTabs.innerHTML = "";
    for (const t of TABS) {
      catTabs.append(el("button", {
        type: "button",
        class: "cat-tab" + (activeType === t.type ? " is-active" : ""),
        onClick: () => { activeType = t.type; renderTabs(); renderList(); },
      }, t.label));
    }
  }

  function renderList() {
    let items = allItems.filter((c) => activeType === 0 || c.type === activeType);
    if (query) {
      items = items.filter((c) => {
        const b = c.bangumi || {};
        return ((b.nameCn || "") + " " + (b.name || "")).toLowerCase().includes(query);
      });
    }
    if (sortBy === "score") items.sort((a, b) => ((b.bangumi && b.bangumi.ratingScore) || 0) - ((a.bangumi && a.bangumi.ratingScore) || 0));
    else if (sortBy === "airDate") items.sort((a, b) => String((b.bangumi && b.bangumi.airDate) || "").localeCompare(String((a.bangumi && a.bangumi.airDate) || "")));
    else if (sortBy === "name") items.sort((a, b) => String((a.bangumi && (a.bangumi.nameCn || a.bangumi.name)) || "").localeCompare(String((b.bangumi && (b.bangumi.nameCn || b.bangumi.name)) || "")));
    else items.sort((a, b) => (b.time || 0) - (a.time || 0));

    countEl.textContent = items.length + " 部";
    bodyWrap.innerHTML = "";
    if (!items.length) {
      bodyWrap.append(emptyState({
        icon: "favorite_border",
        title: query ? "没有匹配的追番记录" : "该分类下暂无番剧",
        message: "在番剧详情页点击「追番」即可归档到这里，并支持跨设备与 Bangumi 账号同步",
        actions: [button("去发现番剧", () => go("/home?tab=popular"), { variant: "tonal", icon: "auto_awesome" })],
      }));
      return;
    }

    if (viewMode === "list") {
      const list = el("div", { class: "collect-list" });
      for (const c of items) {
        const b = c.bangumi || { id: c.bangumiId, nameCn: "番剧 #" + c.bangumiId };
        const menuBtn = iconBtn("more_vert", (e) => {
          e.stopPropagation();
          openCollectMenu(e.currentTarget, b, c.type, () => loadCollects());
        }, { title: "更改状态" });
        list.append(el("article", {
          class: "collect-row sl",
          onClick: () => go("/bangumi?id=" + c.bangumiId),
        },
          coverImg(bestBangumiImage(b.images), "cover", b.nameCn || b.name),
          el("div", { class: "body" },
            el("div", { class: "title" }, b.nameCn || b.name || ("番剧 #" + c.bangumiId)),
            el("div", { class: "meta" }, [COLLECT_LABELS[c.type], b.airDate, b.ratingScore ? "★ " + Number(b.ratingScore).toFixed(1) : ""].filter(Boolean).join(" · ")),
            el("div", { class: "foot" }, el("span", { class: "t-label-small c-variant" }, formatRelTime(c.time)))
          ),
          menuBtn
        ));
      }
      bodyWrap.append(list);
    } else {
      const grid = el("div", { class: "collect-grid" });
      for (const c of items) {
        const b = c.bangumi || { id: c.bangumiId, nameCn: "番剧 #" + c.bangumiId };
        const menuBtn = iconBtn("more_vert", (e) => {
          e.stopPropagation();
          openCollectMenu(e.currentTarget, b, c.type, () => loadCollects());
        }, { title: "更改状态" });
        grid.append(el("article", {
          class: "collect-card sl",
          onClick: () => go("/bangumi?id=" + c.bangumiId),
        },
          coverImg(bestBangumiImage(b.images), "", b.nameCn || b.name),
          el("div", { class: "foot" },
            el("div", { class: "text" },
              el("div", { class: "title" }, b.nameCn || b.name || ("番剧 #" + c.bangumiId)),
              el("div", { class: "meta" }, [COLLECT_LABELS[c.type], b.ratingScore ? "★ " + Number(b.ratingScore).toFixed(1) : ""].filter(Boolean).join(" · "))
            ),
            menuBtn
          )
        ));
      }
      bodyWrap.append(grid);
    }
  }

  async function loadCollects() {
    try {
      const res = await fetchJson("/api/collect/list");
      allItems = res.items || [];
      KazumiStore.setCollectsFromList(allItems);
    } catch (_) {
      allItems = KazumiStore.getCollectsList();
    }
    if (activeType === 1 && !allItems.some((x) => x.type === 1) && allItems.length) {
      activeType = 0;
    }
    renderTabs();
    renderList();
  }

  renderTabs();
  renderList();
  loadCollects();
}

/* ==========================================================================
 * SEARCH: Bangumi Advanced Search + Direct Rule Search + Image Search Link
 * ========================================================================== */
function renderSearch(app, params) {
  renderNavRail("");
  let mode = params.mode === "rule" ? "rule" : "bangumi"; // bangumi | rule
  let keyword = params.q || "";
  let sort = "heat";
  let filterTags = [];
  let filterYear = "";
  let filterMinScore = "";
  let filterWeekdays = [];
  let items = [];
  let offset = 0;
  let loading = false;
  let ended = false;

  const getHistory = () => {
    try { return JSON.parse(localStorage.getItem("kazumi_search_hist") || "[]"); } catch (_) { return []; }
  };
  const pushHistory = (kw) => {
    const t = (kw || "").trim();
    if (!t) return;
    const list = [t, ...getHistory().filter((x) => x !== t)].slice(0, 15);
    localStorage.setItem("kazumi_search_hist", JSON.stringify(list));
  };

  const page = el("div", { class: "page search" });
  const bar = appBar({
    title: "搜索",
    compact: true,
    back: true,
    actions: [
      button("以图搜番", () => go("/search/image"), { variant: "tonal", small: true, icon: "image_search" }),
    ],
  });

  const input = el("input", { type: "search", value: keyword, placeholder: "搜索番剧名、原名、标签或直接检索视频源…" });
  const clearBtn = iconBtn("close", () => { input.value = ""; keyword = ""; clearBtn.style.display = "none"; renderIdle(); input.focus(); }, { title: "清空" });
  clearBtn.style.display = keyword ? "" : "none";

  const filterBtn = iconBtn("tune", openFilterSheet, { title: "高级筛选" });
  const searchBox = el("div", { class: "search-box is-high is-tall" },
    iconNode("search"),
    input,
    clearBtn,
    filterBtn,
    button("搜索", () => startSearch(input.value), { small: true })
  );

  const tabBgm = el("button", { type: "button", class: "ctab" + (mode === "bangumi" ? " is-active" : ""), onClick: () => switchMode("bangumi") }, "Bangumi 番剧库");
  const tabRule = el("button", { type: "button", class: "ctab" + (mode === "rule" ? " is-active" : ""), onClick: () => switchMode("rule") }, "规则直搜（不经 Bangumi）");
  const modeTabs = el("div", { class: "ctabs", style: { marginTop: "10px" } }, tabBgm, tabRule);

  const topSticky = el("div", { class: "search-top" }, searchBox, modeTabs);
  const body = el("div", {});

  page.append(topSticky, body);
  app.append(bar, page);

  input.addEventListener("input", () => { clearBtn.style.display = input.value ? "" : "none"; });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") startSearch(input.value); });

  function switchMode(m) {
    mode = m;
    tabBgm.classList.toggle("is-active", mode === "bangumi");
    tabRule.classList.toggle("is-active", mode === "rule");
    filterBtn.style.display = mode === "bangumi" ? "" : "none";
    if (input.value.trim()) startSearch(input.value);
    else renderIdle();
  }
  filterBtn.style.display = mode === "bangumi" ? "" : "none";

  function openFilterSheet() {
    openSheet({
      title: "Bangumi 高级筛选",
      content: ({ close }) => {
        const sortWrap = el("div", { class: "chips" });
        const sortOpts = [
          { id: "heat", label: "热度" },
          { id: "match", label: "匹配度" },
          { id: "rank", label: "排名" },
          { id: "score", label: "评分" },
        ];
        const drawSort = () => {
          sortWrap.innerHTML = "";
          for (const o of sortOpts) {
            sortWrap.append(filterChip({ label: o.label, selected: sort === o.id, onClick: () => { sort = o.id; drawSort(); } }));
          }
        };
        drawSort();

        const tagWrap = el("div", { class: "chips" });
        const drawTags = () => {
          tagWrap.innerHTML = "";
          for (const t of DEFAULT_ANIME_TAGS) {
            const sel = filterTags.includes(t);
            tagWrap.append(filterChip({
              label: t,
              selected: sel,
              onClick: () => {
                filterTags = sel ? filterTags.filter((x) => x !== t) : [...filterTags, t];
                drawTags();
              },
            }));
          }
        };
        drawTags();

        const wdWrap = el("div", { class: "chips" });
        const drawWd = () => {
          wdWrap.innerHTML = "";
          WEEKDAY_NAMES.forEach((lbl, idx) => {
            const w = idx + 1;
            const sel = filterWeekdays.includes(w);
            wdWrap.append(filterChip({
              label: lbl,
              selected: sel,
              onClick: () => {
                filterWeekdays = sel ? filterWeekdays.filter((x) => x !== w) : [...filterWeekdays, w];
                drawWd();
              },
            }));
          });
        };
        drawWd();

        const yearInput = el("input", { class: "text-field", type: "number", placeholder: "例如 2025", value: filterYear });
        const scoreInput = el("input", { class: "text-field", type: "number", step: "0.5", min: "0", max: "10", placeholder: "最低评分 如 7.5", value: filterMinScore });

        return el("div", {},
          el("div", { class: "field-group" }, el("div", { class: "field-label" }, "排序方式"), sortWrap),
          el("div", { class: "field-group" }, el("div", { class: "field-label" }, "题材标签（可多选）"), tagWrap),
          el("div", { class: "field-group" }, el("div", { class: "field-label" }, "放送星期"), wdWrap),
          el("div", { class: "field-row" },
            el("div", { class: "field-group", style: { flex: 1 } }, el("div", { class: "field-label" }, "放送年份"), yearInput),
            el("div", { class: "field-group", style: { flex: 1 } }, el("div", { class: "field-label" }, "最低评分"), scoreInput)
          ),
          el("div", { class: "sheet-actions" },
            button("重置", () => {
              sort = "heat"; filterTags = []; filterYear = ""; filterMinScore = ""; filterWeekdays = [];
              close();
              startSearch(input.value);
            }, { variant: "text" }),
            button("应用筛选", () => {
              filterYear = yearInput.value.trim();
              filterMinScore = scoreInput.value.trim();
              close();
              startSearch(input.value);
            }, { icon: "check" })
          )
        );
      },
    });
  }

  function renderIdle() {
    page.classList.remove("has-results");
    body.innerHTML = "";
    const hist = getHistory();
    if (hist.length) {
      body.append(
        el("div", { class: "recent-head" },
          el("span", {}, "最近搜索"),
          button("清空", () => { localStorage.removeItem("kazumi_search_hist"); renderIdle(); }, { variant: "text", small: true })
        ),
        ...hist.map((h) => el("button", {
          type: "button",
          class: "recent-item sl",
          onClick: () => { input.value = h; clearBtn.style.display = ""; startSearch(h); },
        }, iconNode("history"), el("span", { class: "text" }, h)))
      );
    } else {
      body.append(emptyState({
        icon: "search",
        title: "搜索你想看的番剧",
        message: "支持 Bangumi 番剧库高级筛选、规则直搜，以及 trace.moe 截图搜番",
      }));
    }
  }

  function startSearch(kw) {
    keyword = (kw || "").trim();
    if (!keyword && mode === "bangumi" && !filterTags.length && !filterYear && !filterMinScore && !filterWeekdays.length) {
      renderIdle();
      return;
    }
    if (keyword) pushHistory(keyword);
    if (mode === "rule") {
      runRuleSearch(keyword);
    } else {
      items = [];
      offset = 0;
      ended = false;
      page.classList.add("has-results");
      body.innerHTML = "";
      runBangumiSearch();
    }
  }

  let bgmGrid = null;
  let bgmFoot = null;

  async function runBangumiSearch() {
    if (loading || ended) return;
    loading = true;
    if (!items.length) {
      body.innerHTML = "";
      bgmGrid = el("div", { class: "results-grid" });
      bgmFoot = el("div", { class: "results-more" });
      const activeSummary = [];
      if (filterTags.length) activeSummary.push("标签：" + filterTags.join("/"));
      if (filterYear) activeSummary.push("年份：" + filterYear);
      if (filterMinScore) activeSummary.push("评分 ≥ " + filterMinScore);
      if (filterWeekdays.length) activeSummary.push("星期：" + filterWeekdays.map((w) => WEEKDAY_NAMES[w - 1]).join("/"));
      body.append(
        el("div", { class: "results-head" }, el("div", { class: "results-title" }, keyword ? "搜索「" + keyword + "」" : "筛选结果")),
        activeSummary.length ? el("div", { class: "results-sub" }, activeSummary.join(" · ")) : el("div", { style: { height: "10px" } }),
        bgmGrid,
        bgmFoot
      );
    }
    bgmFoot.innerHTML = "";
    bgmFoot.append(inlineLoading("搜索中…"));

    const qs = new URLSearchParams();
    if (keyword) qs.set("keyword", keyword);
    qs.set("offset", String(offset));
    qs.set("sort", sort);
    for (const t of filterTags) qs.append("tag", t);
    if (filterYear && /^\d{4}$/.test(filterYear)) {
      qs.set("airDate", filterYear + "-01-01.." + (Number(filterYear) + 1) + "-01-01");
    }
    if (filterMinScore) qs.set("score", filterMinScore + "..10");
    if (filterWeekdays.length) qs.set("weekday", filterWeekdays.join(","));

    try {
      const res = await fetchJson("/api/bangumi/search?" + qs.toString());
      const batch = res.items || [];
      offset += res.rawCount || batch.length;
      if (!batch.length || (res.rawCount != null && res.rawCount < 20)) ended = true;
      items.push(...batch);
      if (!items.length) {
        body.innerHTML = "";
        body.append(emptyState({
          icon: "search",
          title: "未找到相关番剧",
          message: "尝试缩短关键词、切换「规则直搜」，或使用以图搜番",
          actions: [button("切换到规则直搜", () => switchMode("rule"), { variant: "tonal", icon: "extension" })],
        }));
      } else {
        for (const it of batch) {
          bgmGrid.append(el("article", {
            class: "result-card sl",
            onClick: () => go("/bangumi?id=" + it.id),
          },
            coverImg(bestBangumiImage(it.images), "", it.nameCn || it.name),
            el("div", { class: "title" }, it.nameCn || it.name),
            el("div", { class: "meta" },
              it.ratingScore ? el("span", { class: "score" }, iconNode("star"), el("span", {}, Number(it.ratingScore).toFixed(1))) : null,
              it.airDate ? el("span", { class: "year" }, it.airDate.slice(0, 7)) : null
            )
          ));
        }
        bgmFoot.innerHTML = "";
        if (!ended) bgmFoot.append(button("加载更多", runBangumiSearch, { variant: "tonal", small: true }));
        else bgmFoot.append(el("span", { class: "t-body-small c-variant" }, "共显示 " + items.length + " 条结果"));
      }
    } catch (e) {
      bgmFoot.innerHTML = "";
      bgmFoot.append(errorState(e, runBangumiSearch, { compact: true }));
    } finally {
      loading = false;
    }
  }

  async function runRuleSearch(kw) {
    if (!kw) { renderIdle(); return; }
    page.classList.add("has-results");
    body.innerHTML = "";
    body.append(loadingNode("正在向全部已安装规则源并发检索「" + kw + "」…"));
    try {
      const plugins = await fetchJson("/api/plugins");
      body.innerHTML = "";
      if (!plugins.length) {
        body.append(emptyState({
          icon: "extension",
          title: "没有已安装的规则",
          actions: [button("前往规则仓库", () => go("/my/rules?shop=1"), { icon: "store" })],
        }));
        return;
      }
      const wrap = el("div", {});
      body.append(el("div", { class: "results-sub" }, "直接从 " + plugins.length + " 个视频源站检索，点击结果即可选集观看"), wrap);

      const queue = plugins.slice();
      const refs = new Map();
      for (const p of plugins) {
        const statusEl = el("span", { class: "src-status" }, "排队中…");
        const inner = el("div", {}, inlineLoading("检索中…"));
        const grp = el("div", { class: "src-group" },
          el("button", { type: "button", class: "src-head sl", onClick: () => grp.classList.toggle("is-open") },
            el("span", { class: "src-name" }, p.name),
            statusEl,
            el("span", { class: "src-chev" }, iconNode("expand_more"))
          ),
          el("div", { class: "src-body" }, el("div", {}, inner))
        );
        wrap.append(grp);
        refs.set(p.name, { grp, statusEl, inner });
      }

      const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const p = queue.shift();
          const r = refs.get(p.name);
          r.statusEl.textContent = "检索中…";
          try {
            const res = await fetchJson("/api/search?plugin=" + encodeURIComponent(p.name) + "&keyword=" + encodeURIComponent(kw));
            const list = res.items || [];
            r.inner.innerHTML = "";
            if (!list.length) {
              r.statusEl.textContent = "无结果";
            } else {
              r.statusEl.className = "src-status is-ok";
              r.statusEl.textContent = list.length + " 条";
              r.grp.classList.add("is-open");
              wrap.prepend(r.grp);
              r.inner.append(splitList(list.slice(0, 12).map((it) => splitRow(
                el("div", { class: "src-row" },
                  el("span", { class: "name" }, it.name),
                  el("span", { class: "play" }, iconNode("play"))
                ),
                {
                  onClick: () => go("/episodes?plugin=" + encodeURIComponent(p.name) + "&src=" + encodeURIComponent(it.src) + "&title=" + encodeURIComponent(it.name)),
                }
              )), { tight: true }));
            }
          } catch (e) {
            r.inner.innerHTML = "";
            r.statusEl.className = "src-status is-error";
            r.statusEl.textContent = e.status === 423 ? "需验证" : "失败";
            if (e.status === 423) {
              r.grp.classList.add("is-open");
              r.inner.append(splitList([splitRow(el("div", { class: "src-inline" },
                iconNode("shield"),
                el("div", {}, el("div", {}, "需要完成人机验证"), el("div", { class: "acts" },
                  button("开始验证", () => startCaptchaFlow(p.name, kw, () => runRuleSearch(kw)), { small: true })
                ))
              ))]));
            }
          }
        }
      });
      await Promise.all(workers);
    } catch (e) {
      body.innerHTML = "";
      body.append(errorState(e, () => runRuleSearch(kw)));
    }
  }

  if (keyword) startSearch(keyword);
  else {
    renderIdle();
    setTimeout(() => input.focus(), 60);
  }
}

/* ==========================================================================
 * BANGUMI DETAIL (Hero + 10-Bar Rating Chart + 5 Tabs + Character Sheet + FAB)
 * ========================================================================== */
function renderBangumiDetail(app, params) {
  renderNavRail("");
  const bid = Number(params.id || 0);
  if (!bid) {
    app.append(appBar({ title: "番剧详情", back: true }), el("div", { class: "page" }, errorState("缺少番剧 ID")));
    return;
  }

  const page = el("div", { class: "page" });
  page.append(loadingNode("正在加载番剧详情…"));
  app.append(page);

  let bangumi = null;
  let collectType = 0;

  async function load() {
    page.innerHTML = "";
    page.append(loadingNode("正在加载番剧详情…"));
    try {
      const [detail, col] = await Promise.all([
        fetchJson("/api/bangumi/" + bid),
        fetchJson("/api/collect?bangumiId=" + bid).catch(() => ({ type: 0 })),
      ]);
      bangumi = detail;
      collectType = col.type || 0;
      renderDetailView();
    } catch (e) {
      page.innerHTML = "";
      page.append(appBar({ title: "番剧详情", back: true, compact: true }), errorState(e, load));
    }
  }

  function renderStars(score) {
    const half = Math.round((Number(score) || 0)) / 2; // 0..5 in 0.5 steps
    const wrap = el("span", { class: "stars" });
    for (let i = 1; i <= 5; i++) {
      if (half >= i) wrap.append(iconNode("star"));
      else if (half >= i - 0.5) wrap.append(iconNode("star_half"));
      else wrap.append(iconNode("star_border", "is-empty"));
    }
    return wrap;
  }

  function renderRatingChart(votesCount) {
    if (!Array.isArray(votesCount) || votesCount.length < 10) return null;
    const max = Math.max(1, ...votesCount);
    return el("div", { class: "rating-chart", title: "Bangumi 1~10 分评分分布" },
      ...votesCount.slice(0, 10).map((cnt, i) => {
        const pct = Math.max(4, Math.round((cnt / max) * 100));
        return el("div", { class: "rating-bar-col", title: (i + 1) + " 分：" + cnt + " 人" },
          el("div", { class: "rating-bar", style: { height: pct + "%" } }),
          el("span", { class: "rating-bar-lbl" }, String(i + 1))
        );
      })
    );
  }

  function renderDetailView() {
    page.innerHTML = "";
    const title = bangumi.nameCn || bangumi.name || ("番剧 #" + bid);
    const cover = bestBangumiImage(bangumi.images);

    const collectBtnLabel = () => collectType > 0 ? COLLECT_LABELS[collectType] : "追番";
    const collectBtn = button(collectBtnLabel(), (e) => {
      openCollectMenu(e.currentTarget, bangumi, collectType, (nextType) => {
        collectType = nextType;
        collectBtn.querySelector(".icon").innerHTML = iconSvg(collectType > 0 ? "bookmark" : "bookmark_border");
        collectBtn.querySelector("span:last-child").textContent = collectBtnLabel();
        collectBtn.className = "btn sl is-small " + (collectType > 0 ? "btn-filled" : "btn-tonal");
      });
    }, { variant: collectType > 0 ? "filled" : "tonal", icon: collectType > 0 ? "bookmark" : "bookmark_border", small: true });

    const moreBtn = iconBtn("more_vert", (e) => {
      openMenu(e.currentTarget, [
        { label: "Bangumi 评分 / 吐槽", icon: "star", onClick: () => openBangumiRateSheet(bangumi, collectType) },
        { label: "管理检索别名", icon: "label", onClick: () => openAliasesSheet(bangumi) },
        { label: "复制番剧名称", icon: "copy", onClick: () => { navigator.clipboard?.writeText(title).then(() => toast("已复制名称")); } },
        { label: "在 Bangumi 打开", icon: "open_in_new", onClick: () => window.open("https://bgm.tv/subject/" + bid, "_blank", "noopener") },
      ]);
    }, { variant: "overlay", title: "更多选项" });

    const hero = el("div", { class: "hero" },
      coverImg(cover, "hero-bg", ""),
      el("div", { class: "hero-leading" }, iconBtn("arrow_back", () => history.back(), { variant: "overlay", title: "返回" })),
      el("div", { class: "hero-trailing" }, moreBtn),
      el("div", { class: "hero-inner" },
        el("h1", { class: "hero-title" }, title),
        el("div", { class: "hero-row" },
          coverImg(cover, "hero-cover", title),
          el("div", { class: "hero-meta" },
            bangumi.name && bangumi.name !== title ? el("div", { class: "t-body-medium c-variant" }, bangumi.name) : null,
            el("div", { class: "hero-info" },
              el("div", { class: "hero-info-group" },
                el("span", { class: "hero-info-label" }, "Bangumi 评分 (" + (bangumi.votes || 0) + " 人)"),
                el("div", { class: "hero-info-rating" },
                  el("span", { class: "hero-info-value" }, bangumi.ratingScore ? Number(bangumi.ratingScore).toFixed(1) : "—"),
                  bangumi.ratingScore ? renderStars(bangumi.ratingScore) : null
                )
              ),
              bangumi.rank ? el("div", { class: "hero-info-group" },
                el("span", { class: "hero-info-label" }, "全站排名"),
                el("span", { class: "hero-info-value" }, "#" + bangumi.rank)
              ) : null,
              bangumi.airDate ? el("div", { class: "hero-info-group" },
                el("span", { class: "hero-info-label" }, "放送日期"),
                el("span", { class: "hero-info-value", style: { fontSize: "16px" } }, bangumi.airDate)
              ) : null
            ),
            renderRatingChart(bangumi.votesCount),
            el("div", { class: "hero-actions" },
              button("开始观看", () => openSourcePicker(bangumi), { icon: "play", small: true }),
              collectBtn,
              button("评分吐槽", () => openBangumiRateSheet(bangumi, collectType), { variant: "outline", icon: "star", small: true })
            )
          )
        )
      )
    );

    const tabDefs = [
      { id: "overview", label: "概览" },
      { id: "comments", label: "吐槽" },
      { id: "characters", label: "角色" },
      { id: "relations", label: "关联" },
      { id: "staff", label: "制作人员" },
    ];
    let activeTab = "overview";
    const tabsBar = el("div", { class: "tabs detail-tabs" });
    const tabBody = el("div", { class: "detail-content" });

    const tabCache = {};

    function renderTabsBar() {
      tabsBar.innerHTML = "";
      for (const td of tabDefs) {
        tabsBar.append(el("button", {
          type: "button",
          class: "tab sl" + (activeTab === td.id ? " is-active" : ""),
          onClick: () => { activeTab = td.id; renderTabsBar(); renderTabBody(); },
        }, td.label));
      }
    }

    async function renderTabBody() {
      tabBody.innerHTML = "";
      if (activeTab === "overview") {
        const sumCard = el("div", { class: "tonal-card summary-card collapsed" }, bangumi.summary || "暂无简介");
        const toggleBtn = button("展开全部简介", () => {
          const isCol = sumCard.classList.toggle("collapsed");
          toggleBtn.querySelector("span").textContent = isCol ? "展开全部简介" : "收起简介";
        }, { variant: "text", small: true, cls: "summary-toggle" });
        tabBody.append(
          el("div", { class: "h-section" }, "简介"),
          sumCard,
          (bangumi.summary || "").length > 160 ? toggleBtn : null
        );
        if (bangumi.tags && bangumi.tags.length) {
          tabBody.append(
            el("div", { class: "h-section" }, "标签"),
            el("div", { class: "chips" }, ...bangumi.tags.slice(0, 20).map((t) => filterChip({
              label: t.name,
              count: t.count,
              noCheck: true,
              onClick: () => go("/search?q=" + encodeURIComponent(t.name)),
            })))
          );
        }
        if (bangumi.alias && bangumi.alias.length) {
          tabBody.append(
            el("div", { class: "h-section" }, "官方别名"),
            el("div", { class: "chips" }, ...bangumi.alias.map((a) => filterChip({ label: a, static: true, noCheck: true })))
          );
        }
        return;
      }

      if (activeTab === "comments") {
        let offset = 0;
        const listWrap = el("div", {});
        const foot = el("div", { class: "results-more" });
        tabBody.append(listWrap, foot);
        const rows = [];
        async function loadMoreComments() {
          foot.innerHTML = "";
          foot.append(inlineLoading("加载吐槽中…"));
          try {
            const res = await fetchJson("/api/bangumi/" + bid + "/comments?offset=" + offset);
            const batch = res.items || [];
            offset += batch.length;
            for (const c of batch) {
              const u = c.user || {};
              rows.push(splitRow(el("div", { class: "comment-row" },
                el("div", { class: "comment-head" },
                  coverImg(u.avatar, "", ""),
                  el("span", { class: "username" }, u.nickname || u.username || "匿名"),
                  c.rate ? el("span", { class: "rate" }, iconNode("star"), el("span", {}, String(c.rate))) : null,
                  el("span", { class: "time" }, formatRelTime(c.updatedAt))
                ),
                el("div", { class: "comment-body" }, c.comment || "")
              )));
            }
            listWrap.innerHTML = "";
            if (!rows.length) listWrap.append(emptyState({ compact: true, icon: "info", title: "暂无吐槽" }));
            else listWrap.append(splitList(rows, { tight: true }));
            foot.innerHTML = "";
            if (batch.length >= 20) foot.append(button("加载更多吐槽", loadMoreComments, { variant: "tonal", small: true }));
          } catch (e) {
            foot.innerHTML = "";
            foot.append(errorState(e, loadMoreComments, { compact: true }));
          }
        }
        loadMoreComments();
        return;
      }

      if (activeTab === "characters") {
        tabBody.append(loadingNode("加载角色中…"));
        try {
          const res = tabCache.chars || (tabCache.chars = await fetchJson("/api/bangumi/" + bid + "/characters"));
          tabBody.innerHTML = "";
          const chars = res.characters || [];
          if (!chars.length) { tabBody.append(emptyState({ compact: true, icon: "person_outline", title: "暂无角色信息" })); return; }
          tabBody.append(splitList(chars.map((c) => splitRow(
            el("div", { class: "person-row" },
              coverImg(c.image, "avatar", c.name),
              el("div", { class: "body" },
                el("div", { class: "name" }, c.name),
                el("div", { class: "sub" }, (c.actors || []).map((a) => "CV: " + a.name).join(" / "))
              ),
              c.relation ? el("span", { class: "relation" }, c.relation) : null
            ),
            { onClick: () => openCharacterSheet(c) }
          )), { tight: true }));
        } catch (e) {
          tabBody.innerHTML = "";
          tabBody.append(errorState(e, renderTabBody, { compact: true }));
        }
        return;
      }

      if (activeTab === "relations") {
        tabBody.append(loadingNode("加载关联条目…"));
        try {
          const res = tabCache.rels || (tabCache.rels = await fetchJson("/api/bangumi/" + bid + "/relations"));
          tabBody.innerHTML = "";
          const rels = res.items || [];
          if (!rels.length) { tabBody.append(emptyState({ compact: true, icon: "link", title: "暂无关联动画" })); return; }
          tabBody.append(el("div", { class: "relation-grid" }, ...rels.map((r) => {
            const b = r.bangumi || {};
            return el("div", {
              class: "relation-card sl",
              onClick: () => go("/bangumi?id=" + b.id),
            },
              coverImg(bestBangumiImage(b.images), "", b.nameCn || b.name),
              el("div", { class: "body" },
                el("div", { class: "title" }, b.nameCn || b.name),
                el("div", { class: "relation" }, r.relation)
              )
            );
          })));
        } catch (e) {
          tabBody.innerHTML = "";
          tabBody.append(errorState(e, renderTabBody, { compact: true }));
        }
        return;
      }

      if (activeTab === "staff") {
        tabBody.append(loadingNode("加载制作人员…"));
        try {
          const res = tabCache.staff || (tabCache.staff = await fetchJson("/api/bangumi/" + bid + "/staff"));
          tabBody.innerHTML = "";
          const list = res.items || [];
          if (!list.length) { tabBody.append(emptyState({ compact: true, icon: "person_outline", title: "暂无制作人员数据" })); return; }
          tabBody.append(splitList(list.map((s) => splitRow(
            el("div", { class: "person-row" },
              coverImg(s.image, "avatar", s.name),
              el("div", { class: "body" },
                el("div", { class: "name" }, s.nameCN || s.name),
                s.nameCN && s.name !== s.nameCN ? el("div", { class: "sub" }, s.name) : null
              ),
              el("span", { class: "relation" }, (s.positions || []).map((p) => p.type).filter(Boolean).slice(0, 2).join(" / ") || "Staff")
            )
          )), { tight: true }));
        } catch (e) {
          tabBody.innerHTML = "";
          tabBody.append(errorState(e, renderTabBody, { compact: true }));
        }
      }
    }

    function openCharacterSheet(c) {
      openSheet({
        title: c.name,
        desc: c.relation || "角色详情",
        content: ({ body }) => {
          body.append(inlineLoading("加载角色档案…"));
          (async () => {
            try {
              const info = await fetchJson("/api/bangumi/character/" + c.id);
              body.innerHTML = "";
              body.append(
                el("div", { class: "char-top" },
                  coverImg(info.image || c.image, "char-portrait", info.name),
                  el("div", { class: "tonal-card char-profile" },
                    c.relation ? el("span", { class: "relation-pill" }, c.relation) : null,
                    el("div", { class: "char-name" }, info.name || c.name),
                    (c.actors || []).length ? el("div", { class: "t-body-small c-variant" }, "CV: " + c.actors.map((a) => a.name).join(" / ")) : null,
                    info.infobox && info.infobox.length
                      ? el("div", { class: "char-fields", style: { marginTop: "10px" } },
                          ...info.infobox.slice(0, 8).map((f) => el("div", { class: "char-field" },
                            el("div", { class: "k" }, f.key),
                            el("div", { class: "v" }, f.value)
                          ))
                        )
                      : null
                  )
                ),
                info.summary ? el("div", { class: "tonal-card char-summary" }, info.summary) : null
              );
            } catch (e) {
              body.innerHTML = "";
              body.append(errorState(e, null, { compact: true }));
            }
          })();
          return null;
        },
      });
    }

    const playFab = el("button", {
      type: "button",
      class: "fab is-extended sl",
      onClick: () => openSourcePicker(bangumi),
    }, iconNode("play"), el("span", {}, "开始观看"));

    renderTabsBar();
    renderTabBody();
    page.append(hero, tabsBar, tabBody, playFab);
  }

  load();
}

/* ==========================================================================
 * EPISODES PAGE (/episodes)
 * ========================================================================== */
function renderEpisodes(app, params) {
  renderNavRail("");
  const plugin = params.plugin || "";
  const src = params.src || "";
  const bangumiId = Number(params.bangumiId || 0);
  const title = params.title || "选集";

  const bar = appBar({
    title: title,
    compact: true,
    back: true,
    actions: [
      bangumiId ? iconBtn("info", () => go("/bangumi?id=" + bangumiId), { title: "查看番剧详情" }) : null,
    ].filter(Boolean),
  });
  const body = el("div", { class: "page narrow" }, loadingNode("正在解析线路与分集列表…"));
  app.append(bar, body);

  async function load() {
    body.innerHTML = "";
    body.append(loadingNode("正在解析「" + plugin + "」的分集列表…"));
    try {
      const { roads, history } = await loadRoadsAndHistory(plugin, src, bangumiId);
      body.innerHTML = "";
      body.append(
        el("div", { class: "t-body-small c-variant", style: { marginBottom: "10px" } }, "视频源规则：" + plugin),
        episodePanel({
          roads,
          history,
          currentEpisode: history ? history.lastWatchEpisode : 0,
          onSelect: (sel) => {
            go(playEpisodeParams({
              plugin, src, bangumiId, title,
              road: sel.road,
              episode: sel.episode,
              episodeUrl: sel.episodeUrl,
              episodeName: sel.episodeName,
            }));
          },
        })
      );
    } catch (e) {
      body.innerHTML = "";
      body.append(errorState(e, load));
    }
  }
  load();
}

/* ==========================================================================
 * TAB 4: My Space (Responsive Bento matching my_space_view.dart)
 * ========================================================================== */
function renderTabMy(app) {
  renderNavRail("my");
  let stats = { collects: KazumiStore.getCollectsList().length, histories: KazumiStore.getHistoriesList().length, rules: KazumiStore.getPlugins().length };
  let isWide = window.innerWidth >= 840;

  const page = el("div", { class: "page my" });
  app.append(page);

  function render() {
    page.innerHTML = "";
    const themePrefs = getThemePrefs();
    const themeDesc = THEME_MODE_LABELS[themePrefs.mode] || "跟随系统";

    if (isWide) {
      page.append(
        el("div", { class: "my-hero" },
          el("div", { class: "my-hero-title" },
            el("span", { class: "my-hero-shape" }, iconNode("person")),
            el("span", {}, "我的空间")
          ),
          el("div", { class: "stats-card is-wide" },
            el("div", { class: "stats-head" }, el("span", { class: "stats-icon" }, iconNode("auto_awesome")), el("span", {}, "追番概览")),
            el("div", { class: "stats-row" },
              el("div", { class: "stat" }, el("div", { class: "stat-num" }, String(stats.collects)), el("div", { class: "stat-label" }, "已追番剧")),
              el("div", { class: "stat-divider" }),
              el("div", { class: "stat" }, el("div", { class: "stat-num" }, String(stats.histories)), el("div", { class: "stat-label" }, "观看记录")),
              el("div", { class: "stat-divider" }),
              el("div", { class: "stat" }, el("div", { class: "stat-num" }, String(stats.rules)), el("div", { class: "stat-label" }, "已装规则"))
            )
          )
        ),
        el("div", { class: "my-row" },
          el("button", { type: "button", class: "my-tile-big sl", onClick: () => go("/my/history") },
            el("div", {},
              el("div", { class: "title" }, "观看历史"),
              el("div", { class: "cap" }, stats.histories ? "最近观看 " + stats.histories + " 部番剧，一键续播" : "自动记录每集观看进度"),
              el("span", { class: "arrow" }, iconNode("arrow_forward"))
            ),
            el("span", { class: "shape" }, iconNode("history"))
          ),
          el("button", { type: "button", class: "my-tile sl", onClick: () => go("/my/rules") },
            el("div", { class: "top" }, iconNode("extension"), iconNode("arrow_forward")),
            el("div", { class: "title" }, "规则管理"),
            el("div", { class: "cap" }, stats.rules + " 条源站规则 · 编辑器/测试器")
          ),
          el("button", { type: "button", class: "my-tile is-tertiary sl", onClick: () => go("/search/image") },
            el("div", { class: "top" }, iconNode("image_search"), iconNode("arrow_forward")),
            el("div", { class: "title" }, "以图搜番"),
            el("div", { class: "cap" }, "截图识别出处 (trace.moe)")
          )
        ),
        el("div", { class: "my-row2" },
          el("div", { class: "my-pref-card" },
            el("div", { class: "my-pref-title" }, "快捷偏好"),
            el("div", { class: "my-pref-row" },
              el("button", { type: "button", class: "my-pref-btn sl", onClick: () => go("/settings/player") }, iconNode("play"), el("span", {}, "播放")),
              el("button", { type: "button", class: "my-pref-btn sl", onClick: () => go("/settings/danmaku") }, iconNode("subtitles"), el("span", {}, "弹幕")),
              el("button", { type: "button", class: "my-pref-btn sl", onClick: () => go("/settings/theme") }, iconNode("palette"), el("span", {}, "外观"))
            )
          ),
          el("button", { type: "button", class: "my-tile is-surface sl", onClick: () => go("/settings/sync") },
            el("div", { class: "top" }, iconNode("cloud"), iconNode("arrow_forward")),
            el("div", { class: "title" }, "同步与备份"),
            el("div", { class: "cap" }, "WebDAV · Bangumi · JSON")
          ),
          el("button", { type: "button", class: "my-tile is-surface sl", onClick: () => go("/settings") },
            el("div", { class: "top" }, iconNode("settings"), iconNode("arrow_forward")),
            el("div", { class: "title" }, "全部设置"),
            el("div", { class: "cap" }, "快捷键 · 代理 · 运行日志")
          )
        ),
        el("div", { style: { textAlign: "center" } },
          el("button", { type: "button", class: "my-about-pill sl", onClick: () => go("/settings/about") },
            iconNode("info"), el("span", {}, "关于 Kazumi-web · 开源许可与部署信息")
          )
        )
      );
    } else {
      page.append(
        appBar({
          title: "我的",
          actions: [iconBtn("settings", () => go("/settings"), { title: "设置" })],
        }),
        el("div", { class: "stats-card" },
          el("div", { class: "stats-head" }, el("span", { class: "stats-icon" }, iconNode("auto_awesome")), el("span", {}, "追番概览")),
          el("div", { class: "stats-row" },
            el("div", { class: "stat" }, el("div", { class: "stat-num" }, String(stats.collects)), el("div", { class: "stat-label" }, "追番")),
            el("div", { class: "stat-divider" }),
            el("div", { class: "stat" }, el("div", { class: "stat-num" }, String(stats.histories)), el("div", { class: "stat-label" }, "历史")),
            el("div", { class: "stat-divider" }),
            el("div", { class: "stat" }, el("div", { class: "stat-num" }, String(stats.rules)), el("div", { class: "stat-label" }, "规则"))
          )
        ),
        el("div", { class: "my-tiles" },
          el("button", { type: "button", class: "my-tile sl", onClick: () => go("/my/history") },
            el("div", { class: "top" }, iconNode("history"), iconNode("chevron_right")),
            el("div", { class: "title" }, "观看历史"),
            el("div", { class: "cap" }, stats.histories + " 条记录")
          ),
          el("button", { type: "button", class: "my-tile is-tertiary sl", onClick: () => go("/my/rules") },
            el("div", { class: "top" }, iconNode("extension"), iconNode("chevron_right")),
            el("div", { class: "title" }, "规则管理"),
            el("div", { class: "cap" }, stats.rules + " 条规则")
          )
        ),
        section("工具与设置", splitList([
          splitRow(tile({ badgeIcon: "image_search", title: "以图搜番", desc: "上传截图识别番剧出处", chevron: true, onClick: () => go("/search/image") })),
          splitRow(tile({ badgeIcon: "palette", title: "外观与主题", desc: "9 套官方配色 · " + themeDesc, chevron: true, onClick: () => go("/settings/theme") })),
          splitRow(tile({ badgeIcon: "play", title: "播放与弹幕设置", desc: "画质锐化 · 弹幕屏蔽 · 快捷键", chevron: true, onClick: () => go("/settings/player") })),
          splitRow(tile({ badgeIcon: "cloud", title: "同步与备份", desc: "WebDAV · Bangumi 同步 · JSON 导出", chevron: true, onClick: () => go("/settings/sync") })),
          splitRow(tile({ badgeIcon: "settings", title: "全部设置与日志", desc: "代理、存储、关于 Kazumi-web", chevron: true, onClick: () => go("/settings") })),
        ]))
      );
    }
  }

  const onResize = () => {
    const next = window.innerWidth >= 840;
    if (next !== isWide) { isWide = next; render(); }
  };
  window.addEventListener("resize", onResize);
  registerCleanup(() => window.removeEventListener("resize", onResize));

  render();

  // Refresh live counts from server
  Promise.all([
    fetchJson("/api/collect/list").catch(() => null),
    fetchJson("/api/history/list").catch(() => null),
    fetchJson("/api/plugins").catch(() => null),
  ]).then(([c, h, p]) => {
    if (c && Array.isArray(c.items)) stats.collects = c.items.length;
    if (h && Array.isArray(h.items)) stats.histories = h.items.length;
    if (Array.isArray(p)) stats.rules = p.length;
    render();
  });
}

/* ==========================================================================
 * WATCH HISTORY (/my/history)
 * ========================================================================== */
function renderMyHistory(app) {
  renderNavRail("my");
  let all = KazumiStore.getHistoriesList();
  let query = "";
  let editMode = false;

  const editBtn = button("管理", () => { editMode = !editMode; editBtn.querySelector("span").textContent = editMode ? "完成" : "管理"; renderList(); }, { variant: "text", small: true });
  const clearAllBtn = iconBtn("delete", () => {
    if (!all.length) return;
    openSheet({
      title: "清空全部观看历史？",
      desc: "该操作会同时清除服务器与浏览器本地的观看历史记录",
      content: ({ close }) => el("div", { class: "sheet-actions" },
        button("取消", close, { variant: "text" }),
        button("确认清空", async () => {
          try {
            await fetchJsonDelete("/api/history/all");
            KazumiStore.clearHistories();
            all = [];
            close();
            renderList();
            toast("已清空历史记录");
          } catch (e) { toast(e.message); }
        }, { variant: "danger", icon: "delete" })
      ),
    });
  }, { title: "清空全部历史" });

  const bar = appBar({ title: "观看历史", compact: true, back: true, actions: [editBtn, clearAllBtn] });

  const searchInput = el("input", { type: "search", placeholder: "搜索番剧名或规则源…" });
  searchInput.addEventListener("input", () => { query = searchInput.value.trim().toLowerCase(); renderList(); });

  const listArea = el("div", {});
  const page = el("div", { class: "page history" },
    el("div", { class: "hist-search" }, iconNode("search"), searchInput),
    listArea
  );
  app.append(bar, page);

  function groupBucket(ts) {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.floor((startToday - ts) / 86400000);
    if (ts >= startToday) return "今天";
    if (diffDays < 1) return "昨天";
    if (diffDays < 7) return "近 7 天";
    return "更早";
  }

  function renderList() {
    listArea.innerHTML = "";
    const filtered = query
      ? all.filter((h) => {
          const b = h.bangumi || {};
          return ((b.nameCn || "") + " " + (b.name || "") + " " + (h.pluginName || "")).toLowerCase().includes(query);
        })
      : all;

    if (!filtered.length) {
      listArea.append(emptyState({ icon: "history", title: query ? "没有匹配的历史记录" : "暂无观看历史", message: "观看任意剧集后会自动记录进度，点击即可一键续播" }));
      return;
    }

    listArea.append(el("div", { class: "hist-summary" }, "共 " + filtered.length + " 条记录"));

    const groups = new Map();
    for (const h of filtered) {
      const g = groupBucket(h.lastWatchTime || 0);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(h);
    }

    for (const [label, items] of groups.entries()) {
      listArea.append(el("div", { class: "hist-group-head" },
        el("span", { class: "title" }, label),
        el("span", { class: "count" }, items.length + " 部")
      ));
      const rows = items.map((h) => {
        const b = h.bangumi || {};
        const title = b.nameCn || b.name || ("番剧 #" + h.bangumiId);
        const prog = (h.progresses || {})[String(h.lastWatchEpisode)];
        const posText = prog && prog.progressMs > 1000 ? "上次看到 " + formatPosition(prog.progressMs) : "刚刚开始";
        const resume = () => {
          if (h.lastSrc) {
            go(playEpisodeParams({
              plugin: h.pluginName,
              src: h.src || "",
              bangumiId: h.bangumiId,
              title,
              road: prog ? prog.road : 0,
              episode: h.lastWatchEpisode || 1,
              episodeUrl: h.lastSrc,
              episodeName: h.lastWatchEpisodeName || ("第 " + (h.lastWatchEpisode || 1) + " 话"),
            }));
          } else {
            go("/bangumi?id=" + h.bangumiId);
          }
        };
        const del = async (e) => {
          e.stopPropagation();
          try {
            await fetchJsonDelete("/api/history?bangumiId=" + encodeURIComponent(h.bangumiId) + "&pluginName=" + encodeURIComponent(h.pluginName));
            KazumiStore.removeHistoryRecord(h.pluginName, h.bangumiId);
            all = all.filter((x) => !(x.pluginName === h.pluginName && x.bangumiId === h.bangumiId));
            renderList();
            toast("已删除记录");
          } catch (err) { toast(err.message); }
        };
        return splitRow(el("div", { class: "hist-tile" },
          coverImg(bestBangumiImage(b.images), "cover", title),
          el("div", { class: "body", onClick: resume },
            el("div", { class: "title clamp-2" }, title),
            el("div", { class: "ep" }, h.lastWatchEpisodeName || ("第 " + (h.lastWatchEpisode || 1) + " 话")),
            el("div", { class: "pos" }, posText),
            el("div", { class: "src" }, h.pluginName + " · " + formatRelTime(h.lastWatchTime))
          ),
          el("div", { class: "actions" },
            editMode
              ? iconBtn("delete", del, { variant: "error", title: "删除" })
              : iconBtn("play", resume, { variant: "primary", title: "继续观看" }),
            !editMode && h.bangumiId ? iconBtn("info", () => go("/bangumi?id=" + h.bangumiId), { title: "番剧详情" }) : null
          )
        ));
      });
      listArea.append(splitList(rows, { tight: true }));
    }
  }

  renderList();
  fetchJson("/api/history/list").then((res) => {
    if (res && Array.isArray(res.items)) {
      all = res.items;
      KazumiStore.setHistoriesFromList(all);
      renderList();
    }
  }).catch(() => {});
}

/* ==========================================================================
 * RULES MANAGER & OFFICIAL RULE SHOP (/my/rules)
 * ========================================================================== */
function renderMyRules(app, params) {
  renderNavRail("my");
  let plugins = [];
  let catalogMap = new Map();
  let selectedNames = new Set();
  let batchMode = false;
  let searchQ = "";

  const bar = appBar({
    title: "规则管理",
    compact: true,
    back: true,
    actions: [
      button("规则仓库", openRuleShopSheet, { variant: "tonal", small: true, icon: "store" }),
      iconBtn("add", openAddRuleSheet, { title: "添加 / 导入规则" }),
    ],
  });

  const body = el("div", { class: "page narrow rules" });
  app.append(bar, body);

  async function loadRules() {
    body.innerHTML = "";
    body.append(loadingNode("正在加载已安装规则…"));
    try {
      const [pList, catRes] = await Promise.all([
        fetchJson("/api/plugins?full=1"),
        fetchJson("/api/rules/catalog").catch(() => ({ items: [] })),
      ]);
      plugins = Array.isArray(pList) ? pList : [];
      KazumiStore.setPlugins(plugins);
      catalogMap = new Map();
      for (const c of (catRes.items || [])) catalogMap.set((c.name || "").toLowerCase(), c);
      renderRulesPage();
    } catch (e) {
      body.innerHTML = "";
      body.append(errorState(e, loadRules));
    }
  }

  function hasUpdate(p) {
    const c = catalogMap.get((p.name || "").toLowerCase());
    return !!(c && c.version && p.version && c.version !== p.version);
  }

  function renderRulesPage() {
    body.innerHTML = "";
    const updatable = plugins.filter(hasUpdate);

    const intro = el("div", { class: "rule-intro" },
      el("div", { class: "head" },
        el("div", {},
          el("div", { class: "title" }, "已安装 " + plugins.length + " 条规则"),
          el("div", { class: "desc" }, "完全兼容 Kazumi v9 规则（XPath / API JSONPath / 反爬验证 / kazumi:// 分享链接），并自动镜像至浏览器本地存储。")
        )
      ),
      el("div", { class: "actions" },
        button("从仓库安装", openRuleShopSheet, { small: true, icon: "store" }),
        button("新建规则", () => go("/my/rules/edit"), { variant: "surface", small: true, icon: "edit" }),
        button("一键安装推荐规则", installRecommended, { variant: "surface", small: true, icon: "auto_awesome" }),
        updatable.length ? button("更新全部 (" + updatable.length + ")", () => updateAll(updatable), { variant: "tonal", small: true, icon: "refresh" }) : null,
        plugins.length ? button(batchMode ? "退出多选" : "批量管理", () => { batchMode = !batchMode; selectedNames.clear(); renderRulesPage(); }, { variant: "surface", small: true }) : null
      )
    );

    const searchInput = el("input", { type: "search", value: searchQ, placeholder: "筛选已安装规则…" });
    searchInput.addEventListener("input", () => { searchQ = searchInput.value.trim().toLowerCase(); renderListOnly(); });

    const batchBar = batchMode ? el("div", { class: "rule-filters" },
      button("全选", () => { plugins.forEach((p) => selectedNames.add(p.name)); renderListOnly(); }, { variant: "tonal", small: true }),
      button("删除所选 (" + selectedNames.size + ")", deleteSelected, { variant: "danger", small: true, icon: "delete", disabled: selectedNames.size === 0 })
    ) : null;

    const listEl = el("div", { class: "rule-list" });
    body.append(intro, el("div", { class: "rule-search" }, iconNode("search"), searchInput), batchBar, listEl);

    function renderListOnly() {
      listEl.innerHTML = "";
      const filtered = searchQ
        ? plugins.filter((p) => ((p.name || "") + " " + (p.baseURL || "")).toLowerCase().includes(searchQ))
        : plugins;
      if (!filtered.length) {
        listEl.append(emptyState({
          compact: true,
          icon: "extension",
          title: searchQ ? "没有匹配的规则" : "还没有安装规则",
          message: "点击「一键安装推荐规则」或打开「规则仓库」即可立即观看番剧",
          actions: [button("一键安装推荐规则", installRecommended, { icon: "auto_awesome" })],
        }));
        return;
      }

      filtered.forEach((p, idx) => {
        const isSel = selectedNames.has(p.name);
        const upd = hasUpdate(p);
        const cat = catalogMap.get((p.name || "").toLowerCase());
        const isApi = p.searchMode === "api" || p.chapterMode === "api";
        const hasAnti = !!(p.antiCrawlerConfig && p.antiCrawlerConfig.enabled);

        const card = el("div", {
          class: "rule-card sl" + (isSel ? " is-selected" : ""),
          onClick: () => {
            if (batchMode) {
              if (isSel) selectedNames.delete(p.name); else selectedNames.add(p.name);
              renderRulesPage();
            } else {
              go("/my/rules/edit?name=" + encodeURIComponent(p.name));
            }
          },
        },
          el("div", { class: "rule-icon" + (isSel ? " is-selected" : "") }, iconNode(isSel ? "check" : "extension")),
          el("div", { class: "text" },
            el("div", { class: "title" }, p.name),
            el("div", { class: "sub" }, p.baseURL || ""),
            el("div", { class: "tags" },
              el("span", { class: "rule-tag tag-version" }, "v" + (p.version || "1.0")),
              isApi ? el("span", { class: "rule-tag tag-api" }, "API") : null,
              hasAnti ? el("span", { class: "rule-tag tag-captcha" }, "反爬验证") : null,
              upd && cat ? el("span", { class: "rule-tag tag-update" }, "可更新至 v" + cat.version) : null
            )
          ),
          batchMode ? null : el("div", { class: "trailing", onClick: (e) => e.stopPropagation() },
            !searchQ ? iconBtn("arrow_upward", () => movePlugin(idx, -1), { title: "上移优先级", disabled: idx === 0 }) : null,
            !searchQ ? iconBtn("arrow_downward", () => movePlugin(idx, 1), { title: "下移优先级", disabled: idx === filtered.length - 1 }) : null,
            iconBtn("bug_report", () => go("/my/rules/test?name=" + encodeURIComponent(p.name)), { title: "测试规则" }),
            iconBtn("more_vert", (e) => openRuleItemMenu(e.currentTarget, p, upd), { title: "更多操作" })
          )
        );
        listEl.append(card);
      });
    }

    renderListOnly();
  }

  async function movePlugin(idx, delta) {
    const target = idx + delta;
    if (target < 0 || target >= plugins.length) return;
    const copy = plugins.slice();
    const [moved] = copy.splice(idx, 1);
    copy.splice(target, 0, moved);
    plugins = copy;
    KazumiStore.setPlugins(plugins);
    renderRulesPage();
    try {
      await fetchJsonPost("/api/plugins/reorder", { names: plugins.map((p) => p.name) });
    } catch (e) { toast(e.message); }
  }

  function openRuleItemMenu(anchor, p, upd) {
    const items = [
      { label: "编辑规则", icon: "edit", onClick: () => go("/my/rules/edit?name=" + encodeURIComponent(p.name)) },
      { label: "在线测试规则", icon: "bug_report", onClick: () => go("/my/rules/test?name=" + encodeURIComponent(p.name)) },
      {
        label: "复制 kazumi:// 分享链接",
        icon: "share",
        onClick: async () => {
          try {
            const res = await fetchJson("/api/plugins/" + encodeURIComponent(p.name));
            await navigator.clipboard.writeText(res.shareLink);
            toast("已复制 kazumi:// 分享链接");
          } catch (e) { toast(e.message); }
        },
      },
      {
        label: "复制规则 JSON",
        icon: "copy",
        onClick: () => {
          navigator.clipboard?.writeText(JSON.stringify(p, null, 2)).then(() => toast("已复制规则 JSON"));
        },
      },
    ];
    if (upd) {
      items.push({
        label: "更新到最新版本",
        icon: "refresh",
        onClick: async () => {
          try {
            await fetchJsonPost("/api/rules/install", { name: p.name });
            toast("规则 " + p.name + " 已更新");
            loadRules();
          } catch (e) { toast(e.message); }
        },
      });
    }
    items.push({ divider: true });
    items.push({
      label: "删除规则",
      icon: "delete",
      danger: true,
      onClick: async () => {
        try {
          await fetchJsonDelete("/api/rules/" + encodeURIComponent(p.name));
          plugins = plugins.filter((x) => x.name !== p.name);
          KazumiStore.setPlugins(plugins);
          renderRulesPage();
          toast("已删除规则 " + p.name);
        } catch (e) { toast(e.message); }
      },
    });
    openMenu(anchor, items);
  }

  async function deleteSelected() {
    const names = Array.from(selectedNames);
    for (const n of names) {
      await fetchJsonDelete("/api/rules/" + encodeURIComponent(n)).catch(() => {});
    }
    selectedNames.clear();
    batchMode = false;
    await KazumiStore.refreshLocalPluginsFromServer();
    toast("已删除 " + names.length + " 条规则");
    loadRules();
  }

  async function installRecommended() {
    toast("正在安装推荐规则…");
    try {
      const res = await fetchJsonPost("/api/rules/install-recommended", {});
      await KazumiStore.refreshLocalPluginsFromServer();
      toast("成功安装 " + (res.installed || 0) + " 条推荐规则");
      loadRules();
    } catch (e) { toast(e.message); }
  }

  async function updateAll(list) {
    let ok = 0;
    for (const p of list) {
      try {
        await fetchJsonPost("/api/rules/install", { name: p.name });
        ok++;
      } catch (_) {}
    }
    await KazumiStore.refreshLocalPluginsFromServer();
    toast("已更新 " + ok + " 条规则");
    loadRules();
  }

  function openAddRuleSheet() {
    openSheet({
      title: "添加规则",
      desc: "支持官方仓库、kazumi:// 链接、JSON 文本、远程 URL 或新建规则",
      content: ({ close }) => {
        const textArea = el("textarea", { class: "text-field mono", rows: 4, placeholder: "粘贴 kazumi://... 链接、单条规则 JSON、或规则数组 JSON" });
        const urlInput = el("input", { class: "text-field", placeholder: "输入规则 JSON 的远程 URL（https://...）" });
        const fileInput = el("input", { type: "file", accept: ".json,.txt", style: { display: "none" } });
        fileInput.addEventListener("change", async () => {
          const f = fileInput.files && fileInput.files[0];
          if (!f) return;
          textArea.value = await f.text();
          toast("已读取文件，点击导入即可");
        });

        async function doImportText() {
          const t = textArea.value.trim();
          if (!t) { toast("请先粘贴规则内容"); return; }
          try {
            const res = await fetchJsonPost("/api/rules/import", { text: t });
            await KazumiStore.refreshLocalPluginsFromServer();
            toast("成功导入 " + (res.count || 1) + " 条规则");
            close();
            loadRules();
          } catch (e) { toast(e.message); }
        }

        async function doImportUrl() {
          const u = urlInput.value.trim();
          if (!u) { toast("请输入规则 URL"); return; }
          try {
            const res = await fetchJsonPost("/api/rules/import", { url: u });
            await KazumiStore.refreshLocalPluginsFromServer();
            toast("成功导入 " + (res.count || 1) + " 条规则");
            close();
            loadRules();
          } catch (e) { toast(e.message); }
        }

        return el("div", {},
          el("button", { type: "button", class: "add-option is-primary sl", onClick: () => { close(); openRuleShopSheet(); } },
            iconNode("store"),
            el("div", { class: "text" }, el("div", { class: "t" }, "从官方规则仓库安装"), el("div", { class: "d" }, "内置 KazumiRules 官方源与多镜像"))
          ),
          el("button", { type: "button", class: "add-option sl", onClick: () => { close(); go("/my/rules/edit"); } },
            iconNode("edit"),
            el("div", { class: "text" }, el("div", { class: "t" }, "可视化新建规则"), el("div", { class: "d" }, "使用 Kazumi 规则编辑器编写自定义规则"))
          ),
          el("div", { class: "field-group", style: { marginTop: "14px" } },
            el("div", { class: "field-label" }, "从 kazumi:// 链接或 JSON 导入"),
            textArea,
            el("div", { class: "field-row" },
              fileInput,
              button("选择本地文件", () => fileInput.click(), { variant: "surface", small: true, icon: "upload" }),
              button("导入文本", doImportText, { small: true, icon: "check" })
            )
          ),
          el("div", { class: "field-group" },
            el("div", { class: "field-label" }, "从远程 URL 导入"),
            el("div", { class: "field-row" }, urlInput, button("拉取导入", doImportUrl, { variant: "tonal", small: true, icon: "download" }))
          )
        );
      },
    });
  }

  function openRuleShopSheet() {
    openSheet({
      title: "Kazumi 官方规则仓库",
      desc: "同步 Predidit/KazumiRules，离线时自动回退至内置规则快照",
      content: ({ body }) => {
        body.append(inlineLoading("正在拉取规则仓库目录…"));
        let allCat = [];
        let recSet = new Set();
        let shopQ = "";

        async function loadCatalog(force = false) {
          body.innerHTML = "";
          body.append(inlineLoading("正在拉取规则仓库目录…"));
          try {
            const res = await fetchJson("/api/rules/catalog" + (force ? "?force=1" : ""));
            allCat = res.items || [];
            recSet = new Set((res.recommended || []).map((x) => x.toLowerCase()));
            drawShop();
          } catch (e) {
            body.innerHTML = "";
            body.append(errorState(e, () => loadCatalog(true), { compact: true }));
          }
        }

        function drawShop() {
          body.innerHTML = "";
          const qInput = el("input", { type: "search", value: shopQ, placeholder: "搜索规则名或作者…" });
          const listWrap = el("div", { class: "rule-list" });
          qInput.addEventListener("input", () => { shopQ = qInput.value.trim().toLowerCase(); drawItems(); });

          body.append(
            el("div", { class: "field-row", style: { marginTop: 0, marginBottom: "10px" } },
              el("div", { class: "search-box is-high", style: { flex: 1 } }, iconNode("search"), qInput),
              iconBtn("refresh", () => loadCatalog(true), { title: "强制刷新仓库" })
            ),
            listWrap
          );

          function drawItems() {
            listWrap.innerHTML = "";
            const filtered = shopQ
              ? allCat.filter((c) => ((c.name || "") + " " + (c.author || "")).toLowerCase().includes(shopQ))
              : allCat;
            if (!filtered.length) {
              listWrap.append(emptyState({ compact: true, icon: "store", title: "没有匹配的仓库规则" }));
              return;
            }
            for (const c of filtered) {
              const isRec = recSet.has((c.name || "").toLowerCase());
              const needUpdate = c.installed && c.installedVersion && c.version && c.installedVersion !== c.version;
              const btnLabel = needUpdate ? "更新" : (c.installed ? "已安装" : "安装");
              const actBtn = button(btnLabel, async () => {
                actBtn.disabled = true;
                actBtn.querySelector("span").textContent = "安装中…";
                try {
                  await fetchJsonPost("/api/rules/install", { name: c.name });
                  c.installed = true;
                  c.installedVersion = c.version;
                  await KazumiStore.refreshLocalPluginsFromServer();
                  toast("已安装规则 " + c.name);
                  drawItems();
                  loadRules();
                } catch (e) {
                  toast(e.message);
                  actBtn.disabled = false;
                  actBtn.querySelector("span").textContent = btnLabel;
                }
              }, { variant: needUpdate ? "filled" : (c.installed ? "surface" : "tonal"), small: true });

              listWrap.append(el("div", { class: "rule-card" },
                el("div", { class: "rule-icon" + (c.installed ? " is-installed" : "") }, iconNode(c.installed ? "check" : "extension")),
                el("div", { class: "text" },
                  el("div", { class: "title" }, c.name),
                  el("div", { class: "tags" },
                    el("span", { class: "rule-tag tag-version" }, "v" + (c.version || "1.0")),
                    isRec ? el("span", { class: "rule-tag tag-api" }, "推荐") : null,
                    c.author ? el("span", { class: "rule-tag tag-version" }, c.author) : null
                  ),
                  c.lastUpdate ? el("div", { class: "cap" }, "更新于 " + formatRelTime(c.lastUpdate)) : null
                ),
                el("div", { class: "trailing" }, actBtn)
              ));
            }
          }
          drawItems();
        }

        loadCatalog(false);
        return null;
      },
    });
  }

  loadRules().then(() => {
    if (params && params.shop === "1") openRuleShopSheet();
  });
}

/* ==========================================================================
 * Route Dispatcher & App Bootstrap
 * ========================================================================== */
function dispatch() {
  const app = document.getElementById("app");
  if (!app) return;
  runCleanups();
  app.innerHTML = "";
  window.scrollTo(0, 0);

  const { path, params, raw } = parseRoute();
  _currentRouteKey = raw;

  if (path === "/" || path === "/home") {
    const tab = params.tab || "popular";
    if (tab === "timeline") renderTabTimeline(app);
    else if (tab === "collect") renderTabCollect(app);
    else if (tab === "my") renderTabMy(app);
    else renderTabPopular(app);
  } else if (path === "/search") {
    renderSearch(app, params);
  } else if (path === "/search/image") {
    if (typeof renderImageSearch === "function") renderImageSearch(app, params);
  } else if (path === "/bangumi") {
    renderBangumiDetail(app, params);
  } else if (path === "/episodes") {
    renderEpisodes(app, params);
  } else if (path === "/play") {
    if (typeof renderPlayer === "function") renderPlayer(app, params);
  } else if (path === "/my/history") {
    renderMyHistory(app);
  } else if (path === "/my/rules") {
    renderMyRules(app, params);
  } else if (path === "/my/rules/edit") {
    if (typeof renderRuleEditor === "function") renderRuleEditor(app, params);
  } else if (path === "/my/rules/test") {
    if (typeof renderRuleTester === "function") renderRuleTester(app, params);
  } else if (path === "/settings" || path.startsWith("/settings/")) {
    const cat = path === "/settings" ? "" : path.slice("/settings/".length);
    if (typeof renderSettings === "function") renderSettings(app, cat);
  } else {
    renderTabPopular(app);
  }
}

async function initAfterAuth() {
  await KazumiStore.syncWithServer();
  try {
    const s = await fetchJson("/api/settings");
    if (s && typeof s === "object") Object.assign(APP_SETTINGS, s);
  } catch (_) {}
}

async function bootstrapApp() {
  renderNavRail("popular");
  try {
    const st = await fetch("/api/auth/status").then((r) => r.json());
    AUTH_STATE = st || { authEnabled: false, authenticated: true };
  } catch (_) {}

  if (AUTH_STATE.authEnabled && !AUTH_STATE.authenticated) {
    showAuthGate();
  } else {
    await initAfterAuth();
    dispatch();
  }
  window.addEventListener("hashchange", dispatch);
}
