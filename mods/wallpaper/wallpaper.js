"use strict";

/**
 * Antigravity 自定义壁纸与毛玻璃主题工坊 v2 (Apple 级丝滑渲染架构)
 *
 * 性能与零 Bug 铁律：
 * 1. 预烘焙静态画布渲染 (#agy-wallpaper-canvas)：壁纸的模糊 (blur) 与亮度 (brightness) 直接烘焙到
 *    离屏/静态 Canvas 位图，零实时 CSS filter: blur() 开销；界面气泡/输入框绝不使用高开销 backdrop-filter，
 *    彻底保证开启壁纸与模糊后，底部「推理等级」滑条和对话滚动依然满帧 120fps 丝滑！
 * 2. Apple macOS / iOS 风格定制物理滑块：全 GPU transform (translate3d + scaleX) 驱动、指针捕获 +
 *    rAF 帧对齐 + 按下弹性放大 + 点击平滑滑行，无浏览器原生蓝框，零全页样式重排。
 * 3. 绝不把 :root 的 --background / --card / --secondary / --muted 改写成 transparent；
 *    绝不触碰 [data-base-ui-portal]、[role="menu"]、z-index: 99999、:has(...) 选择器；
 *    绝不劫持 getComputedStyle 或挂全树 MutationObserver。
 * 4. 所有自建 DOM 均带 data-ag-localization-skip="true"，与一键汉化引擎物理隔离。
 */
