"use strict";

/**
 * Exact 9 Official Kazumi Material 3 Expressive Color Themes (aligned with lib/bean/settings/color_type.dart)
 * + OLED Pure Black Dark Mode enhancement (oledDarkTheme).
 */
const KAZUMI_COLOR_THEMES = [
  {
    id: "green",
    label: "默认",
    seed: "#4CAF50",
    light: {
      primary: "#316A33", onPrimary: "#FFFFFF", primaryContainer: "#B3F2B0", onPrimaryContainer: "#002204",
      secondary: "#52634F", onSecondary: "#FFFFFF", secondaryContainer: "#D5E8CF", onSecondaryContainer: "#101F10",
      tertiary: "#38656A", onTertiary: "#FFFFFF", tertiaryContainer: "#BCEBF0", onTertiaryContainer: "#002022",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#F7FBF1", onSurface: "#181D17", onSurfaceVariant: "#424940",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#F1F5EB", surfaceContainer: "#EBEFE5",
      surfaceContainerHigh: "#E5E9DF", surfaceContainerHighest: "#E0E4DA",
      outline: "#72796F", outlineVariant: "#C2C9BD",
      inverseSurface: "#2D322C", onInverseSurface: "#EEF2E8", inversePrimary: "#98D596",
    },
    dark: {
      primary: "#98D596", onPrimary: "#00390B", primaryContainer: "#19521E", onPrimaryContainer: "#B3F2B0",
      secondary: "#B9CCB4", onSecondary: "#243423", secondaryContainer: "#3A4B38", onSecondaryContainer: "#D5E8CF",
      tertiary: "#A0CFD4", onTertiary: "#00363B", tertiaryContainer: "#1F4D52", onTertiaryContainer: "#BCEBF0",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#101410", onSurface: "#E0E4DA", onSurfaceVariant: "#C2C9BD",
      surfaceContainerLowest: "#0B0F0B", surfaceContainerLow: "#181D17", surfaceContainer: "#1C211B",
      surfaceContainerHigh: "#262B25", surfaceContainerHighest: "#313630",
      outline: "#8C9388", outlineVariant: "#424940",
      inverseSurface: "#E0E4DA", onInverseSurface: "#2D322C", inversePrimary: "#316A33",
    },
  },
  {
    id: "teal",
    label: "青色",
    seed: "#009688",
    light: {
      primary: "#006A60", onPrimary: "#FFFFFF", primaryContainer: "#9EF2E4", onPrimaryContainer: "#00201C",
      secondary: "#4A635F", onSecondary: "#FFFFFF", secondaryContainer: "#CCE8E2", onSecondaryContainer: "#05201C",
      tertiary: "#456179", onTertiary: "#FFFFFF", tertiaryContainer: "#CCE5FF", onTertiaryContainer: "#001E31",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#F4FBF8", onSurface: "#161D1C", onSurfaceVariant: "#3F4947",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#EEF5F3", surfaceContainer: "#E9EFED",
      surfaceContainerHigh: "#E3EAE7", surfaceContainerHighest: "#DDE4E1",
      outline: "#6F7977", outlineVariant: "#BEC9C6",
      inverseSurface: "#2B3230", onInverseSurface: "#ECF2F0", inversePrimary: "#82D5C8",
    },
    dark: {
      primary: "#82D5C8", onPrimary: "#003731", primaryContainer: "#005048", onPrimaryContainer: "#9EF2E4",
      secondary: "#B1CCC6", onSecondary: "#1C3531", secondaryContainer: "#334B47", onSecondaryContainer: "#CCE8E2",
      tertiary: "#ADC9E5", onTertiary: "#143349", tertiaryContainer: "#2D4960", onTertiaryContainer: "#CCE5FF",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#0E1513", onSurface: "#DDE4E1", onSurfaceVariant: "#BEC9C6",
      surfaceContainerLowest: "#090F0E", surfaceContainerLow: "#161D1C", surfaceContainer: "#1A2120",
      surfaceContainerHigh: "#252B2A", surfaceContainerHighest: "#2F3635",
      outline: "#899390", outlineVariant: "#3F4947",
      inverseSurface: "#DDE4E1", onInverseSurface: "#2B3230", inversePrimary: "#006A60",
    },
  },
  {
    id: "blue",
    label: "蓝色",
    seed: "#2196F3",
    light: {
      primary: "#1560A5", onPrimary: "#FFFFFF", primaryContainer: "#D3E4FF", onPrimaryContainer: "#001C38",
      secondary: "#545F70", onSecondary: "#FFFFFF", secondaryContainer: "#D8E3F8", onSecondaryContainer: "#111C2B",
      tertiary: "#6C5677", onTertiary: "#FFFFFF", tertiaryContainer: "#F5D9FF", onTertiaryContainer: "#261431",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#F8F9FF", onSurface: "#191C20", onSurfaceVariant: "#43474E",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#F2F3FA", surfaceContainer: "#ECEEF4",
      surfaceContainerHigh: "#E6E8EE", surfaceContainerHighest: "#E1E2E8",
      outline: "#73777F", outlineVariant: "#C3C6CF",
      inverseSurface: "#2E3035", onInverseSurface: "#EFF0F7", inversePrimary: "#A2C9FF",
    },
    dark: {
      primary: "#A2C9FF", onPrimary: "#00315B", primaryContainer: "#004882", onPrimaryContainer: "#D3E4FF",
      secondary: "#BCC7DB", onSecondary: "#263141", secondaryContainer: "#3C4758", onSecondaryContainer: "#D8E3F8",
      tertiary: "#D8BDE3", onTertiary: "#3C2947", tertiaryContainer: "#543F5F", onTertiaryContainer: "#F5D9FF",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#111418", onSurface: "#E1E2E8", onSurfaceVariant: "#C3C6CF",
      surfaceContainerLowest: "#0B0E13", surfaceContainerLow: "#191C20", surfaceContainer: "#1D2024",
      surfaceContainerHigh: "#272A2F", surfaceContainerHighest: "#32353A",
      outline: "#8D9199", outlineVariant: "#43474E",
      inverseSurface: "#E1E2E8", onInverseSurface: "#2E3035", inversePrimary: "#1560A5",
    },
  },
  {
    id: "indigo",
    label: "靛蓝色",
    seed: "#3F51B5",
    light: {
      primary: "#4355B9", onPrimary: "#FFFFFF", primaryContainer: "#DEE0FF", onPrimaryContainer: "#00105C",
      secondary: "#5B5D72", onSecondary: "#FFFFFF", secondaryContainer: "#E0E0F9", onSecondaryContainer: "#181A2C",
      tertiary: "#77536D", onTertiary: "#FFFFFF", tertiaryContainer: "#FFD7F1", onTertiaryContainer: "#2D1228",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#FBF8FF", onSurface: "#1B1B21", onSurfaceVariant: "#46464F",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#F4F2FA", surfaceContainer: "#EEEDF4",
      surfaceContainerHigh: "#E9E7EF", surfaceContainerHighest: "#E3E1E9",
      outline: "#767680", outlineVariant: "#C7C5D0",
      inverseSurface: "#303036", onInverseSurface: "#F2EFF7", inversePrimary: "#BAC3FF",
    },
    dark: {
      primary: "#BAC3FF", onPrimary: "#0A228A", primaryContainer: "#293CA0", onPrimaryContainer: "#DEE0FF",
      secondary: "#C4C5DD", onSecondary: "#2D2F42", secondaryContainer: "#434559", onSecondaryContainer: "#E0E0F9",
      tertiary: "#E6B9D7", onTertiary: "#45263D", tertiaryContainer: "#5D3C54", onTertiaryContainer: "#FFD7F1",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#121318", onSurface: "#E3E1E9", onSurfaceVariant: "#C7C5D0",
      surfaceContainerLowest: "#0D0E13", surfaceContainerLow: "#1B1B21", surfaceContainer: "#1F1F25",
      surfaceContainerHigh: "#292930", surfaceContainerHighest: "#34343B",
      outline: "#90909A", outlineVariant: "#46464F",
      inverseSurface: "#E3E1E9", onInverseSurface: "#303036", inversePrimary: "#4355B9",
    },
  },
  {
    id: "violet",
    label: "紫罗兰色",
    seed: "#6750A4",
    light: {
      primary: "#6750A4", onPrimary: "#FFFFFF", primaryContainer: "#EADDFF", onPrimaryContainer: "#21005D",
      secondary: "#625B71", onSecondary: "#FFFFFF", secondaryContainer: "#E8DEF8", onSecondaryContainer: "#1D192B",
      tertiary: "#7D5260", onTertiary: "#FFFFFF", tertiaryContainer: "#FFD8E4", onTertiaryContainer: "#31111D",
      error: "#B3261E", onError: "#FFFFFF", errorContainer: "#F9DEDC", onErrorContainer: "#410E0B",
      surface: "#FEF7FF", onSurface: "#1D1B20", onSurfaceVariant: "#49454F",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#F7F2FA", surfaceContainer: "#F3EDF7",
      surfaceContainerHigh: "#ECE6F0", surfaceContainerHighest: "#E6E0E9",
      outline: "#79747E", outlineVariant: "#CAC4D0",
      inverseSurface: "#322F35", onInverseSurface: "#F5EFF7", inversePrimary: "#D0BCFF",
    },
    dark: {
      primary: "#D0BCFF", onPrimary: "#381E72", primaryContainer: "#4F378B", onPrimaryContainer: "#EADDFF",
      secondary: "#CCC2DC", onSecondary: "#332D41", secondaryContainer: "#4A4458", onSecondaryContainer: "#E8DEF8",
      tertiary: "#EFB8C8", onTertiary: "#492532", tertiaryContainer: "#633B48", onTertiaryContainer: "#FFD8E4",
      error: "#F2B8B5", onError: "#601410", errorContainer: "#8C1D18", onErrorContainer: "#F9DEDC",
      surface: "#141218", onSurface: "#E6E0E9", onSurfaceVariant: "#CAC4D0",
      surfaceContainerLowest: "#0F0D13", surfaceContainerLow: "#1D1B20", surfaceContainer: "#211F26",
      surfaceContainerHigh: "#2B2930", surfaceContainerHighest: "#36343B",
      outline: "#938F99", outlineVariant: "#49454F",
      inverseSurface: "#E6E0E9", onInverseSurface: "#322F35", inversePrimary: "#6750A4",
    },
  },
  {
    id: "pink",
    label: "粉红色",
    seed: "#E91E63",
    light: {
      primary: "#B41C55", onPrimary: "#FFFFFF", primaryContainer: "#FFD9E2", onPrimaryContainer: "#3E001A",
      secondary: "#74565E", onSecondary: "#FFFFFF", secondaryContainer: "#FFD9E2", onSecondaryContainer: "#2B151B",
      tertiary: "#7C5635", onTertiary: "#FFFFFF", tertiaryContainer: "#FFDCC1", onTertiaryContainer: "#2E1500",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#FFF8F8", onSurface: "#22191B", onSurfaceVariant: "#514346",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#FFF0F2", surfaceContainer: "#FAEAEB",
      surfaceContainerHigh: "#F4E4E6", surfaceContainerHighest: "#EEDEE0",
      outline: "#837376", outlineVariant: "#D5C2C5",
      inverseSurface: "#382E30", onInverseSurface: "#FEEDEF", inversePrimary: "#FFB1C5",
    },
    dark: {
      primary: "#FFB1C5", onPrimary: "#65002D", primaryContainer: "#8E0042", onPrimaryContainer: "#FFD9E2",
      secondary: "#E3BDC6", onSecondary: "#422930", secondaryContainer: "#5B3F47", onSecondaryContainer: "#FFD9E2",
      tertiary: "#EFBD94", onTertiary: "#48290C", tertiaryContainer: "#623F20", onTertiaryContainer: "#FFDCC1",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#191113", onSurface: "#EEDEE0", onSurfaceVariant: "#D5C2C5",
      surfaceContainerLowest: "#140C0E", surfaceContainerLow: "#22191B", surfaceContainer: "#261D1F",
      surfaceContainerHigh: "#31282A", surfaceContainerHighest: "#3C3234",
      outline: "#9E8C90", outlineVariant: "#514346",
      inverseSurface: "#EEDEE0", onInverseSurface: "#382E30", inversePrimary: "#B41C55",
    },
  },
  {
    id: "yellow",
    label: "黄色",
    seed: "#FBC02D",
    light: {
      primary: "#745B00", onPrimary: "#FFFFFF", primaryContainer: "#FFE088", onPrimaryContainer: "#241A00",
      secondary: "#695D3F", onSecondary: "#FFFFFF", secondaryContainer: "#F2E1BB", onSecondaryContainer: "#231B04",
      tertiary: "#47664A", onTertiary: "#FFFFFF", tertiaryContainer: "#C8ECC9", onTertiaryContainer: "#04210B",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#FFF9EE", onSurface: "#1F1B13", onSurfaceVariant: "#4C4639",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#FAF3E5", surfaceContainer: "#F4EDE0",
      surfaceContainerHigh: "#EEE7DA", surfaceContainerHighest: "#E8E2D4",
      outline: "#7E7667", outlineVariant: "#CFC5B4",
      inverseSurface: "#343027", onInverseSurface: "#F7F0E2", inversePrimary: "#E9C349",
    },
    dark: {
      primary: "#E9C349", onPrimary: "#3D2F00", primaryContainer: "#584400", onPrimaryContainer: "#FFE088",
      secondary: "#D5C5A1", onSecondary: "#393015", secondaryContainer: "#50462A", onSecondaryContainer: "#F2E1BB",
      tertiary: "#ADCFAE", onTertiary: "#19371E", tertiaryContainer: "#304E33", onTertiaryContainer: "#C8ECC9",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#16130B", onSurface: "#E8E2D4", onSurfaceVariant: "#CFC5B4",
      surfaceContainerLowest: "#110E07", surfaceContainerLow: "#1F1B13", surfaceContainer: "#231F17",
      surfaceContainerHigh: "#2D2A21", surfaceContainerHighest: "#38342B",
      outline: "#989080", outlineVariant: "#4C4639",
      inverseSurface: "#E8E2D4", onInverseSurface: "#343027", inversePrimary: "#745B00",
    },
  },
  {
    id: "orange",
    label: "橙色",
    seed: "#FF9800",
    light: {
      primary: "#8A5000", onPrimary: "#FFFFFF", primaryContainer: "#FFDCBE", onPrimaryContainer: "#2C1600",
      secondary: "#725A42", onSecondary: "#FFFFFF", secondaryContainer: "#FFDCBE", onSecondaryContainer: "#291806",
      tertiary: "#57633B", onTertiary: "#FFFFFF", tertiaryContainer: "#DBE8B6", onTertiaryContainer: "#151F02",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#FFF8F4", onSurface: "#221A13", onSurfaceVariant: "#50453A",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#FCF2EA", surfaceContainer: "#F6ECE4",
      surfaceContainerHigh: "#F0E6DE", surfaceContainerHighest: "#EAE1D9",
      outline: "#827568", outlineVariant: "#D4C4B5",
      inverseSurface: "#382F27", onInverseSurface: "#FEEEE3", inversePrimary: "#FFB870",
    },
    dark: {
      primary: "#FFB870", onPrimary: "#4A2800", primaryContainer: "#693C00", onPrimaryContainer: "#FFDCBE",
      secondary: "#E1C1A4", onSecondary: "#402C18", secondaryContainer: "#59422C", onSecondaryContainer: "#FFDCBE",
      tertiary: "#BFCC9C", onTertiary: "#2A3411", tertiaryContainer: "#404B25", onTertiaryContainer: "#DBE8B6",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#19120C", onSurface: "#EAE1D9", onSurfaceVariant: "#D4C4B5",
      surfaceContainerLowest: "#130D07", surfaceContainerLow: "#221A13", surfaceContainer: "#261E17",
      surfaceContainerHigh: "#312821", surfaceContainerHighest: "#3C332B",
      outline: "#9D8E81", outlineVariant: "#50453A",
      inverseSurface: "#EAE1D9", onInverseSurface: "#382F27", inversePrimary: "#8A5000",
    },
  },
  {
    id: "deepOrange",
    label: "深橙色",
    seed: "#FF5722",
    light: {
      primary: "#AD3209", onPrimary: "#FFFFFF", primaryContainer: "#FFDBD0", onPrimaryContainer: "#3A0B00",
      secondary: "#77574D", onSecondary: "#FFFFFF", secondaryContainer: "#FFDBD0", onSecondaryContainer: "#2C150E",
      tertiary: "#6B5D2F", onTertiary: "#FFFFFF", tertiaryContainer: "#F5E1A7", onTertiaryContainer: "#231B00",
      error: "#BA1A1A", onError: "#FFFFFF", errorContainer: "#FFDAD6", onErrorContainer: "#410002",
      surface: "#FFF8F6", onSurface: "#231917", onSurfaceVariant: "#53433F",
      surfaceContainerLowest: "#FFFFFF", surfaceContainerLow: "#FFF1EC", surfaceContainer: "#FCEAE5",
      surfaceContainerHigh: "#F6E4DF", surfaceContainerHighest: "#F1DFDA",
      outline: "#85736E", outlineVariant: "#D8C2BC",
      inverseSurface: "#392E2B", onInverseSurface: "#FFEDE8", inversePrimary: "#FFB59E",
    },
    dark: {
      primary: "#FFB59E", onPrimary: "#5F1600", primaryContainer: "#862200", onPrimaryContainer: "#FFDBD0",
      secondary: "#E7BDB0", onSecondary: "#442A22", secondaryContainer: "#5D4037", onSecondaryContainer: "#FFDBD0",
      tertiary: "#D8C68D", onTertiary: "#3A2F05", tertiaryContainer: "#52461A", onTertiaryContainer: "#F5E1A7",
      error: "#FFB4AB", onError: "#690005", errorContainer: "#93000A", onErrorContainer: "#FFDAD6",
      surface: "#1A110F", onSurface: "#F1DFDA", onSurfaceVariant: "#D8C2BC",
      surfaceContainerLowest: "#140C0A", surfaceContainerLow: "#231917", surfaceContainer: "#271D1B",
      surfaceContainerHigh: "#322825", surfaceContainerHighest: "#3D322F",
      outline: "#A08C87", outlineVariant: "#53433F",
      inverseSurface: "#F1DFDA", onInverseSurface: "#392E2B", inversePrimary: "#AD3209",
    },
  },
];

