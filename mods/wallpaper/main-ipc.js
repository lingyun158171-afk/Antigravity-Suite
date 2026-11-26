/* __AGY_WALLPAPER_IPC_START__ */
(function () {
  try {
    if (globalThis.__AGY_WALLPAPER_IPC_INSTALLED__) return;
    globalThis.__AGY_WALLPAPER_IPC_INSTALLED__ = true;

    const electron = require("electron");
    const fs = require("node:fs");
    const path = require("node:path");
    const os = require("node:os");
    const { ipcMain, dialog, shell, BrowserWindow } = electron || {};
    if (!ipcMain || typeof ipcMain.handle !== "function") return;

    const DEFAULT_WALLPAPER_DIR = path.join(
      os.homedir(),
      ".gemini",
      "antigravity",
      "wallpapers"
    );
    const INJECTED_WALLPAPER_DIR = "__AGY_SUITE_WALLPAPER_DIR__";
    const WALLPAPER_DIR =
      INJECTED_WALLPAPER_DIR && INJECTED_WALLPAPER_DIR !== "__AGY_SUITE_" + "WALLPAPER_DIR__"
        ? INJECTED_WALLPAPER_DIR
        : DEFAULT_WALLPAPER_DIR;
    const CONFIG_PATH = path.join(WALLPAPER_DIR, "config.json");
    const MIME_MAP = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".bmp": "image/bmp",
      ".avif": "image/avif",
      ".svg": "image/svg+xml"
    };
    const EXT_FROM_MIME = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/bmp": ".bmp",
      "image/avif": ".avif",
      "image/svg+xml": ".svg"
    };

    function ensureDir() {
      if (!fs.existsSync(WALLPAPER_DIR)) {
        fs.mkdirSync(WALLPAPER_DIR, { recursive: true });
      }
    }

    function readConfig() {
      ensureDir();
      try {
        if (fs.existsSync(CONFIG_PATH)) {
          const raw = fs.readFileSync(CONFIG_PATH, "utf8");
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") return parsed;
        }
      } catch (_) {}
      return null;
    }

    function writeConfig(cfg) {
      ensureDir();
      const tmp = CONFIG_PATH + "." + process.pid + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(cfg || {}, null, 2), "utf8");
      try {
        fs.renameSync(tmp, CONFIG_PATH);
      } catch (_) {
        fs.copyFileSync(tmp, CONFIG_PATH);
        try { fs.unlinkSync(tmp); } catch (__) {}
      }
    }

    function listImages() {
      ensureDir();
      const out = [];
      let names = [];
      try {
        names = fs.readdirSync(WALLPAPER_DIR);
      } catch (_) {
        return out;
      }
      for (const name of names) {
        const ext = path.extname(name).toLowerCase();
        if (!MIME_MAP[ext]) continue;
        const full = path.join(WALLPAPER_DIR, name);
        try {
          const st = fs.statSync(full);
          if (!st.isFile() || st.size <= 0 || st.size > 40 * 1024 * 1024) continue;
          out.push({
            file: name,
            name: path.basename(name, ext),
            size: st.size,
            mtime: st.mtimeMs || 0
          });
        } catch (_) {}
      }
      out.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
      return out;
    }

    function safeImagePath(fileName) {
      if (!fileName || typeof fileName !== "string") return null;
      const base = path.basename(fileName);
      if (!base || base !== fileName) return null;
      const ext = path.extname(base).toLowerCase();
      if (!MIME_MAP[ext]) return null;
      return path.join(WALLPAPER_DIR, base);
    }

    function readImageDataUrl(fileName) {
      const full = safeImagePath(fileName);
      if (!full || !fs.existsSync(full)) return null;
      const ext = path.extname(full).toLowerCase();
      const mime = MIME_MAP[ext] || "image/png";
      const buf = fs.readFileSync(full);
      return "data:" + mime + ";base64," + buf.toString("base64");
    }

    function sanitizeBaseName(rawName) {
      const cleaned = String(rawName || "wallpaper")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
        .replace(/\s+/g, "_")
        .slice(0, 48);
      return cleaned || "wallpaper";
    }

    function uniqueDestName(baseName, ext) {
      ensureDir();
      let candidate = baseName + ext;
      let idx = 1;
      while (fs.existsSync(path.join(WALLPAPER_DIR, candidate))) {
        candidate = baseName + "_" + idx + ext;
        idx += 1;
      }
      return candidate;
    }

    function registerHandler(channel, fn) {
      try { ipcMain.removeHandler(channel); } catch (_) {}
      ipcMain.handle(channel, fn);
    }

    registerHandler("agy-wallpaper:get-state", async () => {
      const config = readConfig();
      const images = listImages();
      let activeDataUrl = null;
      if (config && config.mode === "image" && config.imageFile) {
        try {
          activeDataUrl = readImageDataUrl(config.imageFile);
        } catch (_) {}
      }
      return {
        ok: true,
        dir: WALLPAPER_DIR,
        config,
        images,
        activeDataUrl
      };
    });

    registerHandler("agy-wallpaper:save-config", async (_ev, cfg) => {
      try {
        writeConfig(cfg);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    });

    registerHandler("agy-wallpaper:read-image", async (_ev, fileName) => {
      try {
        const dataUrl = readImageDataUrl(fileName);
        if (!dataUrl) return { ok: false, error: "not_found" };
        return { ok: true, file: fileName, dataUrl };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    });

    registerHandler("agy-wallpaper:pick-image", async (ev) => {
      try {
        ensureDir();
        const win = BrowserWindow && ev && ev.sender ? BrowserWindow.fromWebContents(ev.sender) : null;
        const result = await dialog.showOpenDialog(win || undefined, {
          title: "选择自定义 UI 壁纸图片",
          properties: ["openFile", "multiSelections"],
          filters: [
            { name: "图片文件", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"] }
          ]
        });
        if (!result || result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length === 0) {
          return { ok: true, canceled: true, added: [], images: listImages() };
        }
        const added = [];
        for (const srcPath of result.filePaths) {
          const ext = path.extname(srcPath).toLowerCase();
          if (!MIME_MAP[ext]) continue;
          const srcResolved = path.resolve(srcPath);
          const dirResolved = path.resolve(WALLPAPER_DIR);
          let destFile;
          if (path.dirname(srcResolved).toLowerCase() === dirResolved.toLowerCase()) {
            destFile = path.basename(srcResolved);
          } else {
            const base = sanitizeBaseName(path.basename(srcPath, ext));
            destFile = uniqueDestName(base, ext);
            fs.copyFileSync(srcResolved, path.join(WALLPAPER_DIR, destFile));
          }
          added.push(destFile);
        }
        const firstFile = added[0] || null;
        const firstDataUrl = firstFile ? readImageDataUrl(firstFile) : null;
        return {
          ok: true,
          canceled: false,
          added,
          firstFile,
          firstDataUrl,
          images: listImages()
        };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    });

    registerHandler("agy-wallpaper:import-data", async (_ev, payload) => {
      try {
        ensureDir();
        const dataUrl = payload && payload.dataUrl;
        if (!dataUrl || typeof dataUrl !== "string") {
          return { ok: false, error: "invalid_data_url" };
        }
        const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(dataUrl);
        if (!match) {
          return { ok: false, error: "unsupported_format" };
        }
        const mime = match[1].toLowerCase();
        const ext = EXT_FROM_MIME[mime] || ".png";
        const buf = Buffer.from(match[2], "base64");
        if (!buf.length || buf.length > 40 * 1024 * 1024) {
          return { ok: false, error: "invalid_size" };
        }
        const rawBase = payload && payload.name ? path.basename(String(payload.name), path.extname(String(payload.name))) : "wallpaper";
        const destFile = uniqueDestName(sanitizeBaseName(rawBase), ext);
        fs.writeFileSync(path.join(WALLPAPER_DIR, destFile), buf);
        return {
          ok: true,
          file: destFile,
          dataUrl,
          images: listImages()
        };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    });

    registerHandler("agy-wallpaper:delete-image", async (_ev, fileName) => {
      try {
        const full = safeImagePath(fileName);
        if (full && fs.existsSync(full)) {
          fs.unlinkSync(full);
        }
        return { ok: true, images: listImages() };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    });

    registerHandler("agy-wallpaper:open-folder", async () => {
      try {
        ensureDir();
        if (shell && typeof shell.openPath === "function") {
          await shell.openPath(WALLPAPER_DIR);
        }
        return { ok: true, dir: WALLPAPER_DIR };
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    });
  } catch (err) {
    try { console.error("[AgyWallpaper IPC] init error:", err); } catch (_) {}
  }
})();
/* __AGY_WALLPAPER_IPC_END__ */
