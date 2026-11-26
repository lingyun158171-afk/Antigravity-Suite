"use strict";

/**
 * Surgically inject into an existing (already localized) app.asar:
 *   1. antigravity-codex-effort-slider -> dist/preload.js
 *   2. agy-wallpaper-studio (IPC vault + preload bridge + renderer UI) -> dist/main.js & dist/preload.js
 *   3. languageServer.js csrfToken patch for antigravity-pulse quota discovery
 * WITHOUT overwriting localization changes from app.asar.bak.
 */
const fs = require("node:fs");
const path = require("node:path");

const SUITE_DIR = __dirname;
const SLIDER_DIR = path.join(SUITE_DIR, "mods", "effort-slider");
const CLIENT_JS = path.join(SLIDER_DIR, "lib", "client.js");
const PATCH_ASAR = path.join(SLIDER_DIR, "tools", "patch-asar.cjs");
const WALLPAPER_DIR = path.join(SUITE_DIR, "mods", "wallpaper");
const WALLPAPER_JS = path.join(WALLPAPER_DIR, "wallpaper.js");
const WALLPAPER_MAIN_IPC = path.join(WALLPAPER_DIR, "main-ipc.js");

const WP_PRELOAD_START = "/* __AGY_WALLPAPER_PRELOAD_START__ */";
const WP_PRELOAD_END = "/* __AGY_WALLPAPER_PRELOAD_END__ */";
const WP_IPC_START = "/* __AGY_WALLPAPER_IPC_START__ */";
const WP_IPC_END = "/* __AGY_WALLPAPER_IPC_END__ */";

const {
  parseAsarArchive,
  buildPatchedPreloadSource,
  stripExistingPreloadPatch,
  repackAsarTree,
  buildAsarArchive
} = require(PATCH_ASAR);

function stripMarkedBlock(source, startMarker, endMarker) {
  const sIdx = source.indexOf(startMarker);
  const eIdx = source.indexOf(endMarker);
  if (sIdx >= 0 && eIdx > sIdx) {
    return (source.slice(0, sIdx).trimEnd() + "\n" + source.slice(eIdx + endMarker.length).trimStart()).trimEnd() + "\n";
  }
  return source;
}