const THEME_MODE_LABELS = { system: "跟随系统", light: "浅色", dark: "深色" };

function getThemePrefs() {
  return {
    mode: localStorage.getItem("webThemeMode") || "system",
    colorId: localStorage.getItem("webThemeColor") || "green",
    oled: localStorage.getItem("webOledDark") === "1",
  };
}

function setThemePrefs(patch) {
  if (patch.mode != null) localStorage.setItem("webThemeMode", patch.mode);
  if (patch.colorId != null) localStorage.setItem("webThemeColor", patch.colorId);
  if (patch.oled != null) localStorage.setItem("webOledDark", patch.oled ? "1" : "0");
  applyKazumiTheme();
}

function _camelToKebab(s) {
  return s.replace(/([A-Z])/g, "-$1").toLowerCase();
}

function _schemeToVars(scheme, oled) {
  const s = Object.assign({}, scheme);
  if (oled) {
    s.surface = "#000000";
    s.surfaceContainerLowest = "#000000";
    s.surfaceContainerLow = "#0D0D0D";
    s.surfaceContainer = "#121212";
    s.surfaceContainerHigh = "#1A1A1A";
    s.surfaceContainerHighest = "#242424";
    s.onSurface = "#FFFFFF";
  }
  s.scaffoldBackground = s.surface;
  return Object.entries(s).map(([k, v]) => "  --" + _camelToKebab(k) + ": " + v + ";").join("\n");
}