(function (root) {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    if (
      window.__agyWallpaperInstance &&
      typeof window.__agyWallpaperInstance.stop === "function"
    ) {
      try {
        window.__agyWallpaperInstance.stop();
      } catch (_) {}
    }

    var STYLE_ID = "agy-wallpaper-studio-style";
    var BACKDROP_ID = "agy-wallpaper-backdrop";
    var BTN_WRAP_ID = "agy-wallpaper-btn-wrap";
    var PANEL_ID = "agy-wallpaper-panel";
    var FALLBACK_STORAGE_KEY = "agy-wallpaper-fallback-v1";
    var SESSION_CACHE_KEY = "agy_wallpaper_session_v1";

    var PRESETS = [
      {
        id: "stock",
        name: "官方原版",
        nameDark: "官方原版",
        swatch: "linear-gradient(135deg, #27272a 0%, #09090b 100%)",
        swatchLight: "linear-gradient(135deg, #ffffff 0%, #e4e4e7 100%)",
        barDark: null,
        barLight: null,
        darkStops: null,
        lightStops: null
      },
      {
        id: "aurora",
        name: "四色极光",
        nameDark: "暗夜极光",
        swatch: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 50%, #ec4899 100%)",
        barDark: "#0f1626",
        barLight: "#eef3fe",
        accentDark: [96, 165, 250],
        accentLight: [66, 133, 244],
        gradStops: ["#60a5fa", "#c084fc", "#f87171"],
        darkStops: {
          base: ["#090e1a", "#0f172a", "#131b31"],
          blobs: [
            [0.18, 0.20, 0.50, "rgba(66,133,244,0.36)"],
            [0.82, 0.18, 0.46, "rgba(234,67,53,0.24)"],
            [0.14, 0.78, 0.48, "rgba(52,168,83,0.22)"],
            [0.86, 0.82, 0.52, "rgba(168,85,247,0.32)"]
          ]
        },
        lightStops: {
          base: ["#eef4ff", "#f5f3ff", "#fdf2f8"],
          blobs: [
            [0.18, 0.20, 0.52, "rgba(96,165,250,0.34)"],
            [0.82, 0.20, 0.50, "rgba(244,114,182,0.26)"],
            [0.20, 0.82, 0.50, "rgba(52,211,153,0.24)"],
            [0.84, 0.82, 0.52, "rgba(167,139,250,0.30)"]
          ]
        }
      },
      {
        id: "sky",
        name: "蔚蓝晴空",
        nameDark: "深海晴空",
        swatch: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)",
        barDark: "#0b1929",
        barLight: "#e4f3fe",
        accentDark: [56, 189, 248],
        accentLight: [2, 132, 199],
        gradStops: ["#38bdf8", "#60a5fa", "#818cf8"],
        darkStops: {
          base: ["#071321", "#0c1f35", "#091729"],
          blobs: [
            [0.22, 0.18, 0.54, "rgba(56,189,248,0.34)"],
            [0.80, 0.80, 0.54, "rgba(37,99,235,0.30)"]
          ]
        },
        lightStops: {
          base: ["#e0f2fe", "#f0f9ff", "#e8f1ff"],
          blobs: [
            [0.22, 0.18, 0.54, "rgba(56,189,248,0.36)"],
            [0.80, 0.80, 0.54, "rgba(96,165,250,0.28)"]
          ]
        }
      },
      {
        id: "cyber",
        name: "紫罗幽兰",
        nameDark: "幻夜幽紫",
        swatch: "linear-gradient(135deg, #a855f7 0%, #6366f1 55%, #22d3ee 100%)",
        barDark: "#161026",
        barLight: "#f1eafd",
        accentDark: [192, 132, 252],
        accentLight: [139, 92, 246],
        gradStops: ["#c084fc", "#818cf8", "#22d3ee"],
        darkStops: {
          base: ["#100b1d", "#19112b", "#0e1326"],
          blobs: [
            [0.20, 0.22, 0.52, "rgba(168,85,247,0.38)"],
            [0.82, 0.76, 0.50, "rgba(34,211,238,0.24)"],
            [0.55, 0.45, 0.55, "rgba(99,102,241,0.22)"]
          ]
        },
        lightStops: {
          base: ["#f3e8ff", "#ede9fe", "#ecfeff"],
          blobs: [
            [0.20, 0.22, 0.52, "rgba(192,132,252,0.36)"],
            [0.82, 0.76, 0.50, "rgba(103,232,249,0.28)"]
          ]
        }
      },
      {
        id: "emerald",
        name: "碧水青波",
        nameDark: "幽谷碧波",
        swatch: "linear-gradient(135deg, #2dd4bf 0%, #059669 100%)",
        barDark: "#091c1b",
        barLight: "#e7fcf8",
        accentDark: [45, 212, 191],
        accentLight: [13, 148, 136],
        gradStops: ["#2dd4bf", "#34d399", "#38bdf8"],
        darkStops: {
          base: ["#061617", "#0b2221", "#08181b"],
          blobs: [
            [0.20, 0.20, 0.52, "rgba(45,212,191,0.30)"],
            [0.80, 0.82, 0.54, "rgba(16,185,129,0.26)"]
          ]
        },
        lightStops: {
          base: ["#e6fffa", "#ecfdf5", "#f0fdfa"],
          blobs: [
            [0.20, 0.20, 0.52, "rgba(94,234,212,0.36)"],
            [0.80, 0.82, 0.54, "rgba(110,231,183,0.30)"]
          ]
        }
      },
      {
        id: "sunset",
        name: "落霞暖橙",
        nameDark: "熔岩暮色",
        swatch: "linear-gradient(135deg, #fb923c 0%, #f43f5e 100%)",
        barDark: "#1e1210",
        barLight: "#fff4eb",
        accentDark: [251, 146, 60],
        accentLight: [234, 88, 12],
        gradStops: ["#fb923c", "#fb7185", "#f59e0b"],
        darkStops: {
          base: ["#1b100b", "#241315", "#170e14"],
          blobs: [
            [0.18, 0.20, 0.52, "rgba(251,146,60,0.32)"],
            [0.82, 0.80, 0.54, "rgba(244,63,94,0.28)"]
          ]
        },
        lightStops: {
          base: ["#fff7ed", "#fff1f2", "#fef2f2"],
          blobs: [
            [0.18, 0.20, 0.52, "rgba(253,186,116,0.40)"],
            [0.82, 0.80, 0.54, "rgba(253,164,175,0.32)"]
          ]
        }
      },
      {
        id: "crimson",
        name: "丹霞绯红",
        nameDark: "丝绒酒红",
        swatch: "linear-gradient(135deg, #fb7185 0%, #be123c 100%)",
        barDark: "#211016",
        barLight: "#fff1f2",
        accentDark: [251, 113, 133],
        accentLight: [225, 29, 72],
        gradStops: ["#fb7185", "#f472b6", "#c084fc"],
        darkStops: {
          base: ["#1a0c12", "#261019", "#170c16"],
          blobs: [
            [0.20, 0.22, 0.52, "rgba(251,113,133,0.32)"],
            [0.80, 0.78, 0.52, "rgba(192,132,252,0.24)"]
          ]
        },
        lightStops: {
          base: ["#fff1f2", "#fdf2f8", "#faf5ff"],
          blobs: [
            [0.20, 0.22, 0.52, "rgba(253,164,175,0.42)"],
            [0.80, 0.78, 0.52, "rgba(249,168,212,0.34)"]
          ]
        }
      }
    ];

    var DEFAULT_CONFIG = {
      mode: "stock", // "stock" | "preset" | "image"
      presetId: "aurora",
      imageFile: "",
      imageName: "",
      scrim: 38,          // 0..88 (%)
      blur: 0,            // 0..24 (px)
      panelAlpha: 34,     // 0..85 (%)
      brightness: 95,     // 40..130 (%)
      fit: "cover-center", // "cover-center" | "cover-top" | "cover-bottom" | "contain"
      composerGlow: "google" // "google" | "gemini" | "off"
    };

    var state = {
      config: Object.assign({}, DEFAULT_CONFIG),
      activeDataUrl: "",
      images: [],
      fallbackImages: [],
      wallpaperDir: "",
      tab: "custom",
      panelOpen: false
    };

    var imageDataCache = new Map();
    var decodedImgCache = new Map(); // dataUrl -> HTMLImageElement
    var thumbCache = new Map();
    var destroyed = false;
    var saveTimer = null;
    var watchdogTimer = null;
    var themeClassObserver = null;
    var lastIsDark = null;

    // 帧对齐调度句柄（杜绝拖动滑块时重复绘制或全页回流）
    var canvasBakeRaf = null;
    var canvasBakeFast = false;
    var canvasFinalTimer = null;
    var panelAlphaRaf = null;
    var resizeBakeTimer = null;

    function getBridge() {
      var b = window.__agyWallpaperBridge;
      if (b && typeof b.getState === "function") return b;
      return null;
    }

    function isDarkMode() {
      try {
        var b = document.body;
        var h = document.documentElement;
        return Boolean(
          (b && (b.classList.contains("dark") || b.classList.contains("dark-theme") || b.classList.contains("theme-dark"))) ||
          (h && (h.classList.contains("dark") || h.classList.contains("dark-theme") || h.classList.contains("theme-dark")))
        );
      } catch (_) {
        return true;
      }
    }

    function clampNum(v, min, max, fallback) {
      var n = Number(v);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, n));
    }

    function normalizeConfig(raw) {
      var c = Object.assign({}, DEFAULT_CONFIG, raw && typeof raw === "object" ? raw : {});
      if (c.mode !== "stock" && c.mode !== "preset" && c.mode !== "image") {
        c.mode = "stock";
      }
      if (!PRESETS.some(function (p) { return p.id === c.presetId; })) {
        c.presetId = "aurora";
      }
      c.scrim = clampNum(c.scrim, 0, 88, DEFAULT_CONFIG.scrim);
      c.blur = clampNum(c.blur, 0, 24, DEFAULT_CONFIG.blur);
      c.panelAlpha = clampNum(c.panelAlpha, 0, 85, DEFAULT_CONFIG.panelAlpha);
      c.brightness = clampNum(c.brightness, 40, 130, DEFAULT_CONFIG.brightness);
      if (["cover-center", "cover-top", "cover-bottom", "contain"].indexOf(c.fit) < 0) {
        c.fit = "cover-center";
      }
      if (["google", "gemini", "off"].indexOf(c.composerGlow) < 0) {
        c.composerGlow = "google";
      }
      return c;
    }

    function getPreset(id) {
      return PRESETS.find(function (p) { return p.id === id; }) || PRESETS[0];
    }

    function activeDisplayName() {
      var cfg = state.config;
      var dark = isDarkMode();
      if (cfg.mode === "image" && (cfg.imageName || cfg.imageFile)) {
        var nm = cfg.imageName || cfg.imageFile;
        return nm.length > 10 ? nm.slice(0, 9) + "…" : nm;
      }
      if (cfg.mode === "preset") {
        var p = getPreset(cfg.presetId);
        return dark && p.nameDark ? p.nameDark : p.name;
      }
      return "壁纸";
    }

    function isActiveWallpaper() {
      var cfg = state.config;
      if (cfg.mode === "stock") return false;
      if (cfg.mode === "preset" && cfg.presetId === "stock") return false;
      if (cfg.mode === "image" && !state.activeDataUrl) return false;
      return true;
    }

    function isAnimatedGif(dataUrl) {
      return typeof dataUrl === "string" && dataUrl.slice(0, 22).toLowerCase().indexOf("data:image/gif") === 0;
    }

    // ── 核心 CSS（零实时 backdrop-filter / 零实时全屏 filter，满帧 120fps） ────────
    function buildStaticCss() {
      return [
        /* 壁纸层：固定在 body 最底层，零事件拦截，独立合成层 */
        "#" + BACKDROP_ID + " {",
        "  position: fixed;",
        "  inset: 0;",
        "  z-index: -1;",
        "  pointer-events: none;",
        "  overflow: hidden;",
        "  contain: strict;",
        "  display: none;",
        "  transform: translateZ(0);",
        "}",
        "html[data-agy-wallpaper-active='true'] #" + BACKDROP_ID + " {",
        "  display: block;",
        "}",
        "#agy-wallpaper-canvas {",
        "  position: absolute;",
        "  inset: 0;",
        "  width: 100%;",
        "  height: 100%;",
        "  display: block;",
        "  pointer-events: none;",
        "}",
        "#agy-wallpaper-gif {",
        "  position: absolute;",
        "  inset: -24px;",
        "  background-repeat: no-repeat;",
        "  background-position: center center;",
        "  background-size: cover;",
        "  display: none;",
        "  pointer-events: none;",
        "}",
        "#agy-wallpaper-scrim {",
        "  position: absolute;",
        "  inset: 0;",
        "  pointer-events: none;",
        "  will-change: opacity;",
        "}",
        ".agy-wp-plate {",
        "  position: absolute;",
        "  top: 0;",
        "  left: 0;",
        "  pointer-events: none;",
        "  will-change: opacity;",
        "}",

        /* 仅在开启壁纸/预设时，将最外层布局壳置透（绝不碰 :root 变量与弹窗 Portal） */
        "html[data-agy-wallpaper-active='true'] body {",
        "  background-color: transparent !important;",
        "  position: relative;",
        "  z-index: 0;",
        "}",
        "html[data-agy-wallpaper-active='true'] #root,",
        "html[data-agy-wallpaper-active='true'] .agy-shell,",
        "html[data-agy-wallpaper-active='true'] .agy-inset-shell,",
        "html[data-agy-wallpaper-active='true'] .agy-sheet {",
        "  background-color: transparent !important;",
        "  --shell-canvas: transparent !important;",
        "}",

        /* 顶栏、侧栏、主对话区底漆改由底层 GPU opacity 承托板绘制，拖动通透滑块 0 重排 120fps！ */
        "html[data-agy-wallpaper-active='true'] [data-testid='title-menu-bar'] {",
        "  background-color: transparent !important;",
        "  border-bottom: 1px solid var(--agy-wp-border) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [role='navigation'].bg-sidebar {",
        "  background-color: transparent !important;",
        "  border-right: 1px solid var(--agy-wp-border) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [role='navigation'].bg-sidebar .bg-sidebar,",
        "html[data-agy-wallpaper-active='true'] [role='navigation'].bg-sidebar [data-testid='project-header'] {",
        "  background-color: var(--agy-wp-sticky-bg) !important;",
        "}",
        /* 侧栏会话行发光药丸、悬停洁净遮罩与新建按钮高光 */
        "html[data-agy-wallpaper-active='true'] [data-testid^='conversation-row-']:hover,",
        "html[data-agy-wallpaper-active='true'] .agy-sidebar-row:hover {",
        "  background-color: var(--agy-wp-row-hover) !important;",
        "  border-radius: 8px !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid^='conversation-row-'][data-selected='true'],",
        "html[data-agy-wallpaper-active='true'] .agy-sidebar-row[data-selected='true'] {",
        "  background-color: var(--agy-wp-row-active) !important;",
        "  border-radius: 8px !important;",
        "  box-shadow: inset 0 0 0 1px var(--agy-wp-accent-border) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] :is([data-testid^='conversation-row-'], [data-testid='conversation-row-history']) :is(.agy-row-actions, [class*='top-0 bottom-0'])::before {",
        "  background: none !important;",
        "  background-image: none !important;",
        "  box-shadow: none !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='new-conversation-button'] {",
        "  border: 1px solid var(--agy-wp-accent-border) !important;",
        "  box-shadow: inset 0 1px 0 var(--agy-wp-specular) !important;",
        "  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='new-conversation-button']:hover {",
        "  background-color: var(--agy-wp-row-active) !important;",
        "  border-color: var(--agy-wp-accent) !important;",
        "}",

        /* 主对话区与辅助面板 */
        "html[data-agy-wallpaper-active='true'] [data-main-content-body] {",
        "  background-color: transparent !important;",
        "  border-color: var(--agy-wp-border) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-main-content-body] div.absolute.bottom-0.pointer-events-none {",
        "  background-image: none !important;",
        "  background-color: transparent !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-side-panel-body] {",
        "  background-color: var(--agy-wp-side-bg) !important;",
        "  border-color: var(--agy-wp-border) !important;",
        "}",

        /* 输入框与用户气泡：微光柔边半透卡片 + 聚焦主题流光描边（零 backdrop-filter，满帧 120fps！） */
        "@property --agy-g-angle {",
        "  syntax: '<angle>';",
        "  initial-value: 0deg;",
        "  inherits: false;",
        "}",
        "@keyframes agyGoogleRingSpin {",
        "  from { --agy-g-angle: 0deg; }",
        "  to { --agy-g-angle: 360deg; }",
        "}",
        "html[data-agy-wallpaper-active='true'] .surface-composer {",
        "  position: relative !important;",
        "  background-color: var(--agy-wp-accent-border) !important;",
        "  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28), 0 0 0 1px var(--agy-wp-border), inset 0 1px 0 var(--agy-wp-specular) !important;",
        "  transition: box-shadow 0.22s ease, background-color 0.22s ease !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] .surface-composer:focus-within {",
        "  background-color: var(--agy-wp-accent-soft) !important;",
        "  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.32), 0 0 18px var(--agy-wp-accent-glow) !important;",
        "}",
        /* 谷歌四色 / Gemini 极光流光外圈（纯 CSS Houdini 角度旋转 + mask 镂空，零裁切、零交互遮挡） */
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='google'] .surface-composer {",
        "  background-color: transparent !important;",
        "  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.30), -10px 0 22px -10px rgba(66, 133, 244, 0.44), 10px 0 22px -10px rgba(234, 67, 53, 0.38), 0 8px 22px -10px rgba(52, 168, 83, 0.36), 0 -4px 18px -10px rgba(251, 188, 5, 0.30) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='google'] .surface-composer:focus-within {",
        "  background-color: transparent !important;",
        "  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.36), -14px 0 28px -8px rgba(66, 133, 244, 0.62), 14px 0 28px -8px rgba(234, 67, 53, 0.56), 0 10px 28px -8px rgba(52, 168, 83, 0.50), 0 -6px 24px -8px rgba(251, 188, 5, 0.46) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='google'] .surface-composer::before,",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='gemini'] .surface-composer::before {",
        "  content: '' !important;",
        "  position: absolute !important;",
        "  inset: 0 !important;",
        "  border-radius: inherit !important;",
        "  padding: 2px !important;",
        "  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0) !important;",
        "  -webkit-mask-composite: xor !important;",
        "  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0) !important;",
        "  mask-composite: exclude !important;",
        "  pointer-events: none !important;",
        "  z-index: 3 !important;",
        "  opacity: 0.90 !important;",
        "  animation: agyGoogleRingSpin 5.5s linear infinite !important;",
        "  transition: opacity 0.2s ease, padding 0.2s ease !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='google'] .surface-composer::before {",
        "  background: conic-gradient(from var(--agy-g-angle), #4285f4 0deg, #34a853 90deg, #fbbc05 180deg, #ea4335 270deg, #4285f4 360deg) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='gemini'] .surface-composer {",
        "  background-color: transparent !important;",
        "  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.30), -10px 0 24px -10px rgba(66, 133, 244, 0.46), 10px 0 24px -10px rgba(217, 101, 112, 0.40), 0 8px 24px -10px rgba(155, 114, 203, 0.44), 0 -4px 18px -10px rgba(56, 189, 248, 0.34) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='gemini'] .surface-composer:focus-within {",
        "  background-color: transparent !important;",
        "  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.36), -14px 0 30px -8px rgba(66, 133, 244, 0.64), 14px 0 30px -8px rgba(217, 101, 112, 0.56), 0 10px 30px -8px rgba(155, 114, 203, 0.62), 0 -6px 24px -8px rgba(56, 189, 248, 0.48) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='gemini'] .surface-composer::before {",
        "  background: conic-gradient(from var(--agy-g-angle), #4285f4 0deg, #38bdf8 85deg, #9b72cb 185deg, #d96570 275deg, #4285f4 360deg) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='google'] .surface-composer:focus-within::before,",
        "html[data-agy-wallpaper-active='true'][data-agy-composer-glow='gemini'] .surface-composer:focus-within::before {",
        "  padding: 2.5px !important;",
        "  opacity: 1 !important;",
        "  animation-duration: 3.6s !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] .surface-composer-card {",
        "  background-color: var(--agy-wp-composer-bg) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] .agy-user-bubble,",
        "html[data-agy-wallpaper-active='true'] [data-testid='user-message-bubble'] {",
        "  background-color: var(--agy-wp-bubble-bg) !important;",
        "  border: 1px solid var(--agy-wp-accent-border) !important;",
        "  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16), inset 0 1px 0 var(--agy-wp-specular) !important;",
        "}",

        /* 主题色发光发送按钮（精确命中发送按钮，绝不误伤语音/听写按钮） */
        "html[data-agy-wallpaper-active='true'] [data-testid='send-button'],",
        "html[data-agy-wallpaper-active='true'] button[data-tooltip-id='input-send-button-send-tooltip']:not([aria-label*='Cancel' i]) {",
        "  border-radius: 9999px !important;",
        "  transition: background-color 0.16s ease, box-shadow 0.16s ease, transform 0.12s ease !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='send-button']:not(:disabled),",
        "html[data-agy-wallpaper-active='true'] button[data-tooltip-id='input-send-button-send-tooltip']:not([aria-label*='Cancel' i]):not(:disabled) {",
        "  background-color: var(--agy-wp-accent) !important;",
        "  color: #ffffff !important;",
        "  box-shadow: 0 4px 14px var(--agy-wp-accent-glow) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='send-button']:not(:disabled):hover,",
        "html[data-agy-wallpaper-active='true'] button[data-tooltip-id='input-send-button-send-tooltip']:not([aria-label*='Cancel' i]):not(:disabled):hover {",
        "  box-shadow: 0 6px 18px var(--agy-wp-accent-glow) !important;",
        "  transform: translateY(-0.5px);",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='send-button']:not(:disabled) svg,",
        "html[data-agy-wallpaper-active='true'] button[data-tooltip-id='input-send-button-send-tooltip']:not([aria-label*='Cancel' i]):not(:disabled) svg {",
        "  color: #ffffff !important;",
        "  fill: #ffffff !important;",
        "}",

        /* 精致三段极光流光滚动条 & 对话回溯圆点 */
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'] [data-testid='overlay-scrollbar-thumb'] {",
        "  background-color: var(--agy-wp-accent-soft) !important;",
        "  border-radius: 999px !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='vertical'][data-expanded='true'] [data-testid='overlay-scrollbar-thumb'],",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='vertical'][data-hovered='true'] [data-testid='overlay-scrollbar-thumb'],",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='vertical'][data-dragging='true'] [data-testid='overlay-scrollbar-thumb'],",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='vertical']:hover [data-testid='overlay-scrollbar-thumb'] {",
        "  background-color: transparent !important;",
        "  background-image: var(--agy-wp-scroll-grad-v) !important;",
        "  box-shadow: 0 0 8px var(--agy-wp-accent-glow) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='horizontal'][data-expanded='true'] [data-testid='overlay-scrollbar-thumb'],",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='horizontal'][data-hovered='true'] [data-testid='overlay-scrollbar-thumb'],",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='horizontal'][data-dragging='true'] [data-testid='overlay-scrollbar-thumb'],",
        "html[data-agy-wallpaper-active='true'] [data-testid='overlay-scrollbar'][data-orientation='horizontal']:hover [data-testid='overlay-scrollbar-thumb'] {",
        "  background-color: transparent !important;",
        "  background-image: var(--agy-wp-scroll-grad-h) !important;",
        "  box-shadow: 0 0 8px var(--agy-wp-accent-glow) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] .md-table-scroll::-webkit-scrollbar-thumb {",
        "  background: var(--agy-wp-accent-soft) !important;",
        "  border-radius: 999px !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] .md-table-scroll::-webkit-scrollbar-thumb:hover {",
        "  background: var(--agy-wp-scroll-grad-h) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='conversation-navigator-turn'] > span,",
        "html[data-agy-wallpaper-active='true'] [data-testid='conversation-navigator-group'] > span {",
        "  background-color: var(--agy-wp-accent-soft) !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-testid='conversation-navigator-turn'][data-active='true'] > span,",
        "html[data-agy-wallpaper-active='true'] [data-testid='conversation-navigator-turn']:hover > span {",
        "  background-image: var(--agy-wp-scroll-grad-h) !important;",
        "  box-shadow: 0 0 6px var(--agy-wp-accent-glow) !important;",
        "}",

        /* Markdown 引用块与告警框：左侧主题色竖条 + 柔光半透底色 */
        "html[data-agy-wallpaper-active='true'] [data-markdown-root] blockquote:not(.markdown-alert) {",
        "  background: linear-gradient(90deg, var(--agy-wp-quote-bg) 0%, transparent 100%) !important;",
        "  border-left: 3.5px solid var(--agy-wp-accent) !important;",
        "  border-top: 1px solid var(--agy-wp-border) !important;",
        "  border-right: 1px solid var(--agy-wp-border) !important;",
        "  border-bottom: 1px solid var(--agy-wp-border) !important;",
        "  border-radius: 0 10px 10px 0 !important;",
        "  padding: 10px 16px !important;",
        "}",
        "html[data-agy-wallpaper-active='true'] [data-markdown-root] .markdown-alert {",
        "  background-color: var(--agy-wp-bubble-bg) !important;",
        "  border-top: 1px solid var(--agy-wp-border) !important;",
        "  border-right: 1px solid var(--agy-wp-border) !important;",
        "  border-bottom: 1px solid var(--agy-wp-border) !important;",
        "  border-radius: 0 10px 10px 0 !important;",
        "}",

        /* 深色终端高对比 ANSI 16 色板（WCAG ≥ 4.55:1，代码输出更清晰亮眼） */
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-0 { color: #94a3b8 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-1 { color: #f87171 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-2 { color: #4ade80 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-3 { color: #fbbf24 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-4 { color: #60a5fa !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-5 { color: #c084fc !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-6 { color: #2dd4bf !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-7 { color: #e2e8f0 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-8 { color: #94a3b8 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-9 { color: #fca5a5 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-10 { color: #86efac !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-11 { color: #fde047 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-12 { color: #93c5fd !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-13 { color: #d8b4fe !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-14 { color: #5eead4 !important; }",
        "html[data-agy-wallpaper-active='true'] body.dark [data-testid='terminal-active'] .xterm .xterm-fg-15 { color: #f8fafc !important; }",

        /* 看图弹窗精致微光胶囊（不动原生定位与层级） */
        "html[data-agy-wallpaper-active='true'] [data-testid='media-modal-header'] > div,",
        "html[data-agy-wallpaper-active='true'] [data-testid='media-modal-zoom-controls'] {",
        "  border: 1px solid var(--agy-wp-accent-border) !important;",
        "  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.36) !important;",
        "}",

        /* ── 顶栏壁纸入口胶囊按钮 ── */
        "#" + BTN_WRAP_ID + " {",
        "  position: relative;",
        "  display: inline-flex;",
        "  align-items: center;",
        "  margin-right: 6px;",
        "  flex: 0 0 auto;",
        "  user-select: none;",
        "}",
        "#agy-wallpaper-btn {",
        "  display: inline-flex;",
        "  align-items: center;",
        "  gap: 5px;",
        "  height: 26px;",
        "  padding: 0 9px;",
        "  border-radius: 7px;",
        "  font-size: 12px;",
        "  font-weight: 500;",
        "  line-height: 1;",
        "  cursor: pointer;",
        "  outline: none;",
        "  white-space: nowrap;",
        "  font-family: inherit;",
        "  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);",
        "  color: var(--agy-wp-ui-fg, #e5e7eb);",
        "  background: var(--agy-wp-ui-btn-bg, rgba(255,255,255,0.08));",
        "  border: 1px solid var(--agy-wp-ui-border, rgba(255,255,255,0.14));",
        "}",
        "#agy-wallpaper-btn:hover { background: var(--agy-wp-ui-btn-hover, rgba(255,255,255,0.16)); }",
        "#agy-wallpaper-btn:active { transform: scale(0.96); }",

        /* ── Apple 风格浮窗面板（无高开销重模糊，保证面板内 120fps 跟手） ── */
        "#" + PANEL_ID + " {",
        "  position: fixed;",
        "  width: 348px;",
        "  max-height: min(640px, calc(100vh - 64px));",
        "  display: none;",
        "  flex-direction: column;",
        "  border-radius: 16px;",
        "  overflow: hidden;",
        "  z-index: 99990;",
        "  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;",
        "  color: var(--agy-wp-panel-fg, #f5f5f7);",
        "  background: var(--agy-wp-panel-bg, rgba(22, 24, 32, 0.96));",
        "  border: 1px solid var(--agy-wp-panel-border, rgba(255,255,255,0.14));",
        "  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.56), 0 4px 14px rgba(0, 0, 0, 0.3), inset 0 1px 0 var(--agy-wp-specular, rgba(255,255,255,0.08));",
        "  user-select: none;",
        "  contain: layout style;",
        "}",
        "#" + PANEL_ID + ".is-open { display: flex; animation: agyWpPopIn 0.18s cubic-bezier(0.22, 1, 0.36, 1); }",
        "@keyframes agyWpPopIn {",
        "  from { opacity: 0; transform: translate3d(0, -6px, 0) scale(0.98); }",
        "  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }",
        "}",
        ".agy-wp-header {",
        "  display: flex;",
        "  align-items: center;",
        "  justify-content: space-between;",
        "  padding: 13px 14px 10px;",
        "  border-bottom: 1px solid var(--agy-wp-panel-border, rgba(255,255,255,0.1));",
        "}",
        ".agy-wp-title {",
        "  display: flex;",
        "  align-items: center;",
        "  gap: 7px;",
        "  font-size: 13px;",
        "  font-weight: 600;",
        "  letter-spacing: -0.01em;",
        "}",
        ".agy-wp-header-actions { display: flex; align-items: center; gap: 6px; }",
        ".agy-wp-pill-btn {",
        "  height: 25px;",
        "  padding: 0 9px;",
        "  border-radius: 7px;",
        "  font-size: 11.5px;",
        "  font-weight: 500;",
        "  cursor: pointer;",
        "  outline: none;",
        "  border: 1px solid var(--agy-wp-panel-border, rgba(255,255,255,0.13));",
        "  background: var(--agy-wp-subtle-bg, rgba(255,255,255,0.06));",
        "  color: inherit;",
        "  transition: background 0.14s ease, transform 0.12s ease;",
        "}",
        ".agy-wp-pill-btn:hover { background: var(--agy-wp-subtle-hover, rgba(255,255,255,0.14)); }",
        ".agy-wp-pill-btn:active { transform: scale(0.96); }",
        ".agy-wp-close {",
        "  width: 24px; height: 24px; border-radius: 7px; border: none; outline: none;",
        "  background: transparent; color: inherit; opacity: 0.68; cursor: pointer;",
        "  font-size: 16px; line-height: 1; display: inline-flex; align-items: center; justify-content: center;",
        "  transition: opacity 0.12s ease, background 0.12s ease;",
        "}",
        ".agy-wp-close:hover { opacity: 1; background: var(--agy-wp-subtle-hover, rgba(255,255,255,0.12)); }",

        /* Apple Segmented Control Tabs */
        ".agy-wp-tabs {",
        "  display: grid;",
        "  grid-template-columns: 1fr 1fr;",
        "  gap: 3px;",
        "  margin: 10px 12px 4px;",
        "  padding: 3px;",
        "  border-radius: 10px;",
        "  background: var(--agy-wp-subtle-bg, rgba(255,255,255,0.06));",
        "}",
        ".agy-wp-tab {",
        "  height: 26px;",
        "  border-radius: 7px;",
        "  border: none;",
        "  outline: none;",
        "  background: transparent;",
        "  color: inherit;",
        "  opacity: 0.72;",
        "  font-size: 12px;",
        "  font-weight: 500;",
        "  cursor: pointer;",
        "  transition: background 0.16s ease, opacity 0.16s ease, box-shadow 0.16s ease;",
        "}",
        ".agy-wp-tab.is-active {",
        "  opacity: 1;",
        "  font-weight: 600;",
        "  background: var(--agy-wp-seg-active, rgba(255,255,255,0.14));",
        "  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);",
        "}",

        ".agy-wp-body {",
        "  padding: 8px 13px 13px;",
        "  overflow-y: auto;",
        "  display: flex;",
        "  flex-direction: column;",
        "  gap: 11px;",
        "  scrollbar-width: thin;",
        "}",

        ".agy-wp-dropzone {",
        "  border: 1.5px dashed rgba(10, 132, 255, 0.5);",
        "  border-radius: 11px;",
        "  padding: 12px 10px;",
        "  text-align: center;",
        "  cursor: pointer;",
        "  background: rgba(10, 132, 255, 0.07);",
        "  transition: background 0.15s ease, border-color 0.15s ease, transform 0.12s ease;",
        "}",
        ".agy-wp-dropzone:hover, .agy-wp-dropzone.is-dragover {",
        "  background: rgba(10, 132, 255, 0.15);",
        "  border-color: #0a84ff;",
        "}",
        ".agy-wp-dropzone:active { transform: scale(0.99); }",
        ".agy-wp-drop-title { font-size: 12.5px; font-weight: 600; color: #3898ff; }",
        ".agy-wp-drop-sub { font-size: 11px; opacity: 0.66; margin-top: 3px; }",
        ".agy-wp-toolbar-row { display: flex; align-items: center; gap: 6px; }",
        ".agy-wp-toolbar-row .agy-wp-pill-btn { flex: 1; height: 27px; font-size: 11.5px; }",

        ".agy-wp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }",
        ".agy-wp-card {",
        "  position: relative;",
        "  aspect-ratio: 16 / 10;",
        "  border-radius: 10px;",
        "  overflow: hidden;",
        "  cursor: pointer;",
        "  border: 1.5px solid var(--agy-wp-panel-border, rgba(255,255,255,0.12));",
        "  background: rgba(128, 128, 128, 0.14);",
        "  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.15s ease, box-shadow 0.15s ease;",
        "}",
        ".agy-wp-card:hover { transform: translateY(-1px) scale(1.015); border-color: rgba(10,132,255,0.7); }",
        ".agy-wp-card:active { transform: scale(0.97); }",
        ".agy-wp-card.is-selected {",
        "  border-color: #0a84ff;",
        "  box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.36);",
        "}",
        ".agy-wp-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; }",
        ".agy-wp-card-label {",
        "  position: absolute; left: 0; right: 0; bottom: 0; padding: 12px 6px 4px;",
        "  font-size: 10.5px; font-weight: 500; color: #fff;",
        "  text-shadow: 0 1px 2px rgba(0,0,0,0.85);",
        "  background: linear-gradient(to top, rgba(0,0,0,0.74), transparent);",
        "  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;",
        "}",
        ".agy-wp-card-del {",
        "  position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; border-radius: 999px;",
        "  border: none; background: rgba(0,0,0,0.68); color: #fff; font-size: 12px; line-height: 1;",
        "  cursor: pointer; opacity: 0; display: flex; align-items: center; justify-content: center;",
        "  transition: opacity 0.14s ease, background 0.14s ease;",
        "}",
        ".agy-wp-card:hover .agy-wp-card-del { opacity: 1; }",
        ".agy-wp-card-del:hover { background: #ff453a; }",
        ".agy-wp-empty { font-size: 11.5px; opacity: 0.65; text-align: center; padding: 10px 4px; }",

        /* ── Apple macOS Sequoia / iOS 风格超丝滑物理滑块 ── */
        ".agy-wp-controls {",
        "  display: flex; flex-direction: column; gap: 11px;",
        "  padding-top: 10px;",
        "  border-top: 1px solid var(--agy-wp-panel-border, rgba(255,255,255,0.1));",
        "}",
        ".agy-aslider-wrap { display: flex; flex-direction: column; gap: 4px; }",
        ".agy-aslider-head {",
        "  display: flex; justify-content: space-between; align-items: center;",
        "  font-size: 12px; letter-spacing: -0.01em;",
        "}",
        ".agy-aslider-label { opacity: 0.9; font-weight: 500; }",
        ".agy-aslider-val {",
        "  font-size: 11.5px;",
        "  font-variant-numeric: tabular-nums;",
        "  opacity: 0.66;",
        "  transition: opacity 0.15s ease, color 0.15s ease, transform 0.15s ease;",
        "}",
        ".agy-aslider-wrap.is-dragging .agy-aslider-val {",
        "  opacity: 1;",
        "  color: #3898ff;",
        "  font-weight: 600;",
        "}",
        ".agy-aslider {",
        "  position: relative;",
        "  height: 22px;",
        "  display: flex;",
        "  align-items: center;",
        "  cursor: pointer;",
        "  touch-action: none;",
        "  outline: none;",
        "}",
        ".agy-aslider-track {",
        "  position: relative;",
        "  width: 100%;",
        "  height: 6px;",
        "  border-radius: 999px;",
        "  overflow: hidden;",
        "  background: var(--agy-wp-track-bg, rgba(255, 255, 255, 0.14));",
        "  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.24);",
        "  transition: height 0.16s cubic-bezier(0.22, 1, 0.36, 1), background 0.16s ease;",
        "}",
        ".agy-aslider:hover .agy-aslider-track,",
        ".agy-aslider-wrap.is-dragging .agy-aslider-track {",
        "  height: 7px;",
        "  background: var(--agy-wp-track-hover, rgba(255, 255, 255, 0.20));",
        "}",
        ".agy-aslider-fill {",
        "  position: absolute;",
        "  inset: 0;",
        "  border-radius: 999px;",
        "  background: linear-gradient(90deg, #0a84ff 0%, #5ac8fa 100%);",
        "  transform-origin: left center;",
        "  transform: scaleX(0);",
        "  will-change: transform;",
        "}",
        ".agy-aslider.is-gliding .agy-aslider-fill {",
        "  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1);",
        "}",
        ".agy-aslider-thumb {",
        "  position: absolute;",
        "  top: 50%;",
        "  left: 0;",
        "  width: 18px;",
        "  height: 18px;",
        "  border-radius: 999px;",
        "  background: #ffffff;",
        "  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.38), 0 0.5px 1.5px rgba(0, 0, 0, 0.25), 0 0 0 0.5px rgba(0, 0, 0, 0.08);",
        "  transform: translate3d(0px, -50%, 0) scale(1);",
        "  will-change: transform;",
        "  pointer-events: none;",
        "  transition: box-shadow 0.18s ease;",
        "}",
        ".agy-aslider.is-gliding .agy-aslider-thumb {",
        "  transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease;",
        "}",
        ".agy-aslider:hover .agy-aslider-thumb {",
        "  box-shadow: 0 3px 9px rgba(0, 0, 0, 0.42), 0 0 0 3px rgba(10, 132, 255, 0.18);",
        "}",
        ".agy-aslider-wrap.is-dragging .agy-aslider-thumb {",
        "  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.48), 0 0 0 5px rgba(10, 132, 255, 0.26);",
        "}",

        /* Apple Segmented Fit Row */
        ".agy-wp-fit-row {",
        "  display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px;",
        "  padding: 3px; border-radius: 9px;",
        "  background: var(--agy-wp-subtle-bg, rgba(255,255,255,0.06));",
        "}",
        ".agy-wp-glow-row {",
        "  display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px;",
        "  padding: 3px; border-radius: 9px;",
        "  background: var(--agy-wp-subtle-bg, rgba(255,255,255,0.06));",
        "}",
        ".agy-wp-glow-dot {",
        "  display: inline-block; width: 8px; height: 8px; border-radius: 999px;",
        "  margin-right: 4px; vertical-align: -0.5px;",
        "}",
        ".agy-wp-fit-btn {",
        "  height: 24px; border-radius: 6px; font-size: 11px; cursor: pointer;",
        "  border: none; outline: none; background: transparent; color: inherit; opacity: 0.72;",
        "  transition: background 0.14s ease, opacity 0.14s ease;",
        "}",
        ".agy-wp-fit-btn:hover { opacity: 0.95; }",
        ".agy-wp-fit-btn.is-active {",
        "  opacity: 1;",
        "  background: var(--agy-wp-seg-active, rgba(255,255,255,0.15));",
        "  box-shadow: 0 1px 3px rgba(0,0,0,0.2);",
        "  font-weight: 600;",
        "}",
        ".agy-wp-status {",
        "  font-size: 11px; opacity: 0.66; display: flex;",
        "  justify-content: space-between; align-items: center; padding-top: 2px;",
        "}"
      ].join("\n");
    }

    function ensureStyleAndBackdrop() {
      var styleEl = document.getElementById(STYLE_ID);
      if (!styleEl) {
        styleEl = document.createElement("style");
        styleEl.id = STYLE_ID;
        styleEl.textContent = buildStaticCss();
        (document.head || document.documentElement).appendChild(styleEl);
      }

      var backdrop = document.getElementById(BACKDROP_ID);
      if (!backdrop && document.body) {
        backdrop = document.createElement("div");
        backdrop.id = BACKDROP_ID;
        backdrop.setAttribute("data-ag-localization-skip", "true");
        backdrop.setAttribute("aria-hidden", "true");

        var canvas = document.createElement("canvas");
        canvas.id = "agy-wallpaper-canvas";
        canvas.setAttribute("data-ag-localization-skip", "true");

        var gifLayer = document.createElement("div");
        gifLayer.id = "agy-wallpaper-gif";
        gifLayer.setAttribute("data-ag-localization-skip", "true");

        var scrimLayer = document.createElement("div");
        scrimLayer.id = "agy-wallpaper-scrim";
        scrimLayer.setAttribute("data-ag-localization-skip", "true");

        var plateBar = document.createElement("div");
        plateBar.id = "agy-wp-plate-bar";
        plateBar.className = "agy-wp-plate";
        plateBar.setAttribute("data-ag-localization-skip", "true");

        var plateSidebar = document.createElement("div");
        plateSidebar.id = "agy-wp-plate-sidebar";
        plateSidebar.className = "agy-wp-plate";
        plateSidebar.setAttribute("data-ag-localization-skip", "true");

        var plateMain = document.createElement("div");
        plateMain.id = "agy-wp-plate-main";
        plateMain.className = "agy-wp-plate";
        plateMain.setAttribute("data-ag-localization-skip", "true");

        backdrop.appendChild(canvas);
        backdrop.appendChild(gifLayer);
        backdrop.appendChild(scrimLayer);
        backdrop.appendChild(plateBar);
        backdrop.appendChild(plateSidebar);
        backdrop.appendChild(plateMain);
        document.body.insertBefore(backdrop, document.body.firstChild);
      }
      return backdrop;
    }

    // ── 预烘焙 Canvas 壁纸渲染器（零实时 GPU blur，保障全站 120fps） ──────────────
    function getDecodedImage(dataUrl) {
      if (!dataUrl) return Promise.resolve(null);
      var cached = decodedImgCache.get(dataUrl);
      if (cached && cached.complete && cached.naturalWidth > 0) {
        return Promise.resolve(cached);
      }
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          decodedImgCache.set(dataUrl, img);
          resolve(img);
        };
        img.onerror = function () { resolve(null); };
        img.src = dataUrl;
      });
    }

    function drawGradientPreset(ctx, w, h, preset, dark) {
      var spec = dark ? preset.darkStops : preset.lightStops;
      if (!spec) return;
      var lg = ctx.createLinearGradient(0, 0, w, h);
      lg.addColorStop(0, spec.base[0]);
      lg.addColorStop(0.5, spec.base[1]);
      lg.addColorStop(1, spec.base[2]);
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, w, h);

      var maxR = Math.max(w, h);
      for (var i = 0; i < spec.blobs.length; i += 1) {
        var b = spec.blobs[i];
        var cx = b[0] * w;
        var cy = b[1] * h;
        var rad = b[2] * maxR;
        var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        rg.addColorStop(0, b[3]);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, w, h);
      }
    }

    function computeImageDrawBox(imgW, imgH, cw, ch, fit) {
      if (fit === "contain") {
        var scaleIn = Math.min(cw / imgW, ch / imgH);
        var dwIn = imgW * scaleIn;
        var dhIn = imgH * scaleIn;
        return { x: (cw - dwIn) / 2, y: (ch - dhIn) / 2, w: dwIn, h: dhIn };
      }
      var scale = Math.max(cw / imgW, ch / imgH);
      var dw = imgW * scale;
      var dh = imgH * scale;
      var dx = (cw - dw) / 2;
      var dy = (ch - dh) / 2;
      if (fit === "cover-top") dy = 0;
      else if (fit === "cover-bottom") dy = ch - dh;
      return { x: dx, y: dy, w: dw, h: dh };
    }

    function bakeWallpaperCanvasNow(fastPreview) {
      var canvas = document.getElementById("agy-wallpaper-canvas");
      var gifLayer = document.getElementById("agy-wallpaper-gif");
      if (!canvas || !gifLayer) return;
      if (!isActiveWallpaper()) {
        canvas.style.display = "none";
        gifLayer.style.display = "none";
        return;
      }

      var cfg = state.config;
      var dark = isDarkMode();
      var vw = Math.max(320, window.innerWidth || 1440);
      var vh = Math.max(240, window.innerHeight || 900);

      // 动态 GIF 保留原生动画
      if (cfg.mode === "image" && isAnimatedGif(state.activeDataUrl)) {
        canvas.style.display = "none";
        gifLayer.style.display = "block";
        var targetUrl = 'url("' + state.activeDataUrl.replace(/"/g, '\\"') + '")';
        if (gifLayer.style.backgroundImage !== targetUrl) {
          gifLayer.style.backgroundImage = targetUrl;
        }
        gifLayer.style.backgroundSize = cfg.fit === "contain" ? "contain" : "cover";
        gifLayer.style.backgroundPosition =
          cfg.fit === "cover-top" ? "center top" : cfg.fit === "cover-bottom" ? "center bottom" : "center center";
        var gifFilter = [];
        if (cfg.blur > 0) gifFilter.push("blur(" + cfg.blur + "px)");
        if (cfg.brightness !== 100) gifFilter.push("brightness(" + (cfg.brightness / 100).toFixed(2) + ")");
        gifLayer.style.filter = gifFilter.length ? gifFilter.join(" ") : "none";
        return;
      }

      gifLayer.style.display = "none";
      canvas.style.display = "block";

      // 渐变预设：小画布（极速 + GPU 双线性平滑放大，零色彩断层，零实时模糊开销）
      if (cfg.mode === "preset") {
        var preset = getPreset(cfg.presetId);
        var pScale = fastPreview ? 0.22 : 0.42;
        var pw = Math.max(240, Math.min(720, Math.round(vw * pScale)));
        var ph = Math.max(150, Math.min(450, Math.round(vh * pScale)));
        if (canvas.width !== pw) canvas.width = pw;
        if (canvas.height !== ph) canvas.height = ph;
        var pctx = canvas.getContext("2d");
        if (!pctx) return;
        pctx.save();
        pctx.clearRect(0, 0, pw, ph);
        var pBright = (cfg.brightness / 100).toFixed(2);
        var pBlur = cfg.blur > 0 ? Math.max(0.5, cfg.blur * (pw / vw)).toFixed(2) : 0;
        pctx.filter =
          (pBlur ? "blur(" + pBlur + "px) " : "") +
          (cfg.brightness !== 100 ? "brightness(" + pBright + ")" : "");
        if (!pctx.filter.trim()) pctx.filter = "none";
        drawGradientPreset(pctx, pw, ph, preset, dark);
        pctx.restore();
        return;
      }

      // 静态图片：根据模糊度智能降采样烘焙（与 macOS CABackdropLayer 同源思路）
      if (cfg.mode === "image" && state.activeDataUrl) {
        var curUrl = state.activeDataUrl;
        void getDecodedImage(curUrl).then(function (img) {
          if (destroyed || !img || state.activeDataUrl !== curUrl) return;
          var scale;
          if (fastPreview) {
            scale = cfg.blur >= 3 ? 0.30 : 0.48;
          } else if (cfg.blur >= 8) {
            scale = 0.45;
          } else if (cfg.blur >= 2) {
            scale = 0.65;
          } else {
            scale = Math.min(1, 1920 / Math.max(vw, vh));
          }
          var cw = Math.max(280, Math.round(vw * scale));
          var ch = Math.max(180, Math.round(vh * scale));
          if (canvas.width !== cw) canvas.width = cw;
          if (canvas.height !== ch) canvas.height = ch;
          var ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.save();
          ctx.fillStyle = dark ? "#070708" : "#f4f6fb";
          ctx.fillRect(0, 0, cw, ch);

          var scaledBlur = cfg.blur > 0 ? cfg.blur * (cw / vw) : 0;
          var filterParts = [];
          if (scaledBlur > 0.1) filterParts.push("blur(" + scaledBlur.toFixed(2) + "px)");
          if (cfg.brightness !== 100) filterParts.push("brightness(" + (cfg.brightness / 100).toFixed(2) + ")");
          ctx.filter = filterParts.length ? filterParts.join(" ") : "none";

          // 有模糊时略微外扩边缘，避免高斯模糊把画布四边染黑
          var bleed = scaledBlur > 0 ? Math.ceil(scaledBlur * 2.2) : 0;
          var box = computeImageDrawBox(
            img.naturalWidth || img.width,
            img.naturalHeight || img.height,
            cw + bleed * 2,
            ch + bleed * 2,
            cfg.fit
          );
          ctx.drawImage(img, box.x - bleed, box.y - bleed, box.w, box.h);
          ctx.restore();
        });
      }
    }

    function scheduleCanvasBake(fastPreview) {
      if (fastPreview) canvasBakeFast = true;
      if (canvasBakeRaf === null) {
        canvasBakeRaf = window.requestAnimationFrame(function () {
          canvasBakeRaf = null;
          var isFast = canvasBakeFast;
          canvasBakeFast = false;
          bakeWallpaperCanvasNow(isFast);
        });
      }
      if (fastPreview) {
        if (canvasFinalTimer) clearTimeout(canvasFinalTimer);
        canvasFinalTimer = setTimeout(function () {
          canvasFinalTimer = null;
          bakeWallpaperCanvasNow(false);
        }, 120);
      }
    }

    // ── 极速靶向更新函数（拖动单个滑块时零全页重绘、纯 GPU opacity） ────────────────
    var plateResizeObserver = null;
    var observedPlateTargets = new WeakSet();

    function applyPlateBox(plate, el, copyRadius) {
      if (!plate) return;
      if (!el || !el.isConnected) {
        plate.style.display = "none";
        return;
      }
      var r = el.getBoundingClientRect();
      if (!(r.width > 1 && r.height > 1)) {
        plate.style.display = "none";
        return;
      }
      plate.style.display = "block";
      plate.style.transform = "translate3d(" + Math.round(r.left) + "px, " + Math.round(r.top) + "px, 0)";
      plate.style.width = Math.ceil(r.width) + "px";
      plate.style.height = Math.ceil(r.height) + "px";
      if (copyRadius) {
        try {
          var br = getComputedStyle(el).borderRadius;
          if (br) plate.style.borderRadius = br;
        } catch (_) {}
      }
    }

    function syncPanelPlatesGeometry() {
      var barEl = document.querySelector('[data-testid="title-menu-bar"]');
      var sideEl = document.querySelector('[role="navigation"].bg-sidebar');
      var mainEl = document.querySelector('[data-main-content-body]');
      applyPlateBox(document.getElementById("agy-wp-plate-bar"), barEl, false);
      applyPlateBox(document.getElementById("agy-wp-plate-sidebar"), sideEl, false);
      applyPlateBox(document.getElementById("agy-wp-plate-main"), mainEl, true);

      if (typeof ResizeObserver === "function") {
        if (!plateResizeObserver) {
          plateResizeObserver = new ResizeObserver(function () {
            if (!destroyed && isActiveWallpaper()) {
              applyPlateBox(document.getElementById("agy-wp-plate-bar"), document.querySelector('[data-testid="title-menu-bar"]'), false);
              applyPlateBox(document.getElementById("agy-wp-plate-sidebar"), document.querySelector('[role="navigation"].bg-sidebar'), false);
              applyPlateBox(document.getElementById("agy-wp-plate-main"), document.querySelector('[data-main-content-body]'), true);
            }
          });
        }
        [barEl, sideEl, mainEl].forEach(function (t) {
          if (t && !observedPlateTargets.has(t)) {
            observedPlateTargets.add(t);
            try { plateResizeObserver.observe(t); } catch (_) {}
          }
        });
      }
    }

    function updatePanelPlatesOpacityFast(panelAlphaVal) {
      var dark = isDarkMode();
      var p = clampNum(panelAlphaVal, 0, 85, 34) / 100;
      var mainAlpha = p.toFixed(3);
      var sidebarAlpha = Math.min(0.88, p + 0.16).toFixed(3);
      var barAlpha = Math.min(0.92, p + 0.22).toFixed(3);
      var mainColor = dark ? "#090b12" : "#f8faff";
      var barColor = dark ? "#0c0e16" : "#f5f8ff";

      var pBar = document.getElementById("agy-wp-plate-bar");
      var pSide = document.getElementById("agy-wp-plate-sidebar");
      var pMain = document.getElementById("agy-wp-plate-main");
      if (pBar) {
        if (pBar.style.backgroundColor !== barColor) pBar.style.backgroundColor = barColor;
        pBar.style.opacity = barAlpha;
      }
      if (pSide) {
        if (pSide.style.backgroundColor !== barColor) pSide.style.backgroundColor = barColor;
        pSide.style.opacity = sidebarAlpha;
      }
      if (pMain) {
        if (pMain.style.backgroundColor !== mainColor) pMain.style.backgroundColor = mainColor;
        pMain.style.opacity = mainAlpha;
      }
    }

    function updateScrimFast(scrimVal) {
      var scrimEl = document.getElementById("agy-wallpaper-scrim");
      if (!scrimEl) return;
      var dark = isDarkMode();
      var baseColor = dark ? "#090b12" : "#f8faff";
      if (scrimEl.style.backgroundColor !== baseColor) {
        scrimEl.style.backgroundColor = baseColor;
      }
      scrimEl.style.opacity = (clampNum(scrimVal, 0, 88, 38) / 100).toFixed(3);
    }

    function updatePanelAlphaVarsNow(panelAlphaVal) {
      updatePanelPlatesOpacityFast(panelAlphaVal);
      var rootEl = document.documentElement;
      var dark = isDarkMode();
      var p = clampNum(panelAlphaVal, 0, 85, 34) / 100;
      var sidebarAlpha = Math.min(0.88, p + 0.16);
      var sidePaneAlpha = Math.min(0.92, Math.max(0.74, p + 0.42)).toFixed(3);
      var composerAlpha = Math.min(0.92, Math.max(0.68, p + 0.34)).toFixed(3);
      var bubbleAlpha = Math.min(0.88, Math.max(0.56, p + 0.24)).toFixed(3);

      var barRgb = dark ? "12, 14, 22" : "245, 248, 255";
      var compRgb = dark ? "19, 22, 31" : "255, 255, 255";
      var bubRgb = dark ? "25, 30, 42" : "255, 255, 255";

      rootEl.style.setProperty("--agy-wp-sticky-bg", "rgba(" + barRgb + ", " + Math.min(0.88, sidebarAlpha + 0.1).toFixed(3) + ")");
      rootEl.style.setProperty("--agy-wp-side-bg", "rgba(" + barRgb + ", " + sidePaneAlpha + ")");
      rootEl.style.setProperty("--agy-wp-composer-bg", "rgba(" + compRgb + ", " + composerAlpha + ")");
      rootEl.style.setProperty("--agy-wp-bubble-bg", "rgba(" + bubRgb + ", " + bubbleAlpha + ")");
    }

    function schedulePanelAlphaUpdate(val) {
      // 拖动中只改 3 个 GPU 承托板的 opacity（零 <html> 变量重写，零全页重排！）
      updatePanelPlatesOpacityFast(val);
    }

    function readRootCssHex(varName, fallback) {
      try {
        var raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
        if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
          return "#" + raw[1] + raw[1] + raw[2] + raw[2] + raw[3] + raw[3];
        }
      } catch (_) {}
      return fallback;
    }

    function syncTitleBarColor() {
      try {
        var native = window.electronNative;
        if (!native || typeof native.setTitleBarOverlay !== "function") return;
        var dark = isDarkMode();
        if (!isActiveWallpaper()) {
          native.setTitleBarOverlay({
            color: readRootCssHex("--sidebar", dark ? "#111114" : "#FAFAFA"),
            symbolColor: readRootCssHex("--foreground", dark ? "#CCCCCC" : "#101010"),
            height: 30
          });
          return;
        }
        var cfg = state.config;
        var barColor = dark ? "#10131a" : "#f2f5fb";
        if (cfg.mode === "preset") {
          var p = getPreset(cfg.presetId);
          if (dark && p.barDark) barColor = p.barDark;
          else if (!dark && p.barLight) barColor = p.barLight;
        }
        native.setTitleBarOverlay({
          color: barColor,
          symbolColor: dark ? "#E5E7EB" : "#1F2937",
          height: 30
        });
      } catch (_) {}
    }

    var extractedAccentCache = new Map(); // dataUrl -> { rgb:[r,g,b], stops:[c1,c2,c3] }

    function hslToRgb(h, s, l) {
      var c = (1 - Math.abs(2 * l - 1)) * s;
      var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      var m = l - c / 2;
      var r = 0, g = 0, b = 0;
      if (h < 60) { r = c; g = x; }
      else if (h < 120) { r = x; g = c; }
      else if (h < 180) { g = c; b = x; }
      else if (h < 240) { g = x; b = c; }
      else if (h < 300) { r = x; b = c; }
      else { r = c; b = x; }
      return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
    }

    function rgbToHsl(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      var max = Math.max(r, g, b), min = Math.min(r, g, b);
      var h = 0, s = 0, l = (max + min) / 2;
      if (max !== min) {
        var d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        else if (max === g) h = ((b - r) / d + 2) * 60;
        else h = ((r - g) / d + 4) * 60;
      }
      return [h, s, l];
    }

    function extractAccentFromImage(img, dataUrl) {
      if (extractedAccentCache.has(dataUrl)) return extractedAccentCache.get(dataUrl);
      try {
        var c = document.createElement("canvas");
        c.width = 20;
        c.height = 20;
        var ctx = c.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0, 20, 20);
        var data = ctx.getImageData(0, 0, 20, 20).data;
        var bestScore = -1;
        var bestH = 217, bestS = 0.85;
        for (var i = 0; i < data.length; i += 4) {
          var hsl = rgbToHsl(data[i], data[i + 1], data[i + 2]);
          // 优先挑饱和度高、明度适中的生动主题色
          var score = hsl[1] * (1 - Math.abs(hsl[2] - 0.52) * 1.6);
          if (score > bestScore && hsl[1] > 0.18 && hsl[2] > 0.14 && hsl[2] < 0.88) {
            bestScore = score;
            bestH = hsl[0];
            bestS = Math.min(0.92, Math.max(0.62, hsl[1]));
          }
        }
        var c1 = hslToRgb(bestH, bestS, 0.64);
        var c2 = hslToRgb((bestH + 34) % 360, bestS, 0.68);
        var c3 = hslToRgb((bestH + 72) % 360, Math.min(0.88, bestS), 0.66);
        var toRgb = function (a) { return "rgb(" + a[0] + "," + a[1] + "," + a[2] + ")"; };
        var res = {
          rgbDark: c1,
          rgbLight: hslToRgb(bestH, Math.min(0.88, bestS), 0.48),
          stops: [toRgb(c1), toRgb(c2), toRgb(c3)]
        };
        extractedAccentCache.set(dataUrl, res);
        return res;
      } catch (_) {
        return null;
      }
    }

    function applyAccentTokens(rgb, stops, dark) {
      var rootEl = document.documentElement;
      var r = rgb[0], g = rgb[1], b = rgb[2];
      var s0 = stops[0], s1 = stops[1], s2 = stops[2];
      rootEl.style.setProperty("--agy-wp-accent", "rgb(" + r + ", " + g + ", " + b + ")");
      rootEl.style.setProperty("--agy-wp-accent-soft", "rgba(" + r + ", " + g + ", " + b + ", " + (dark ? "0.45" : "0.42") + ")");
      rootEl.style.setProperty("--agy-wp-accent-glow", "rgba(" + r + ", " + g + ", " + b + ", " + (dark ? "0.40" : "0.30") + ")");
      rootEl.style.setProperty("--agy-wp-accent-border", "rgba(" + r + ", " + g + ", " + b + ", " + (dark ? "0.28" : "0.24") + ")");
      rootEl.style.setProperty("--agy-wp-row-active", "rgba(" + r + ", " + g + ", " + b + ", " + (dark ? "0.22" : "0.15") + ")");
      rootEl.style.setProperty("--agy-wp-row-hover", dark ? "rgba(255, 255, 255, 0.08)" : "rgba(15, 23, 42, 0.06)");
      rootEl.style.setProperty("--agy-wp-quote-bg", "rgba(" + r + ", " + g + ", " + b + ", " + (dark ? "0.14" : "0.10") + ")");
      rootEl.style.setProperty("--agy-wp-scroll-grad-v", "linear-gradient(180deg, " + s0 + " 0%, " + s1 + " 50%, " + s2 + " 100%)");
      rootEl.style.setProperty("--agy-wp-scroll-grad-h", "linear-gradient(90deg, " + s0 + " 0%, " + s1 + " 50%, " + s2 + " 100%)");
    }

    function syncThemeAccent(dark) {
      var cfg = state.config;
      if (cfg.mode === "preset") {
        var p = getPreset(cfg.presetId);
        var rgb = (dark ? p.accentDark : p.accentLight) || [96, 165, 250];
        var stops = p.gradStops || ["#60a5fa", "#c084fc", "#f87171"];
        applyAccentTokens(rgb, stops, dark);
        return;
      }
      if (cfg.mode === "image" && state.activeDataUrl) {
        var cached = extractedAccentCache.get(state.activeDataUrl);
        if (cached) {
          applyAccentTokens(dark ? cached.rgbDark : cached.rgbLight, cached.stops, dark);
          return;
        }
        // 先给一组柔和默认极光色，图片解码完成后自动切换为壁纸专属提取主题色！
        applyAccentTokens(dark ? [96, 165, 250] : [59, 130, 246], ["#60a5fa", "#c084fc", "#38bdf8"], dark);
        var targetUrl = state.activeDataUrl;
        void getDecodedImage(targetUrl).then(function (img) {
          if (destroyed || !img || state.activeDataUrl !== targetUrl) return;
          var ext = extractAccentFromImage(img, targetUrl);
          if (ext) {
            applyAccentTokens(isDarkMode() ? ext.rgbDark : ext.rgbLight, ext.stops, isDarkMode());
          }
        });
        return;
      }
      applyAccentTokens(dark ? [96, 165, 250] : [59, 130, 246], ["#60a5fa", "#c084fc", "#f87171"], dark);
    }

    function applyVisualState() {
      ensureStyleAndBackdrop();
      var rootEl = document.documentElement;
      var dark = isDarkMode();
      lastIsDark = dark;

      if (dark) {
        rootEl.style.setProperty("--agy-wp-ui-fg", "#e5e7eb");
        rootEl.style.setProperty("--agy-wp-ui-btn-bg", "rgba(255, 255, 255, 0.08)");
        rootEl.style.setProperty("--agy-wp-ui-btn-hover", "rgba(255, 255, 255, 0.16)");
        rootEl.style.setProperty("--agy-wp-ui-border", "rgba(255, 255, 255, 0.14)");
        rootEl.style.setProperty("--agy-wp-panel-fg", "#f5f5f7");
        rootEl.style.setProperty("--agy-wp-panel-bg", "rgba(22, 24, 32, 0.96)");
        rootEl.style.setProperty("--agy-wp-panel-border", "rgba(255, 255, 255, 0.13)");
        rootEl.style.setProperty("--agy-wp-subtle-bg", "rgba(255, 255, 255, 0.06)");
        rootEl.style.setProperty("--agy-wp-subtle-hover", "rgba(255, 255, 255, 0.13)");
        rootEl.style.setProperty("--agy-wp-seg-active", "rgba(255, 255, 255, 0.15)");
        rootEl.style.setProperty("--agy-wp-track-bg", "rgba(255, 255, 255, 0.15)");
        rootEl.style.setProperty("--agy-wp-track-hover", "rgba(255, 255, 255, 0.22)");
        rootEl.style.setProperty("--agy-wp-specular", "rgba(255, 255, 255, 0.08)");
      } else {
        rootEl.style.setProperty("--agy-wp-ui-fg", "#1f2937");
        rootEl.style.setProperty("--agy-wp-ui-btn-bg", "rgba(255, 255, 255, 0.72)");
        rootEl.style.setProperty("--agy-wp-ui-btn-hover", "rgba(255, 255, 255, 0.95)");
        rootEl.style.setProperty("--agy-wp-ui-border", "rgba(0, 0, 0, 0.12)");
        rootEl.style.setProperty("--agy-wp-panel-fg", "#111827");
        rootEl.style.setProperty("--agy-wp-panel-bg", "rgba(252, 253, 255, 0.97)");
        rootEl.style.setProperty("--agy-wp-panel-border", "rgba(15, 23, 42, 0.12)");
        rootEl.style.setProperty("--agy-wp-subtle-bg", "rgba(15, 23, 42, 0.06)");
        rootEl.style.setProperty("--agy-wp-subtle-hover", "rgba(15, 23, 42, 0.11)");
        rootEl.style.setProperty("--agy-wp-seg-active", "#ffffff");
        rootEl.style.setProperty("--agy-wp-track-bg", "rgba(15, 23, 42, 0.12)");
        rootEl.style.setProperty("--agy-wp-track-hover", "rgba(15, 23, 42, 0.18)");
        rootEl.style.setProperty("--agy-wp-specular", "rgba(255, 255, 255, 0.7)");
      }

      if (!isActiveWallpaper()) {
        rootEl.removeAttribute("data-agy-wallpaper-active");
        rootEl.removeAttribute("data-agy-composer-glow");
        bakeWallpaperCanvasNow(false);
        syncTitleBarColor();
        updateButtonLabel();
        return;
      }

      rootEl.style.setProperty("--agy-wp-border", dark ? "rgba(255, 255, 255, 0.11)" : "rgba(15, 23, 42, 0.11)");
      syncThemeAccent(dark);

      updateScrimFast(state.config.scrim);
      syncPanelPlatesGeometry();
      updatePanelAlphaVarsNow(state.config.panelAlpha);
      rootEl.setAttribute("data-agy-wallpaper-active", "true");
      rootEl.setAttribute("data-agy-composer-glow", state.config.composerGlow || "google");
      bakeWallpaperCanvasNow(false);
      syncTitleBarColor();
      updateButtonLabel();
    }

    // ── 持久化（本地磁盘壁纸库优先 + 热注入阶段自动降级与无损迁移） ────────────────
    function persistConfigNow() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(state.config));
      } catch (_) {}

      var bridge = getBridge();
      if (bridge && typeof bridge.saveConfig === "function") {
        Promise.resolve(bridge.saveConfig(state.config)).catch(function () {});
        return;
      }
      if (window.nativeStorage && typeof window.nativeStorage.updateItems === "function") {
        var payload = {
          config: state.config,
          images: state.fallbackImages.slice(0, 4)
        };
        var obj = {};
        obj[FALLBACK_STORAGE_KEY] = payload;
        Promise.resolve(window.nativeStorage.updateItems(obj)).catch(function () {});
      }
    }

    function scheduleSaveConfig() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        saveTimer = null;
        persistConfigNow();
      }, 220);
    }

    function optimizeImageForFallback(file, dataUrl) {
      return new Promise(function (resolve) {
        try {
          if (file && file.type === "image/gif" && dataUrl.length < 2400000) {
            resolve(dataUrl);
            return;
          }
          if (dataUrl.length < 420000) {
            resolve(dataUrl);
            return;
          }
          var img = new Image();
          img.onload = function () {
            try {
              var maxDim = 1920;
              var w = img.naturalWidth || img.width || 1920;
              var h = img.naturalHeight || img.height || 1080;
              if (w > maxDim || h > maxDim) {
                var scale = maxDim / Math.max(w, h);
                w = Math.round(w * scale);
                h = Math.round(h * scale);
              }
              var canvas = document.createElement("canvas");
              canvas.width = w;
              canvas.height = h;
              var ctx = canvas.getContext("2d");
              if (!ctx) { resolve(dataUrl); return; }
              ctx.drawImage(img, 0, 0, w, h);
              var webp = canvas.toDataURL("image/webp", 0.86);
              resolve(webp && webp.length < dataUrl.length ? webp : dataUrl);
            } catch (_) { resolve(dataUrl); }
          };
          img.onerror = function () { resolve(dataUrl); };
          img.src = dataUrl;
        } catch (_) { resolve(dataUrl); }
      });
    }

    function makeThumbnail(key, dataUrl) {
      if (thumbCache.has(key)) return Promise.resolve(thumbCache.get(key));
      return new Promise(function (resolve) {
        if (!dataUrl || dataUrl.length < 180000) {
          thumbCache.set(key, dataUrl);
          resolve(dataUrl);
          return;
        }
        var img = new Image();
        img.onload = function () {
          try {
            var tw = 240;
            var th = Math.max(1, Math.round((img.naturalHeight / Math.max(1, img.naturalWidth)) * tw));
            var c = document.createElement("canvas");
            c.width = tw;
            c.height = th;
            var ctx = c.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, tw, th);
              var tUrl = c.toDataURL("image/jpeg", 0.78);
              thumbCache.set(key, tUrl);
              resolve(tUrl);
              return;
            }
          } catch (_) {}
          thumbCache.set(key, dataUrl);
          resolve(dataUrl);
        };
        img.onerror = function () { resolve(dataUrl); };
        img.src = dataUrl;
      });
    }

    async function loadImageByFile(fileName) {
      if (!fileName) return "";
      if (imageDataCache.has(fileName)) return imageDataCache.get(fileName);
      var bridge = getBridge();
      if (bridge && typeof bridge.readImage === "function") {
        var res = await bridge.readImage(fileName);
        if (res && res.ok && res.dataUrl) {
          imageDataCache.set(fileName, res.dataUrl);
          return res.dataUrl;
        }
      }
      var fb = state.fallbackImages.find(function (x) { return x.file === fileName; });
      if (fb && fb.dataUrl) {
        imageDataCache.set(fileName, fb.dataUrl);
        return fb.dataUrl;
      }
      return "";
    }

    async function selectImageFile(fileName, displayName) {
      var dataUrl = await loadImageByFile(fileName);
      if (!dataUrl) return;
      state.activeDataUrl = dataUrl;
      state.config.mode = "image";
      state.config.imageFile = fileName;
      state.config.imageName = displayName || fileName.replace(/\.[^.]+$/, "");
      applyVisualState();
      persistConfigNow();
      renderPanelBody();
    }

    async function importBrowserFiles(fileList) {
      if (!fileList || !fileList.length) return;
      var bridge = getBridge();
      var firstAdded = null;
      for (var i = 0; i < fileList.length; i += 1) {
        var f = fileList[i];
        if (!f || !/^image\//i.test(f.type || "")) continue;
        var rawUrl = await new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(typeof reader.result === "string" ? reader.result : ""); };
          reader.onerror = function () { resolve(""); };
          reader.readAsDataURL(f);
        });
        if (!rawUrl) continue;

        if (bridge && typeof bridge.importData === "function") {
          var res = await bridge.importData({ name: f.name, dataUrl: rawUrl });
          if (res && res.ok && res.file) {
            imageDataCache.set(res.file, res.dataUrl || rawUrl);
            state.images = res.images || state.images;
            if (!firstAdded) firstAdded = { file: res.file, name: f.name.replace(/\.[^.]+$/, ""), dataUrl: res.dataUrl || rawUrl };
          }
        } else {
          var optUrl = await optimizeImageForFallback(f, rawUrl);
          var id = "local_" + Date.now() + "_" + i + ".webp";
          var baseName = (f.name || "我的壁纸").replace(/\.[^.]+$/, "");
          var entry = { file: id, name: baseName, dataUrl: optUrl, mtime: Date.now() };
          state.fallbackImages = [entry].concat(state.fallbackImages.filter(function (x) { return x.name !== baseName; })).slice(0, 4);
          state.images = state.fallbackImages.slice();
          imageDataCache.set(id, optUrl);
          if (!firstAdded) firstAdded = entry;
        }
      }
      if (firstAdded) {
        state.activeDataUrl = firstAdded.dataUrl;
        state.config.mode = "image";
        state.config.imageFile = firstAdded.file;
        state.config.imageName = firstAdded.name;
        applyVisualState();
        persistConfigNow();
        renderPanelBody();
      }
    }

    async function triggerPickImage() {
      var bridge = getBridge();
      if (bridge && typeof bridge.pickImage === "function") {
        var res = await bridge.pickImage();
        if (res && res.ok) {
          state.images = res.images || state.images;
          if (!res.canceled && res.firstFile && res.firstDataUrl) {
            imageDataCache.set(res.firstFile, res.firstDataUrl);
            state.activeDataUrl = res.firstDataUrl;
            state.config.mode = "image";
            state.config.imageFile = res.firstFile;
            state.config.imageName = res.firstFile.replace(/\.[^.]+$/, "");
            applyVisualState();
            persistConfigNow();
          }
          renderPanelBody();
        }
        return;
      }
      var input = document.getElementById("agy-wallpaper-file-input");
      if (!input) {
        input = document.createElement("input");
        input.id = "agy-wallpaper-file-input";
        input.type = "file";
        input.accept = "image/png,image/jpeg,image/webp,image/gif,image/bmp,image/avif";
        input.multiple = true;
        input.style.display = "none";
        input.setAttribute("data-ag-localization-skip", "true");
        input.addEventListener("change", function () {
          if (input.files && input.files.length) void importBrowserFiles(input.files);
          input.value = "";
        });
        document.body.appendChild(input);
      }
      input.click();
    }

    async function deleteImageFile(fileName) {
      var bridge = getBridge();
      imageDataCache.delete(fileName);
      thumbCache.delete(fileName);
      if (bridge && typeof bridge.deleteImage === "function") {
        var res = await bridge.deleteImage(fileName);
        if (res && res.ok) state.images = res.images || [];
      } else {
        state.fallbackImages = state.fallbackImages.filter(function (x) { return x.file !== fileName; });
        state.images = state.fallbackImages.slice();
      }
      if (state.config.mode === "image" && state.config.imageFile === fileName) {
        state.config.mode = "stock";
        state.config.imageFile = "";
        state.config.imageName = "";
        state.activeDataUrl = "";
        applyVisualState();
      }
      persistConfigNow();
      renderPanelBody();
    }

    async function refreshFromStorage() {
      var bridge = getBridge();
      if (bridge) {
        try {
          var st = await bridge.getState();
          if (st && st.ok) {
            state.wallpaperDir = st.dir || "";
            state.images = Array.isArray(st.images) ? st.images : [];
            if (st.config) state.config = normalizeConfig(st.config);
            if (st.activeDataUrl && state.config.imageFile) {
              state.activeDataUrl = st.activeDataUrl;
              imageDataCache.set(state.config.imageFile, st.activeDataUrl);
            }
          }
          if (window.nativeStorage && typeof window.nativeStorage.getItems === "function") {
            var items = await window.nativeStorage.getItems();
            var fb = items && items[FALLBACK_STORAGE_KEY];
            if (fb && fb.config) {
              var migratedFile = "";
              if (Array.isArray(fb.images) && fb.images.length) {
                for (var i = 0; i < fb.images.length; i += 1) {
                  var imgItem = fb.images[i];
                  if (imgItem && imgItem.dataUrl) {
                    var imp = await bridge.importData({ name: imgItem.name || "wallpaper", dataUrl: imgItem.dataUrl });
                    if (imp && imp.ok && imp.file) {
                      state.images = imp.images || state.images;
                      imageDataCache.set(imp.file, imp.dataUrl || imgItem.dataUrl);
                      if (fb.config.imageFile === imgItem.file) {
                        migratedFile = imp.file;
                        state.activeDataUrl = imp.dataUrl || imgItem.dataUrl;
                      }
                    }
                  }
                }
              }
              if (!st || !st.config) {
                state.config = normalizeConfig(fb.config);
                if (migratedFile) state.config.imageFile = migratedFile;
                await bridge.saveConfig(state.config);
              }
              var clearObj = {};
              clearObj[FALLBACK_STORAGE_KEY] = null;
              if (typeof window.nativeStorage.updateItems === "function") {
                await window.nativeStorage.updateItems(clearObj);
              }
            }
          }
        } catch (_) {}
      } else {
        try {
          if (window.nativeStorage && typeof window.nativeStorage.getItems === "function") {
            var items2 = await window.nativeStorage.getItems();
            var fb2 = items2 && items2[FALLBACK_STORAGE_KEY];
            if (fb2 && typeof fb2 === "object") {
              if (fb2.config) state.config = normalizeConfig(fb2.config);
              if (Array.isArray(fb2.images)) {
                state.fallbackImages = fb2.images.filter(function (x) { return x && x.file && x.dataUrl; });
                state.images = state.fallbackImages.slice();
                state.fallbackImages.forEach(function (x) { imageDataCache.set(x.file, x.dataUrl); });
              }
              if (state.config.mode === "image" && state.config.imageFile) {
                state.activeDataUrl = imageDataCache.get(state.config.imageFile) || "";
              }
            }
          }
        } catch (_) {}
      }
      applyVisualState();
      if (state.panelOpen) renderPanelBody();
    }

    // ── Apple 风格定制物理滑块组件（GPU transform 驱动，120fps 零卡顿） ────────────
    function createAppleSlider(label, key, min, max, unit, onLiveChange, onCommit) {
      var THUMB_W = 18;
      var wrap = document.createElement("div");
      wrap.className = "agy-aslider-wrap";

      var head = document.createElement("div");
      head.className = "agy-aslider-head";
      var labelSpan = document.createElement("span");
      labelSpan.className = "agy-aslider-label";
      labelSpan.textContent = label;
      var valSpan = document.createElement("span");
      valSpan.className = "agy-aslider-val";
      valSpan.textContent = Math.round(state.config[key]) + unit;
      head.appendChild(labelSpan);
      head.appendChild(valSpan);

      var slider = document.createElement("div");
      slider.className = "agy-aslider";
      slider.setAttribute("role", "slider");
      slider.setAttribute("aria-label", label);
      slider.setAttribute("aria-valuemin", String(min));
      slider.setAttribute("aria-valuemax", String(max));

      var track = document.createElement("div");
      track.className = "agy-aslider-track";
      var fill = document.createElement("div");
      fill.className = "agy-aslider-fill";
      track.appendChild(fill);

      var thumb = document.createElement("div");
      thumb.className = "agy-aslider-thumb";

      slider.appendChild(track);
      slider.appendChild(thumb);
      wrap.appendChild(head);
      wrap.appendChild(slider);

      var dragging = false;
      var cachedRect = null;
      var glideTimer = null;
      var moveRaf = null;
      var pendingX = null;
      var currentPct = Math.max(0, Math.min(1, (state.config[key] - min) / Math.max(1, max - min)));

      function renderVisual(pct, isDraggingNow) {
        var p = Math.max(0, Math.min(1, pct));
        currentPct = p;
        var trackW = (cachedRect && cachedRect.width > 0) ? cachedRect.width : (slider.offsetWidth || 318);
        var usable = Math.max(1, trackW - THUMB_W);
        var thumbX = p * usable;
        var fillScale = Math.max(0, Math.min(1, (thumbX + THUMB_W * 0.5) / Math.max(1, trackW)));
        fill.style.transform = "scaleX(" + fillScale.toFixed(4) + ")";
        thumb.style.transform =
          "translate3d(" + thumbX.toFixed(2) + "px, -50%, 0) scale(" + (isDraggingNow ? "1.14" : "1") + ")";
      }

      function applyFromClientX(clientX, isClickGlide) {
        var rect = cachedRect || slider.getBoundingClientRect();
        if (!rect || !(rect.width > 0)) return;
        cachedRect = rect;
        var usable = Math.max(1, rect.width - THUMB_W);
        var p = Math.max(0, Math.min(1, (clientX - rect.left - THUMB_W * 0.5) / usable));
        var nextVal = Math.round(min + p * (max - min));

        if (isClickGlide) {
          slider.classList.add("is-gliding");
          if (glideTimer) clearTimeout(glideTimer);
          glideTimer = setTimeout(function () {
            glideTimer = null;
            slider.classList.remove("is-gliding");
          }, 180);
        } else {
          slider.classList.remove("is-gliding");
        }

        renderVisual(p, dragging);
        valSpan.textContent = nextVal + unit;
        slider.setAttribute("aria-valuenow", String(nextVal));

        if (state.config[key] !== nextVal) {
          state.config[key] = nextVal;
          onLiveChange(nextVal, true);
        }
      }

      slider.addEventListener("pointerdown", function (ev) {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        cachedRect = slider.getBoundingClientRect();
        var startPct = currentPct;
        dragging = true;
        wrap.classList.add("is-dragging");
        try { slider.setPointerCapture(ev.pointerId); } catch (_) {}
        var usable = Math.max(1, cachedRect.width - THUMB_W);
        var hitPct = Math.max(0, Math.min(1, (ev.clientX - cachedRect.left - THUMB_W * 0.5) / usable));
        // 若用户点在远离当前圆钮的位置，给一个 Apple 顺滑滑行动画
        var isJump = Math.abs(hitPct - startPct) > 0.08;
        applyFromClientX(ev.clientX, isJump);
      });

      slider.addEventListener("pointermove", function (ev) {
        if (!dragging) return;
        ev.stopPropagation();
        pendingX = ev.clientX;
        if (moveRaf === null) {
          moveRaf = window.requestAnimationFrame(function () {
            moveRaf = null;
            if (!dragging || pendingX === null) return;
            var x = pendingX;
            pendingX = null;
            applyFromClientX(x, false);
          });
        }
      });

      function finishDrag(ev) {
        if (!dragging) return;
        dragging = false;
        if (moveRaf !== null) {
          window.cancelAnimationFrame(moveRaf);
          moveRaf = null;
        }
        if (pendingX !== null) {
          applyFromClientX(pendingX, false);
          pendingX = null;
        }
        wrap.classList.remove("is-dragging");
        try {
          if (ev && ev.pointerId !== undefined) slider.releasePointerCapture(ev.pointerId);
        } catch (_) {}
        // 松手时轻快弹回正常比例
        slider.classList.add("is-gliding");
        renderVisual(currentPct, false);
        setTimeout(function () { slider.classList.remove("is-gliding"); }, 180);
        cachedRect = null;
        onCommit(state.config[key]);
      }

      slider.addEventListener("pointerup", finishDrag);
      slider.addEventListener("pointercancel", finishDrag);
      slider.addEventListener("lostpointercapture", finishDrag);

      // 首次挂载后按真实宽度渲染初始位置
      window.requestAnimationFrame(function () {
        if (!destroyed) renderVisual(currentPct, false);
      });

      return wrap;
    }

    // ── UI 构建：顶栏入口按钮 + 工坊浮窗 ────────────────────────────────────────
    var PALETTE_SVG =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="18" height="18" rx="3"/>' +
      '<circle cx="8.5" cy="8.5" r="1.5"/>' +
      '<path d="M21 15l-5-5L5 21"/>' +
      "</svg>";

    function updateButtonLabel() {
      var lbl = document.getElementById("agy-wallpaper-btn-label");
      if (lbl) lbl.textContent = activeDisplayName();
    }

    function positionPanel() {
      var panel = document.getElementById(PANEL_ID);
      var btn = document.getElementById("agy-wallpaper-btn");
      if (!panel) return;
      if (btn) {
        var r = btn.getBoundingClientRect();
        var top = Math.min(window.innerHeight - 100, r.bottom + 8);
        var left = Math.max(12, Math.min(window.innerWidth - 360, r.right - 348));
        panel.style.top = top + "px";
        panel.style.left = left + "px";
      } else {
        panel.style.top = "48px";
        panel.style.right = "16px";
      }
    }

    function setPanelOpen(open) {
      state.panelOpen = Boolean(open);
      var panel = ensurePanel();
      if (!panel) return;
      if (state.panelOpen) {
        positionPanel();
        panel.classList.add("is-open");
        renderPanelBody();
        if (getBridge()) void refreshFromStorage();
      } else {
        panel.classList.remove("is-open");
      }
    }

    function renderPanelBody() {
      var panel = document.getElementById(PANEL_ID);
      if (!panel) return;
      var body = panel.querySelector(".agy-wp-body");
      var tabCustom = panel.querySelector('[data-wp-tab="custom"]');
      var tabPresets = panel.querySelector('[data-wp-tab="presets"]');
      var stockToggle = panel.querySelector("#agy-wp-stock-btn");
      if (!body) return;

      if (tabCustom) tabCustom.classList.toggle("is-active", state.tab === "custom");
      if (tabPresets) tabPresets.classList.toggle("is-active", state.tab === "presets");
      if (stockToggle) {
        stockToggle.textContent = isActiveWallpaper() ? "恢复原版" : "当前原版";
      }

      body.innerHTML = "";

      if (state.tab === "custom") {
        var dz = document.createElement("div");
        dz.className = "agy-wp-dropzone";
        dz.innerHTML =
          '<div class="agy-wp-drop-title">+ 选择本地图片 / 拖拽图片到这里</div>' +
          '<div class="agy-wp-drop-sub">支持 JPG / PNG / WebP / GIF / AVIF，免重启即时生效</div>';
        dz.addEventListener("click", function () { void triggerPickImage(); });
        dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("is-dragover"); });
        dz.addEventListener("dragleave", function () { dz.classList.remove("is-dragover"); });
        dz.addEventListener("drop", function (e) {
          e.preventDefault();
          dz.classList.remove("is-dragover");
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            void importBrowserFiles(e.dataTransfer.files);
          }
        });
        body.appendChild(dz);

        var bridge = getBridge();
        if (bridge) {
          var row = document.createElement("div");
          row.className = "agy-wp-toolbar-row";
          var openBtn = document.createElement("button");
          openBtn.type = "button";
          openBtn.className = "agy-wp-pill-btn";
          openBtn.textContent = "打开壁纸文件夹";
          openBtn.addEventListener("click", function () { void bridge.openFolder(); });
          var refBtn = document.createElement("button");
          refBtn.type = "button";
          refBtn.className = "agy-wp-pill-btn";
          refBtn.textContent = "刷新目录图片";
          refBtn.addEventListener("click", function () { void refreshFromStorage(); });
          row.appendChild(openBtn);
          row.appendChild(refBtn);
          body.appendChild(row);
        }

        if (!state.images.length) {
          var empty = document.createElement("div");
          empty.className = "agy-wp-empty";
          empty.textContent = "还没有导入图片，点上方按钮挑一张你的专属壁纸吧～";
          body.appendChild(empty);
        } else {
          var grid = document.createElement("div");
          grid.className = "agy-wp-grid";
          state.images.forEach(function (imgInfo) {
            var card = document.createElement("div");
            card.className = "agy-wp-card";
            if (state.config.mode === "image" && state.config.imageFile === imgInfo.file) {
              card.classList.add("is-selected");
            }
            var bg = document.createElement("div");
            bg.className = "agy-wp-card-bg";
            card.appendChild(bg);

            var lbl = document.createElement("div");
            lbl.className = "agy-wp-card-label";
            lbl.textContent = imgInfo.name || imgInfo.file;
            card.appendChild(lbl);

            var del = document.createElement("button");
            del.type = "button";
            del.className = "agy-wp-card-del";
            del.title = "删除壁纸";
            del.textContent = "×";
            del.addEventListener("click", function (ev) {
              ev.stopPropagation();
              void deleteImageFile(imgInfo.file);
            });
            card.appendChild(del);

            card.addEventListener("click", function () {
              void selectImageFile(imgInfo.file, imgInfo.name);
            });

            void loadImageByFile(imgInfo.file).then(function (dUrl) {
              if (!dUrl) return;
              return makeThumbnail(imgInfo.file, dUrl).then(function (tUrl) {
                bg.style.backgroundImage = 'url("' + tUrl.replace(/"/g, '\\"') + '")';
              });
            });
            grid.appendChild(card);
          });
          body.appendChild(grid);
        }
      } else {
        var pGrid = document.createElement("div");
        pGrid.className = "agy-wp-grid";
        var darkNow = isDarkMode();
        PRESETS.forEach(function (p) {
          var card = document.createElement("div");
          card.className = "agy-wp-card";
          var isSel =
            (p.id === "stock" && state.config.mode === "stock") ||
            (p.id !== "stock" && state.config.mode === "preset" && state.config.presetId === p.id);
          if (isSel) card.classList.add("is-selected");

          var bg = document.createElement("div");
          bg.className = "agy-wp-card-bg";
          bg.style.background = (!darkNow && p.swatchLight) ? p.swatchLight : p.swatch;
          card.appendChild(bg);

          var lbl = document.createElement("div");
          lbl.className = "agy-wp-card-label";
          lbl.textContent = darkNow && p.nameDark ? p.nameDark : p.name;
          card.appendChild(lbl);

          card.addEventListener("click", function () {
            if (p.id === "stock") {
              state.config.mode = "stock";
            } else {
              state.config.mode = "preset";
              state.config.presetId = p.id;
            }
            applyVisualState();
            persistConfigNow();
            renderPanelBody();
          });
          pGrid.appendChild(card);
        });
        body.appendChild(pGrid);
      }

      // 4 条 Apple 风格极速滑块：每条只走专属靶向通道，0 卡顿！
      var controls = document.createElement("div");
      controls.className = "agy-wp-controls";
      controls.appendChild(
        createAppleSlider(
          "护眼遮罩浓度（文字清晰度）",
          "scrim",
          0,
          88,
          "%",
          function (v) { updateScrimFast(v); },
          function () { scheduleSaveConfig(); }
        )
      );
      controls.appendChild(
        createAppleSlider(
          "背景模糊（预烘焙零卡顿）",
          "blur",
          0,
          24,
          "px",
          function () { scheduleCanvasBake(true); },
          function () { scheduleCanvasBake(false); scheduleSaveConfig(); }
        )
      );
      controls.appendChild(
        createAppleSlider(
          "面板底漆浓度（通透调节）",
          "panelAlpha",
          0,
          85,
          "%",
          function (v) { schedulePanelAlphaUpdate(v); },
          function () { updatePanelAlphaVarsNow(state.config.panelAlpha); scheduleSaveConfig(); }
        )
      );
      controls.appendChild(
        createAppleSlider(
          "壁纸亮度",
          "brightness",
          40,
          130,
          "%",
          function () { scheduleCanvasBake(true); },
          function () { scheduleCanvasBake(false); scheduleSaveConfig(); }
        )
      );

      var fitRow = document.createElement("div");
      fitRow.className = "agy-wp-fit-row";
      [
        ["cover-center", "铺满居中"],
        ["cover-top", "顶部对齐"],
        ["cover-bottom", "底部对齐"],
        ["contain", "完整显示"]
      ].forEach(function (pair) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "agy-wp-fit-btn" + (state.config.fit === pair[0] ? " is-active" : "");
        b.textContent = pair[1];
        b.addEventListener("click", function () {
          state.config.fit = pair[0];
          scheduleCanvasBake(false);
          persistConfigNow();
          renderPanelBody();
        });
        fitRow.appendChild(b);
      });
      controls.appendChild(fitRow);

      var glowHead = document.createElement("div");
      glowHead.className = "agy-aslider-head";
      glowHead.innerHTML = '<span class="agy-aslider-label">输入框外圈流光</span>';
      controls.appendChild(glowHead);

      var glowRow = document.createElement("div");
      glowRow.className = "agy-wp-glow-row";
      [
        ["google", "谷歌四色", "conic-gradient(#4285f4, #34a853, #fbbc05, #ea4335, #4285f4)"],
        ["gemini", "Gemini 极光", "conic-gradient(#4285f4, #38bdf8, #9b72cb, #d96570, #4285f4)"],
        ["off", "主题默认", ""]
      ].forEach(function (item) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "agy-wp-fit-btn" + (state.config.composerGlow === item[0] ? " is-active" : "");
        if (item[2]) {
          b.innerHTML = '<span class="agy-wp-glow-dot" style="background:' + item[2] + '"></span>' + item[1];
        } else {
          b.textContent = item[1];
        }
        b.addEventListener("click", function () {
          state.config.composerGlow = item[0];
          applyVisualState();
          persistConfigNow();
          renderPanelBody();
        });
        glowRow.appendChild(b);
      });
      controls.appendChild(glowRow);

      var foot = document.createElement("div");
      foot.className = "agy-wp-status";
      var modeHint = document.createElement("span");
      modeHint.textContent = getBridge()
        ? "本地原图壁纸库 · 120fps 引擎"
        : "即时预览 · 重启接入本地图库";
      var resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "agy-wp-pill-btn";
      resetBtn.textContent = "重置参数";
      resetBtn.addEventListener("click", function () {
        state.config.scrim = DEFAULT_CONFIG.scrim;
        state.config.blur = DEFAULT_CONFIG.blur;
        state.config.panelAlpha = DEFAULT_CONFIG.panelAlpha;
        state.config.brightness = DEFAULT_CONFIG.brightness;
        state.config.fit = DEFAULT_CONFIG.fit;
        state.config.composerGlow = DEFAULT_CONFIG.composerGlow;
        applyVisualState();
        persistConfigNow();
        renderPanelBody();
      });
      foot.appendChild(modeHint);
      foot.appendChild(resetBtn);
      controls.appendChild(foot);

      body.appendChild(controls);
    }

    function ensurePanel() {
      var panel = document.getElementById(PANEL_ID);
      if (panel) return panel;
      if (!document.body) return null;

      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.setAttribute("data-ag-localization-skip", "true");
      panel.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      panel.addEventListener("click", function (e) { e.stopPropagation(); });

      var header = document.createElement("div");
      header.className = "agy-wp-header";
      header.innerHTML =
        '<div class="agy-wp-title">' + PALETTE_SVG + "<span>壁纸与主题工坊</span></div>" +
        '<div class="agy-wp-header-actions">' +
        '  <button type="button" id="agy-wp-stock-btn" class="agy-wp-pill-btn">恢复原版</button>' +
        '  <button type="button" id="agy-wp-close-btn" class="agy-wp-close" title="关闭">×</button>' +
        "</div>";
      panel.appendChild(header);

      var tabs = document.createElement("div");
      tabs.className = "agy-wp-tabs";
      tabs.innerHTML =
        '<button type="button" class="agy-wp-tab is-active" data-wp-tab="custom">我的壁纸</button>' +
        '<button type="button" class="agy-wp-tab" data-wp-tab="presets">渐变预设</button>';
      panel.appendChild(tabs);

      var body = document.createElement("div");
      body.className = "agy-wp-body";
      panel.appendChild(body);

      panel.querySelector("#agy-wp-close-btn").addEventListener("click", function () {
        setPanelOpen(false);
      });
      panel.querySelector("#agy-wp-stock-btn").addEventListener("click", function () {
        state.config.mode = "stock";
        applyVisualState();
        persistConfigNow();
        renderPanelBody();
      });
      tabs.querySelectorAll(".agy-wp-tab").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.tab = btn.getAttribute("data-wp-tab") || "custom";
          renderPanelBody();
        });
      });

      document.body.appendChild(panel);
      return panel;
    }

    function mountTopbarButton() {
      var toolbar = document.querySelector('[data-testid="pane-titlebar-toolbar"]');
      if (!toolbar) return;
      var existing = document.getElementById(BTN_WRAP_ID);
      if (existing) {
        if (toolbar.contains(existing)) return;
        existing.remove();
      }

      var wrap = document.createElement("div");
      wrap.id = BTN_WRAP_ID;
      wrap.setAttribute("data-ag-localization-skip", "true");

      var btn = document.createElement("button");
      btn.id = "agy-wallpaper-btn";
      btn.type = "button";
      btn.title = "自定义 UI 壁纸与主题";
      btn.setAttribute("data-ag-localization-skip", "true");
      btn.innerHTML =
        '<span style="display:inline-flex;align-items:center;opacity:0.9;">' + PALETTE_SVG + "</span>" +
        '<span id="agy-wallpaper-btn-label">' + activeDisplayName() + "</span>" +
        '<span style="font-size:9px;opacity:0.6;">▾</span>';

      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        setPanelOpen(!state.panelOpen);
      });

      wrap.appendChild(btn);
      toolbar.insertBefore(wrap, toolbar.firstChild);
    }

    function onDocClick(e) {
      if (!state.panelOpen) return;
      var panel = document.getElementById(PANEL_ID);
      var wrap = document.getElementById(BTN_WRAP_ID);
      if (panel && panel.contains(e.target)) return;
      if (wrap && wrap.contains(e.target)) return;
      setPanelOpen(false);
    }

    function onDocKeyDown(e) {
      if (e && e.key === "Escape" && state.panelOpen) {
        setPanelOpen(false);
      }
    }

    function onWinResize() {
      if (state.panelOpen) positionPanel();
      if (isActiveWallpaper()) {
        syncPanelPlatesGeometry();
        if (resizeBakeTimer) clearTimeout(resizeBakeTimer);
        resizeBakeTimer = setTimeout(function () {
          resizeBakeTimer = null;
          syncPanelPlatesGeometry();
          bakeWallpaperCanvasNow(false);
        }, 140);
      }
    }

    function boot() {
      if (destroyed) return;
      ensureStyleAndBackdrop();
      ensurePanel();
      mountTopbarButton();

      if (typeof MutationObserver === "function") {
        themeClassObserver = new MutationObserver(function () {
          var nowDark = isDarkMode();
          if (nowDark !== lastIsDark) {
            applyVisualState();
            if (state.panelOpen) renderPanelBody();
          }
        });
        if (document.documentElement) {
          themeClassObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        }
        if (document.body) {
          themeClassObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
        }
      }

      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onDocKeyDown);
      window.addEventListener("resize", onWinResize);

      watchdogTimer = setInterval(function () {
        if (destroyed) return;
        if (!document.getElementById(STYLE_ID) || !document.getElementById(BACKDROP_ID)) {
          ensureStyleAndBackdrop();
          applyVisualState();
        }
        if (!document.getElementById(BTN_WRAP_ID)) {
          mountTopbarButton();
        }
        if (isActiveWallpaper()) {
          syncPanelPlatesGeometry();
        }
      }, 900);

      void refreshFromStorage();
    }

    var instance = {
      stop: function () {
        destroyed = true;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
        if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null; }
        if (canvasFinalTimer) { clearTimeout(canvasFinalTimer); canvasFinalTimer = null; }
        if (resizeBakeTimer) { clearTimeout(resizeBakeTimer); resizeBakeTimer = null; }
        if (canvasBakeRaf !== null) { window.cancelAnimationFrame(canvasBakeRaf); canvasBakeRaf = null; }
        if (panelAlphaRaf !== null) { window.cancelAnimationFrame(panelAlphaRaf); panelAlphaRaf = null; }
        if (themeClassObserver) { themeClassObserver.disconnect(); themeClassObserver = null; }
        if (plateResizeObserver) { plateResizeObserver.disconnect(); plateResizeObserver = null; }
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onDocKeyDown);
        window.removeEventListener("resize", onWinResize);
        [BTN_WRAP_ID, PANEL_ID, BACKDROP_ID, STYLE_ID, "agy-wallpaper-file-input"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        document.documentElement.removeAttribute("data-agy-wallpaper-active");
        document.documentElement.removeAttribute("data-agy-composer-glow");
        if (window.__agyWallpaperInstance === instance) {
          delete window.__agyWallpaperInstance;
        }
      },
      openPanel: function () { setPanelOpen(true); },
      closePanel: function () { setPanelOpen(false); },
      refresh: function () { return refreshFromStorage(); },
      getState: function () {
        return {
          config: Object.assign({}, state.config),
          imageCount: state.images.length,
          hasBridge: Boolean(getBridge()),
          active: isActiveWallpaper()
        };
      }
    };

    window.__agyWallpaperInstance = instance;

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  } catch (err) {
    try { console.error("[AgyWallpaper] init error:", err); } catch (_) {}
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