function buildWallpaperPreloadSnippet(wallpaperCode) {
  const inlinedWallpaper = JSON.stringify(wallpaperCode);
  return [
    "",
    WP_PRELOAD_START,
    "try {",
    "  if (electron_1 && electron_1.contextBridge && electron_1.ipcRenderer) {",
    "    try {",
    "      electron_1.contextBridge.exposeInMainWorld('__agyWallpaperBridge', {",
    "        getState: () => electron_1.ipcRenderer.invoke('agy-wallpaper:get-state'),",
    "        saveConfig: (cfg) => electron_1.ipcRenderer.invoke('agy-wallpaper:save-config', cfg),",
    "        readImage: (file) => electron_1.ipcRenderer.invoke('agy-wallpaper:read-image', file),",
    "        pickImage: () => electron_1.ipcRenderer.invoke('agy-wallpaper:pick-image'),",
    "        importData: (payload) => electron_1.ipcRenderer.invoke('agy-wallpaper:import-data', payload),",
    "        deleteImage: (file) => electron_1.ipcRenderer.invoke('agy-wallpaper:delete-image', file),",
    "        openFolder: () => electron_1.ipcRenderer.invoke('agy-wallpaper:open-folder')",
    "      });",
    "    } catch (_) {}",
    "  }",
    "  const __agyWallpaperCode = " + inlinedWallpaper + ";",
    "  const __agyInjectWallpaper = () => {",
    "    try {",
    "      if (electron_1 && electron_1.webFrame && typeof electron_1.webFrame.executeJavaScript === 'function') {",
    "        void electron_1.webFrame.executeJavaScript(__agyWallpaperCode);",
    "      }",
    "    } catch (err) {",
    "      console.error('[AgyWallpaper] webFrame executeJavaScript error:', err);",
    "    }",
    "  };",
    "  if (typeof window !== 'undefined' && typeof document !== 'undefined') {",
    "    if (document.readyState === 'loading') {",
    "      window.addEventListener('DOMContentLoaded', __agyInjectWallpaper, { once: true });",
    "    } else {",
    "      __agyInjectWallpaper();",
    "    }",
    "  }",
    "} catch (err) {",
    "  console.error('[AgyWallpaper] Preload bootstrap error:', err);",
    "}",
    WP_PRELOAD_END,
    ""
  ].join("\n");
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: node apply_slider_inplace.cjs <path-to-app.asar>");
    process.exit(2);
  }
  const asarPath = path.resolve(target);
  if (!fs.existsSync(asarPath)) {
    console.error(`[SuitePatch] Target app.asar not found: ${asarPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(CLIENT_JS)) {
    console.error(`[SuitePatch] client.js not found: ${CLIENT_JS}`);
    process.exit(1);
  }

  const clientCode = fs.readFileSync(CLIENT_JS, "utf8");
  const hasWallpaperFiles = fs.existsSync(WALLPAPER_JS) && fs.existsSync(WALLPAPER_MAIN_IPC);
  const wallpaperCode = hasWallpaperFiles ? fs.readFileSync(WALLPAPER_JS, "utf8") : "";
  const wallpaperIpcCode = hasWallpaperFiles ? fs.readFileSync(WALLPAPER_MAIN_IPC, "utf8") : "";

  const rawAsar = fs.readFileSync(asarPath);
  const { header, payload } = parseAsarArchive(rawAsar);
  const distFiles = header?.files?.dist?.files;
  if (!distFiles || !distFiles["preload.js"] || distFiles["preload.js"].offset === undefined) {
    throw new Error("Missing dist/preload.js in app.asar");
  }

  // 1. Patch dist/preload.js (effort slider + wallpaper bridge & renderer)
  const preloadEntry = distFiles["preload.js"];
  const origPreload = payload
    .subarray(Number(preloadEntry.offset), Number(preloadEntry.offset) + preloadEntry.size)
    .toString("utf8");
  const cleanPreload = stripMarkedBlock(stripExistingPreloadPatch(origPreload), WP_PRELOAD_START, WP_PRELOAD_END);
  let patchedPreload = buildPatchedPreloadSource(cleanPreload, clientCode);
  if (hasWallpaperFiles) {
    patchedPreload += buildWallpaperPreloadSnippet(wallpaperCode);
  }

  const replacements = new Map([["dist/preload.js", Buffer.from(patchedPreload, "utf8")]]);

  // 2. Patch dist/main.js (wallpaper disk vault IPC handlers)
  if (hasWallpaperFiles && distFiles["main.js"] && distFiles["main.js"].offset !== undefined) {
    const mainEntry = distFiles["main.js"];
    const origMain = payload
      .subarray(Number(mainEntry.offset), Number(mainEntry.offset) + mainEntry.size)
      .toString("utf8");
    const cleanMain = stripMarkedBlock(origMain, WP_IPC_START, WP_IPC_END);
    const patchedMain = cleanMain + "\n" + wallpaperIpcCode.trim() + "\n";
    replacements.set("dist/main.js", Buffer.from(patchedMain, "utf8"));
  }

  // 3. Patch dist/languageServer.js (preserve --csrf_token for antigravity-pulse quota bar)
  if (distFiles["languageServer.js"] && distFiles["languageServer.js"].offset !== undefined) {
    const lsEntry = distFiles["languageServer.js"];
    const origLs = payload
      .subarray(Number(lsEntry.offset), Number(lsEntry.offset) + lsEntry.size)
      .toString("utf8");
    const patchedLs = origLs.replace(
      /(\(0,\s*lsDefaults_1\.baseLsArgs\)\(\{)([\s\S]*?)(\}\))/,
      (full, open, inner, close) => {
        if (/\bcsrfToken\s*:/.test(inner)) return full;
        return `${open}\n                csrfToken: csrf,${inner}${close}`;
      }
    );
    if (patchedLs !== origLs) {
      replacements.set("dist/languageServer.js", Buffer.from(patchedLs, "utf8"));
    }
  }

  const removedPaths = new Set(["dist/antigravity-codex-effort-slider.js"]);
  const outChunks = [];
  const state = { offset: 0 };
  repackAsarTree(header, payload, "", replacements, removedPaths, outChunks, state);
  const patchedBuffer = buildAsarArchive(header, outChunks);

  // Self-verify rebuilt buffer before writing to disk
  const { header: vHdr, payload: vPayload } = parseAsarArchive(patchedBuffer);
  const vDist = vHdr?.files?.dist?.files || {};
  const vPre = vDist["preload.js"];
  const vPreText = vPayload.subarray(Number(vPre.offset), Number(vPre.offset) + vPre.size).toString("utf8");
  if (!vPreText.includes("/* __AG_CODEX_EFFORT_SLIDER_START__ */")) {
    throw new Error("Verification failed: slider marker missing in dist/preload.js");
  }
  if (hasWallpaperFiles && !vPreText.includes(WP_PRELOAD_START)) {
    throw new Error("Verification failed: wallpaper marker missing in dist/preload.js");
  }
  if (hasWallpaperFiles && vDist["main.js"]) {
    const vMain = vDist["main.js"];
    const vMainText = vPayload.subarray(Number(vMain.offset), Number(vMain.offset) + vMain.size).toString("utf8");
    if (!vMainText.includes(WP_IPC_START)) {
      throw new Error("Verification failed: wallpaper IPC marker missing in dist/main.js");
    }
  }
  if (vDist["languageServer.js"]) {
    const vLs = vDist["languageServer.js"];
    const vLsText = vPayload.subarray(Number(vLs.offset), Number(vLs.offset) + vLs.size).toString("utf8");
    if (!/baseLsArgs\)\(\{[^}]*\bcsrfToken\s*:\s*csrf\b/.test(vLsText)) {
      throw new Error("Verification failed: csrfToken: csrf missing in baseLsArgs inside dist/languageServer.js");
    }
  }

  const tmpPath = `${asarPath}.slider.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, patchedBuffer);
  try {
    fs.renameSync(tmpPath, asarPath);
  } catch (renameErr) {
    try {
      fs.copyFileSync(tmpPath, asarPath);
      fs.unlinkSync(tmpPath);
    } catch (copyErr) {
      try { fs.unlinkSync(tmpPath); } catch {}
      throw copyErr;
    }
  }
  console.log(
    `[SuitePatch] Injected slider${hasWallpaperFiles ? " + wallpaper studio" : ""} + ls-csrf into ${asarPath} (${patchedBuffer.length} bytes)`
  );
}

try {
  main();
} catch (err) {
  console.error("[SuitePatch] Failed:", err && err.message ? err.message : err);
  process.exit(1);
}
