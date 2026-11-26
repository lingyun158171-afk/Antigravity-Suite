"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);
const isUninstall = args.includes("--uninstall") || args.includes("-u") || args.includes("-Uninstall");
const asarIdx = args.findIndex((a) => a === "--asar" || a === "-AsarPath");
const customAsar = asarIdx >= 0 && args[asarIdx + 1] ? args[asarIdx + 1] : "";

console.log("======================================================");
if (isUninstall) {
  console.log("  Antigravity Codex 推理等级滑条 · 卸载与还原工具");
} else {
  console.log("  Antigravity Codex 推理等级滑条 · 一键安装工具");
}
console.log("======================================================");

const patchScript = path.join(__dirname, "patch-asar.cjs");
const cdpScript = path.join(__dirname, "inject-cdp.cjs");

const patchArgs = [patchScript];
if (isUninstall) patchArgs.push("--uninstall");
if (customAsar) patchArgs.push("--asar", customAsar);

console.log("\n[1/2] 正在处理持久安装包 (app.asar & Antigravity IDE)...");
const patchRes = spawnSync(process.execPath, patchArgs, { stdio: "inherit" });
if (patchRes.status !== 0) {
  process.exitCode = patchRes.status || 1;
}

const cdpArgs = [cdpScript];
if (isUninstall) cdpArgs.push("--uninstall");

console.log("\n[2/2] 正在对运行中的 Antigravity 窗口执行 CDP 实时同步...");
const cdpRes = spawnSync(process.execPath, cdpArgs, { stdio: "inherit" });
if (cdpRes.status !== 0) {
  console.log("提示: 当前无运行中的 Antigravity 调试窗口，持久补丁将在下次启动时自动生效。");
}

console.log("\n操作完成！");
