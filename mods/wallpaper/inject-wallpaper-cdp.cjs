"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const WALLPAPER_JS = path.join(__dirname, "wallpaper.js");
const PORT_FILE = path.join(process.env.APPDATA || "", "Antigravity", "DevToolsActivePort");

function getTargets(port) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:${port}/json/list`, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });
}

function evalInTarget(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error("CDP timeout"));
    }, 8000);
    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true, awaitPromise: false }
        })
      );
    };
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.id === 1) {
          clearTimeout(timer);
          ws.close();
          if (msg.result && msg.result.exceptionDetails) {
            reject(new Error(msg.result.exceptionDetails.text || "JS exception"));
          } else {
            resolve(msg.result && msg.result.result ? msg.result.result.value : null);
          }
        }
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    };
    ws.onerror = (err) => {
      clearTimeout(timer);
      reject(err);
    };
  });
}

async function main() {
  if (!fs.existsSync(PORT_FILE)) {
    throw new Error(`未找到 DevToolsActivePort: ${PORT_FILE}`);
  }
  const port = parseInt(fs.readFileSync(PORT_FILE, "utf8").trim().split(/\r?\n/)[0], 10);
  if (!port) throw new Error("无效的调试端口");

  const code = fs.readFileSync(WALLPAPER_JS, "utf8");
  const targets = await getTargets(port);
  const pages = targets.filter(
    (t) =>
      t &&
      t.type === "page" &&
      t.webSocketDebuggerUrl &&
      t.title &&
      t.title.includes("Antigravity")
  );
  if (pages.length === 0) {
    throw new Error("未找到运行中的 Antigravity 主窗口");
  }

  for (const page of pages) {
    const expr = `${code}\n;(function(){ return { mounted: Boolean(document.getElementById('agy-wallpaper-btn')), state: window.__agyWallpaperInstance ? window.__agyWallpaperInstance.getState() : null }; })();`;
    const res = await evalInTarget(page.webSocketDebuggerUrl, expr);
    console.log(`[AgyWallpaper CDP] 已热注入窗口 (port ${port}): ${page.title}`, res);
  }
}

main().catch((err) => {
  console.error("[AgyWallpaper CDP] 注入失败:", err && err.message ? err.message : err);
  process.exit(1);
});