function applyKazumiTheme() {
  const prefs = getThemePrefs();
  const palette = KAZUMI_COLOR_THEMES.find((t) => t.id === prefs.colorId) || KAZUMI_COLOR_THEMES[0];
  const root = document.documentElement;
  root.dataset.theme = prefs.mode === "system" ? "auto" : prefs.mode;
  root.classList.add("has-theme");

  let style = document.getElementById("theme-tokens");
  if (!style) {
    style = document.createElement("style");
    style.id = "theme-tokens";
    document.head.append(style);
  }
  const lightVars = _schemeToVars(palette.light, false);
  const darkVars = _schemeToVars(palette.dark, prefs.oled);
  style.textContent = [
    ':root[data-theme="light"], :root[data-theme="auto"] {', lightVars, "color-scheme: light;", "}",
    ':root[data-theme="dark"] {', darkVars, "color-scheme: dark;", "}",
    "@media (prefers-color-scheme: dark) {",
    '  :root[data-theme="auto"] {', darkVars, "color-scheme: dark;", "}",
    "}",
  ].join("\n");

  const meta = document.getElementById("meta-theme-color");
  if (meta) {
    const isDark = prefs.mode === "dark" || (prefs.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    meta.content = isDark ? (prefs.oled ? "#000000" : palette.dark.surface) : palette.light.surface;
  }
}

applyKazumiTheme();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyKazumiTheme);
