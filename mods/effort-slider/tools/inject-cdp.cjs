"use strict";

/**
 * Antigravity 本地 CDP 免重启热注入 / 卸载工具 (tools/inject-cdp.cjs)
 *
 * 功能：
 * 1. 自动扫描 %APPDATA%\Antigravity\DevToolsActivePort（及 macOS / Linux 对应目录），
 *    发现所有正在运行的 Antigravity 页面目标（支持多窗口同时注入）。
 * 2. 将 lib/client.js 直接注入到每个页面的 Main World (window)，立即挂载底部「推理等级」滑条与触发按钮着色。
 * 3. 支持 `--uninstall` 参数一键从正在运行的窗口卸载滑条并恢复原生状态，无需重启客户端。
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

const ROOT_DIR = path.resolve(__dirname, "..");
const CLIENT_JS_PATH = path.join(ROOT_DIR, "lib", "client.js");

function getCandidatePortFiles() {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  return [
    path.join(appData, "Antigravity", "DevToolsActivePort"),
    path.join(appData, "Antigravity IDE", "DevToolsActivePort"),
    path.join(home, "Library", "Application Support", "Antigravity", "DevToolsActivePort"),
    path.join(home, ".config", "Antigravity", "DevToolsActivePort")
  ];
}

function fetchJson(port, resourcePath, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: resourcePath,
        timeout: timeoutMs
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(raw));
          } catch (err) {
            reject(new Error("Invalid JSON from DevTools endpoint"));
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("DevTools HTTP timeout")));
    req.on("error", reject);
  });
}

async function discoverAntigravityTargets() {
  const portFiles = getCandidatePortFiles();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    for (const file of portFiles) {
      if (!fs.existsSync(file)) continue;
      try {
        const content = fs.readFileSync(file, "utf8").trim();
        const firstLine = content.split(/\r?\n/)[0];
        const port = Number(firstLine);
        if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

        const list = await fetchJson(port, "/json/list", 4000);
        if (!Array.isArray(list)) continue;
        const pages = list.filter(
          (t) =>
            t &&
            t.type === "page" &&
            typeof t.webSocketDebuggerUrl === "string" &&
            /^ws:\/\/(127\.0\.0\.1|localhost):\d+\//.test(t.webSocketDebuggerUrl) &&
            !/^devtools:\/\//i.test(t.url || "")
        );
        if (pages.length > 0) {
          return { port, file, pages };
        }
      } catch (err) {
        // 继续尝试下一个候选端口文件
      }
    }
    if (attempt < 5) {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return null;
}

function evaluateOverWebSocket(wsUrl, expression, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const WS = globalThis.WebSocket;
    if (typeof WS !== "function") {
      reject(new Error("当前 Node.js 版本未内置全局 WebSocket（建议使用 Node.js 20+）"));
      return;
    }
    const ws = new WS(wsUrl);
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {}
      reject(new Error("CDP WebSocket 执行超时"));
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: {
            expression,
            returnByValue: true,
            awaitPromise: true
          }
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
        if (msg.id !== 1) return;
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
        if (msg.error) {
          reject(new Error(msg.error.message || "CDP Error"));
          return;
        }
        const exception = msg.result && msg.result.exceptionDetails;
        if (exception) {
          reject(
            new Error(
              (exception.exception && exception.exception.description) ||
                exception.text ||
                "Runtime.evaluate 抛出异常"
            )
          );
          return;
        }
        resolve(msg.result && msg.result.result ? msg.result.result.value : undefined);
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      }
    };

    ws.onerror = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(err && err.message ? err.message : "WebSocket 连接失败"));
    };
  });
}

async function runCli() {
  const args = process.argv.slice(2);
  const isUninstall = args.includes("--uninstall") || args.includes("-u");

  const found = await discoverAntigravityTargets();
  if (!found) {
    console.error("[CodexSlider CDP] 未检测到正在运行的 Antigravity 实例（请确认 Antigravity 已打开）。");
    process.exitCode = 1;
    return;
  }

  const clientCode = fs.readFileSync(CLIENT_JS_PATH, "utf8");

  for (const page of found.pages) {
    const title = page.title || page.url || page.id;
    if (isUninstall) {
      const uninstallExpr = `(() => {
        if (window.__agCodexEffortSliderInstance && typeof window.__agCodexEffortSliderInstance.stop === 'function') {
          window.__agCodexEffortSliderInstance.stop();
        }
        const styleEl = document.getElementById('ag-codex-effort-slider-styles');
        if (styleEl) styleEl.remove();
        const triggerSpan = document.querySelector('[data-testid="model-selector-trigger"] [data-ces-part="trigger-effort"]');
        if (triggerSpan) {
          triggerSpan.style.color = '';
          triggerSpan.style.opacity = '';
          triggerSpan.style.fontWeight = '';
        }
        return { uninstalled: true };
      })()`;
      const res = await evaluateOverWebSocket(page.webSocketDebuggerUrl, uninstallExpr);
      console.log(`[CodexSlider CDP] 已从窗口卸载: ${title}`, res);
    } else {
      const injectExpr = `(() => {
        ${clientCode}
        if (window.AntigravityCodexEffortSlider) {
          window.AntigravityCodexEffortSlider.installCodexEffortSlider({ document, window });
        }
        const trigger = document.querySelector('[data-testid="model-selector-trigger"]');
        return {
          installed: Boolean(window.__agCodexEffortSliderInstance),
          triggerFound: Boolean(trigger),
          triggerText: trigger ? trigger.innerText.trim() : null
        };
      })()`;
      const res = await evaluateOverWebSocket(page.webSocketDebuggerUrl, injectExpr);
      console.log(`[CodexSlider CDP] 已热注入窗口 (port ${found.port}): ${title}`, res);
    }
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error("[CodexSlider CDP] 执行失败:", err.message || err);
    process.exitCode = 1;
  });
}

module.exports = {
  discoverAntigravityTargets,
  evaluateOverWebSocket
};
