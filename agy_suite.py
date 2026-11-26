# -*- coding: utf-8 -*-
"""Antigravity 增强套件统一管理与智能启动器 (汉化 + 推理等级滑条 + 额度条)

用法:
  python agy_suite.py launch          # 智能启动：已注入直接秒开；若官方刚更新则自动重注入后启动
  python agy_suite.py patch [--launch]# 强制基于当前版本官方备份重新注入汉化 + 滑条 + 额度条检查
  python agy_suite.py restore         # 还原当前版本的官方原版 app.asar
  python agy_suite.py status          # 查看版本、各增强组件和备份状态
  python agy_suite.py update-mods     # 从 GitHub 更新汉化 / 滑条 / 额度条三个组件源码
  python agy_suite.py setup-shortcut  # 将快捷方式指向静默智能启动器（保留官方图标）
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

SUITE_DIR = Path(__file__).resolve().parent
MODS_DIR = SUITE_DIR / "mods"
BACKUPS_DIR = SUITE_DIR / "backups"
LOC_DIR = MODS_DIR / "localization"
SLIDER_DIR = MODS_DIR / "effort-slider"
DASH_DIR = MODS_DIR / "dashboard"
SLIDER_HELPER = SUITE_DIR / "apply_slider_inplace.cjs"
VBS_LAUNCHER = SUITE_DIR / "launch_agy.vbs"

ZH_MARKER = "AGY_ZH_ENGINE_START"
SLIDER_MARKER = "__AG_CODEX_EFFORT_SLIDER_START__"
WALLPAPER_PRELOAD_MARKER = "__AGY_WALLPAPER_PRELOAD_START__"
WALLPAPER_IPC_MARKER = "__AGY_WALLPAPER_IPC_START__"
LS_CSRF_RE = re.compile(r"baseLsArgs\)\(\{[^}]*\bcsrfToken\s*:\s*csrf\b")
DEBUG_ARGS = [
    "--remote-debugging-port=0",
    "--remote-debugging-address=127.0.0.1",
]

GITHUB_MODS = {
    "localization": {
        "name": "一键汉化 (Antigravity-YiJianHanHua)",
        "repo": "QingniaoDawn/Antigravity-YiJianHanHua",
        "dest": LOC_DIR,
        "required": ["localize.py", "engine.js", "zh_data.json"],
    },
    "dashboard": {
        "name": "额度/速度仪表盘 (antigrative-dashboard)",
        "repo": "ATtacK030130/antigrative-dashboard",
        "dest": DASH_DIR,
        "required": ["manage.py", "plugin.json"],
    },
}


def patch_localization_conflict_guard(loc_dir: Path) -> bool:
    """在本机运行时为上游 engine.js 注入 2 行零冲突免疫补丁，避免与推理等级滑条 / 壁纸工坊拖动冲突。"""
    engine_path = loc_dir / "engine.js"
    if not engine_path.is_file():
        return False
    text = engine_path.read_text(encoding="utf-8")
    guard_marker = "data-ces-part"
    if guard_marker in text:
        return True

    anchor = "if (!element) return false;"
    idx = text.find(anchor)
    if idx < 0:
        return False

    patch_lines = (
        anchor
        + "\n        if (element.hasAttribute && (element.hasAttribute('data-ag-localization-skip') || element.hasAttribute('data-ces-part'))) return true;"
        + "\n        if (element.closest && element.closest('[data-ag-localization-skip], .ces-ag-section, [data-ces-part]')) return true;"
    )
    new_text = text[:idx] + patch_lines + text[idx + len(anchor):]
    engine_path.write_text(new_text, encoding="utf-8")
    print("[OK] 已为本机汉化引擎应用零冲突免疫补丁（彻底消除滑条拖动卡顿）")
    return True


def ensure_localization_mod() -> bool:
    """首次使用时自动从官方 GitHub 拉取原版一键汉化（遵循原作者版权声明，本仓库不二次分发其源码）。"""
    loc_script = LOC_DIR / "localize.py"
    if loc_script.is_file():
        patch_localization_conflict_guard(LOC_DIR)
        return True
    print("[*] 首次运行：正在从原作者 GitHub 仓库拉取官方一键汉化组件...")
    ok = _download_mod("localization", GITHUB_MODS["localization"])
    if ok:
        patch_localization_conflict_guard(LOC_DIR)
    return ok


def default_app_dir() -> Path:
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return local / "Programs" / "antigravity"


def plugin_dir() -> Path:
    return Path.home() / ".gemini" / "config" / "plugins" / "antigravity-pulse"


def pulse_settings_path() -> Path:
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
    return local / "AntigravityPulse" / "settings.json"


def read_asar_header_and_entries(asar_path: Path, entry_paths: list[str]) -> tuple[dict, dict[str, bytes]]:
    with asar_path.open("rb") as f:
        head = f.read(16)
        if len(head) < 16:
            raise RuntimeError("Invalid asar: truncated header")
        pickle_size, header_size, _, json_size = struct.unpack("<4I", head)
        if pickle_size != 4 or json_size <= 0 or json_size > 32 * 1024 * 1024:
            raise RuntimeError("Invalid asar header sizes")
        raw_header = f.read(json_size)
        header = json.loads(raw_header.decode("utf-8"))
        base = 8 + header_size

        results: dict[str, bytes] = {}
        for rel in entry_paths:
            node = header
            found = True
            for part in rel.split("/"):
                files = node.get("files") if isinstance(node, dict) else None
                if not isinstance(files, dict) or part not in files:
                    found = False
                    break
                node = files[part]
            if found and isinstance(node, dict) and "offset" in node and not node.get("unpacked"):
                f.seek(base + int(node["offset"]))
                results[rel] = f.read(int(node["size"]))
        return header, results


def inspect_asar(asar_path: Path) -> dict:
    if not asar_path.is_file():
        return {"exists": False, "version": None, "has_zh": False, "has_slider": False, "has_ls_csrf": False, "has_wallpaper": False, "is_official": False}
    _, entries = read_asar_header_and_entries(asar_path, ["package.json", "dist/preload.js", "dist/languageServer.js", "dist/main.js"])
    version = None
    if "package.json" in entries:
        try:
            version = json.loads(entries["package.json"].decode("utf-8")).get("version")
        except Exception:
            version = None
    preload = entries.get("dist/preload.js", b"").decode("utf-8", errors="replace")
    ls_text = entries.get("dist/languageServer.js", b"").decode("utf-8", errors="replace")
    main_text = entries.get("dist/main.js", b"").decode("utf-8", errors="replace")
    has_zh = ZH_MARKER in preload
    has_slider = SLIDER_MARKER in preload
    has_ls_csrf = bool(LS_CSRF_RE.search(ls_text))
    has_wallpaper = (WALLPAPER_PRELOAD_MARKER in preload) and (WALLPAPER_IPC_MARKER in main_text)
    return {
        "exists": True,
        "version": version,
        "has_zh": has_zh,
        "has_slider": has_slider,
        "has_ls_csrf": has_ls_csrf,
        "has_wallpaper": has_wallpaper,
        "is_official": (not has_zh) and (not has_slider) and (not has_ls_csrf) and (not has_wallpaper),
    }


def walk_asar_files(node: dict, prefix: str = ""):
    for name, entry in node.get("files", {}).items():
        rel = f"{prefix}/{name}" if prefix else name
        if "files" in entry:
            yield from walk_asar_files(entry, rel)
        elif "offset" in entry and not entry.get("unpacked"):
            yield rel, entry


def verify_asar_integrity(asar_path: Path, expected_version: str | None = None) -> None:
    data = asar_path.read_bytes()
    sizes = struct.unpack("<4I", data[:16])
    header = json.loads(data[16 : 16 + sizes[3]].decode("utf-8"))
    base = 8 + sizes[1]

    checked = 0
    preload_text = None
    ls_text = None
    main_text = None
    pkg_version = None
    for rel, entry in walk_asar_files(header):
        off = base + int(entry["offset"])
        size = int(entry["size"])
        if off < base or off + size > len(data):
            raise RuntimeError(f"Asar entry out of bounds: {rel}")
        body = data[off : off + size]
        if "integrity" in entry and isinstance(entry["integrity"], dict):
            expected_hash = entry["integrity"].get("hash")
            if expected_hash:
                actual_hash = hashlib.sha256(body).hexdigest()
                if actual_hash != expected_hash:
                    raise RuntimeError(f"SHA256 mismatch in asar entry: {rel}")
        if rel == "dist/preload.js":
            preload_text = body.decode("utf-8", errors="replace")
        elif rel == "dist/languageServer.js":
            ls_text = body.decode("utf-8", errors="replace")
        elif rel == "dist/main.js":
            main_text = body.decode("utf-8", errors="replace")
        elif rel == "package.json":
            pkg_version = json.loads(body.decode("utf-8")).get("version")
        checked += 1

    if expected_version and pkg_version != expected_version:
        raise RuntimeError(f"Version mismatch after patch: expected {expected_version}, got {pkg_version}")
    if not preload_text:
        raise RuntimeError("Missing dist/preload.js after patch")
    if ZH_MARKER not in preload_text:
        raise RuntimeError("Localization marker missing after patch")
    if SLIDER_MARKER not in preload_text:
        raise RuntimeError("Effort slider marker missing after patch")
    if WALLPAPER_PRELOAD_MARKER not in preload_text:
        raise RuntimeError("Wallpaper preload marker missing after patch")
    if main_text is not None and WALLPAPER_IPC_MARKER not in main_text:
        raise RuntimeError("Wallpaper IPC marker missing in dist/main.js")
    if ls_text is not None and not LS_CSRF_RE.search(ls_text):
        raise RuntimeError("Language server CSRF credential marker missing in baseLsArgs inside dist/languageServer.js")
    print(f"[OK] app.asar 完整性校验通过（共校验 {checked} 个条目，v{pkg_version}，汉化 + 滑条 + 额度凭据 + 自定义壁纸工坊均已就位）")


def official_backup_path(version: str) -> Path:
    safe_ver = "".join(c for c in version if c.isalnum() or c in ".-_")
    return BACKUPS_DIR / f"app.asar.{safe_ver}.official.bak"


def ensure_official_backup(asar_path: Path, info: dict) -> Path | None:
    version = info.get("version")
    if not version:
        return None
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    bak = official_backup_path(version)
    if bak.is_file():
        bak_info = inspect_asar(bak)
        if bak_info["is_official"] and bak_info["version"] == version:
            return bak

    # Check current app.asar
    if info["is_official"]:
        tmp = bak.with_suffix(".bak.tmp")
        shutil.copy2(asar_path, tmp)
        os.replace(tmp, bak)
        print(f"[OK] 已保存 v{version} 官方原版备份 -> {bak}")
        return bak

    # Check resources/app.asar.bak if localize.py created one earlier
    res_bak = asar_path.with_name("app.asar.bak")
    if res_bak.is_file():
        rb_info = inspect_asar(res_bak)
        if rb_info["is_official"] and rb_info["version"] == version:
            tmp = bak.with_suffix(".bak.tmp")
            shutil.copy2(res_bak, tmp)
            os.replace(tmp, bak)
            print(f"[OK] 已从 resources/app.asar.bak 归档 v{version} 官方备份 -> {bak}")
            return bak

    return None


def is_file_writable(path: Path) -> bool:
    if not path.exists():
        return True
    try:
        with open(path, "r+b"):
            return True
    except OSError:
        return False


def stop_antigravity(app_dir: Path) -> None:
    norm_prefix = str(app_dir.resolve()).lower().rstrip("\\") + "\\"
    ps = (
        "Get-CimInstance Win32_Process | "
        "Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower().StartsWith('"
        + norm_prefix.replace("'", "''")
        + "') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", ps],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    asar_path = app_dir / "resources" / "app.asar"
    for _ in range(30):
        if is_file_writable(asar_path):
            return
        time.sleep(0.3)

    # Fallback only for default real installation directory
    if app_dir.resolve() == default_app_dir().resolve():
        subprocess.run(
            ["taskkill", "/F", "/IM", "Antigravity.exe"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        for _ in range(20):
            if is_file_writable(asar_path):
                return
            time.sleep(0.3)


def ensure_dashboard_plugin() -> bool:
    pdir = plugin_dir()
    if (pdir / "plugin.json").is_file():
        # Make sure settings.json is not explicitly disabled
        sp = pulse_settings_path()
        if sp.is_file():
            try:
                data = json.loads(sp.read_text(encoding="utf-8-sig"))
                if data.get("enabled") is False:
                    data["enabled"] = True
                    sp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                    print("[OK] 已重新启用 Antigrative Dashboard 配置")
            except Exception:
                pass
        print(f"[OK] 额度条插件已就位: {pdir}")
        return True

    manage_py = DASH_DIR / "manage.py"
    if not manage_py.is_file():
        print(f"[!] 未找到额度条源码: {manage_py}")
        return False

    print("[*] 正在安装额度条插件 (Antigrative Dashboard)...")
    res = subprocess.run([sys.executable, str(manage_py), "install"], cwd=str(DASH_DIR))
    if res.returncode == 0 and (pdir / "plugin.json").is_file():
        print("[OK] 额度条插件安装完成")
        return True
    print("[!] 额度条插件安装未成功，请手动检查 manage.py 输出")
    return False


def launch_antigravity(app_dir: Path, extra_args: list[str] | None = None) -> None:
    exe = app_dir / "Antigravity.exe"
    if not exe.is_file():
        raise RuntimeError(f"未找到 Antigravity.exe: {exe}")
    args = [str(exe), *DEBUG_ARGS, *(extra_args or [])]
    env = os.environ.copy()
    env.pop("ELECTRON_RUN_AS_NODE", None)
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    subprocess.Popen(
        args,
        cwd=str(app_dir),
        env=env,
        creationflags=creationflags,
    )


def find_python_exe(gui: bool = False) -> str:
    cur = Path(sys.executable)
    if gui and cur.name.lower() == "python.exe":
        pyw = cur.with_name("pythonw.exe")
        if pyw.is_file():
            return str(pyw)
    if (not gui) and cur.name.lower() == "pythonw.exe":
        py = cur.with_name("python.exe")
        if py.is_file():
            return str(py)
    return str(cur)


def cmd_status(app_dir: Path) -> int:
    asar = app_dir / "resources" / "app.asar"
    info = inspect_asar(asar)
    print("=" * 60)
    print("  Antigravity 增强套件状态")
    print("=" * 60)
    if not info["exists"]:
        print(f"  [x] 未找到 app.asar: {asar}")
        return 1
    ver = info["version"] or "未知"
    bak = official_backup_path(ver) if info["version"] else None
    dash_ok = (plugin_dir() / "plugin.json").is_file()
    print(f"  安装目录     : {app_dir}")
    print(f"  当前版本     : v{ver}")
    print(f"  [1] 汉化引擎 : {'已注入' if info['has_zh'] else '未注入（需重新装入）'}")
    print(f"  [2] 推理滑条 : {'已注入' if info['has_slider'] else '未注入（需重新装入）'}")
    print(f"  [3] 额度条   : {'插件已安装' if dash_ok else '插件缺失'} / 本地凭据: {'已注入' if info['has_ls_csrf'] else '未注入（需重新装入）'}")
    print(f"  [4] 壁纸工坊 : {'已注入' if info['has_wallpaper'] else '未注入（需重新装入）'}")
    print(f"  官方原版备份 : {bak if (bak and bak.is_file()) else '尚未生成（首次装入时自动保存）'}")
    print("=" * 60)
    return 0


def cmd_patch(app_dir: Path, launch_after: bool = False, skip_dashboard: bool = False, extra_args: list[str] | None = None) -> int:
    resources = app_dir / "resources"
    asar = resources / "app.asar"
    if not asar.is_file():
        print(f"[ERROR] 未找到 app.asar: {asar}")
        return 1

    info = inspect_asar(asar)
    ver = info["version"] or "unknown"
    print("=" * 60)
    print(f"  Antigravity 增强套件装入（当前版本 v{ver}）")
    print("  包含: 一键汉化 + 推理等级滑条 + 额度条 + 自定义壁纸工坊")
    print("=" * 60)

    official_bak = ensure_official_backup(asar, info)

    print("[1/4] 检查并关闭正在运行的 Antigravity 进程...")
    stop_antigravity(app_dir)
    if not is_file_writable(asar):
        print("[ERROR] app.asar 仍被占用，请先在任务管理器彻底关闭 Antigravity 后重试。")
        return 1

    # Always start from clean official backup of this exact version when available
    if official_bak and official_bak.is_file():
        shutil.copy2(official_bak, asar)
        stale_bak = resources / "app.asar.bak"
        if stale_bak.is_file():
            try:
                stale_bak.unlink()
            except OSError:
                pass

    try:
        # Step 1: Localization (auto-fetch official upstream on first run, apply local conflict guard)
        if not ensure_localization_mod():
            raise RuntimeError("无法获取一键汉化组件（请检查网络连接或代理设置）")
        loc_script = LOC_DIR / "localize.py"
        print("\n[2/4] 正在注入一键汉化...")
        r1 = subprocess.run(
            [find_python_exe(gui=False), str(loc_script), "apply", "--path", str(resources), "--yes"],
            cwd=str(LOC_DIR),
        )
        if r1.returncode != 0:
            raise RuntimeError(f"汉化脚本返回错误码 {r1.returncode}")

        # Step 2: Effort slider (in-place on top of localized app.asar)
        if not SLIDER_HELPER.is_file():
            raise RuntimeError(f"缺少滑条注入脚本: {SLIDER_HELPER}")
        print("\n[3/4] 正在注入推理等级滑条 + 自定义壁纸工坊 + 额度凭据...")
        r2 = subprocess.run(
            ["node", str(SLIDER_HELPER), str(asar)],
            cwd=str(SUITE_DIR),
        )
        if r2.returncode != 0:
            raise RuntimeError(f"滑条与壁纸注入失败，错误码 {r2.returncode}")

        # Step 3: Full SHA-256 + marker verification
        print("\n[4/4] 正在校验 app.asar 完整性与额度条插件...")
        verify_asar_integrity(asar, expected_version=info["version"])
    except Exception as exc:
        print(f"\n[ERROR] 注入过程失败: {exc}")
        if official_bak and official_bak.is_file():
            try:
                shutil.copy2(official_bak, asar)
                print(f"[ROLLBACK] 已自动回滚到 v{ver} 官方原版 app.asar，软件不会损坏。")
            except Exception as rb_exc:
                print(f"[ERROR] 回滚失败: {rb_exc}")
        return 1

    if not skip_dashboard:
        ensure_dashboard_plugin()

    print("\n[DONE] 汉化 + 推理等级滑条 + 额度条 + 自定义壁纸工坊 已全部就绪！")
    if launch_after:
        print("[*] 正在启动 Antigravity（带额度条调试参数）...")
        launch_antigravity(app_dir, extra_args=extra_args)
    return 0


def cmd_restore(app_dir: Path, launch_after: bool = False) -> int:
    resources = app_dir / "resources"
    asar = resources / "app.asar"
    if not asar.is_file():
        print(f"[ERROR] 未找到 app.asar: {asar}")
        return 1
    info = inspect_asar(asar)
    ver = info["version"]
    if info["is_official"]:
        print(f"[OK] 当前 v{ver} 已经是官方原版，无需还原。")
        return 0

    candidates = []
    if ver:
        candidates.append(official_backup_path(ver))
    candidates.append(resources / "app.asar.bak")

    chosen = None
    for cand in candidates:
        if cand.is_file():
            ci = inspect_asar(cand)
            if ci["is_official"] and (not ver or ci["version"] == ver):
                chosen = cand
                break

    if not chosen:
        print(f"[ERROR] 未找到与当前版本 v{ver} 匹配的官方原版备份。")
        return 1

    print(f"[*] 正在关闭 Antigravity 并从 {chosen} 还原 v{ver} 官方原版...")
    stop_antigravity(app_dir)
    if not is_file_writable(asar):
        print("[ERROR] app.asar 仍被占用，请先关闭 Antigravity 后重试。")
        return 1
    tmp = asar.with_name(f"app.asar.restore.{os.getpid()}.tmp")
    shutil.copy2(chosen, tmp)
    os.replace(tmp, asar)
    print(f"[OK] 已成功还原为 v{ver} 官方原版！")
    if launch_after:
        launch_antigravity(app_dir)
    return 0


def cmd_launch(app_dir: Path, from_launcher: bool = False, extra_args: list[str] | None = None) -> int:
    asar = app_dir / "resources" / "app.asar"
    info = inspect_asar(asar)
    dash_ok = (plugin_dir() / "plugin.json").is_file()

    if info["exists"] and info["has_zh"] and info["has_slider"] and info["has_ls_csrf"] and info["has_wallpaper"] and dash_ok:
        # Fast path: everything already patched & installed, launch immediately!
        launch_antigravity(app_dir, extra_args=extra_args)
        return 0

    # Needs auto-repatch (e.g. Antigravity just auto-updated to a new version)
    if from_launcher and os.name == "nt":
        py_console = find_python_exe(gui=False)
        subprocess.Popen(
            [py_console, str(Path(__file__).resolve()), "patch", "--launch", "--pause-on-error", *(extra_args or [])],
            cwd=str(SUITE_DIR),
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        return 0

    return cmd_patch(app_dir, launch_after=True, extra_args=extra_args)


def _http_get_bytes(url: str, timeout: int = 30) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "agy-suite-updater/1.0",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _extract_strip_top(zip_path: Path, dest: Path) -> None:
    with zipfile.ZipFile(zip_path) as zf:
        names = [n for n in zf.namelist() if n and not n.endswith("/")]
        has_single_wrapper = bool(names) and all("/" in n for n in names) and len({n.split("/", 1)[0] for n in names}) == 1
        strip_prefix = (names[0].split("/", 1)[0] + "/") if has_single_wrapper else ""
        for info in zf.infolist():
            if info.is_dir():
                continue
            rel = info.filename
            if strip_prefix and rel.startswith(strip_prefix):
                rel = rel[len(strip_prefix) :]
            if not rel or rel.startswith("/") or ".." in Path(rel).parts:
                continue
            out = dest / Path(*rel.split("/"))
            out.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(out, "wb") as dst:
                shutil.copyfileobj(src, dst)


def _download_mod(mod_key: str, cfg: dict) -> bool:
    repo = cfg["repo"]
    dest: Path = cfg["dest"]
    print(f"\n[*] 检查更新: {cfg['name']} ({repo})")
    zip_url = f"https://github.com/{repo}/archive/refs/heads/main.zip"
    tag_label = "main"
    try:
        meta = json.loads(_http_get_bytes(f"https://api.github.com/repos/{repo}/releases/latest", timeout=20).decode("utf-8"))
        tag_label = meta.get("tag_name") or tag_label
        # Prefer attached .zip asset if available, else GitHub zipball_url
        assets = meta.get("assets") or []
        zip_asset = next((a["browser_download_url"] for a in assets if str(a.get("name", "")).lower().endswith(".zip")), None)
        zip_url = zip_asset or meta.get("zipball_url") or zip_url
    except Exception:
        pass

    print(f"    下载来源 ({tag_label}): {zip_url}")
    with tempfile.TemporaryDirectory(prefix=f"agy_upd_{mod_key}_") as td:
        td_path = Path(td)
        zpath = td_path / "pkg.zip"
        stage = td_path / "stage"
        stage.mkdir()
        try:
            zpath.write_bytes(_http_get_bytes(zip_url, timeout=60))
            _extract_strip_top(zpath, stage)
        except Exception as exc:
            print(f"    [!] 下载/解压失败: {exc}")
            return False

        missing = [r for r in cfg["required"] if not (stage / r).is_file()]
        if missing:
            print(f"    [!] 校验失败，缺少关键文件: {missing}（已跳过，保留原本地版本）")
            return False

        backup_old = dest.with_name(dest.name + ".old")
        if backup_old.exists():
            shutil.rmtree(backup_old, ignore_errors=True)
        try:
            if dest.exists():
                dest.rename(backup_old)
            shutil.copytree(stage, dest)
            if backup_old.exists():
                shutil.rmtree(backup_old, ignore_errors=True)
            print(f"    [OK] {cfg['name']} 已更新到 {tag_label}")
            return True
        except Exception as exc:
            print(f"    [!] 替换目录失败: {exc}")
            if not dest.exists() and backup_old.exists():
                backup_old.rename(dest)
            return False


def cmd_update_mods() -> int:
    print("=" * 60)
    print("  从 GitHub 更新上游汉化与额度条组件（保留本地 120fps 滑条与壁纸工坊）")
    print("=" * 60)
    ok_all = True
    for key, cfg in GITHUB_MODS.items():
        if not _download_mod(key, cfg):
            ok_all = False
    if (LOC_DIR / "engine.js").is_file():
        patch_localization_conflict_guard(LOC_DIR)
    if (DASH_DIR / "manage.py").is_file():
        print("\n[*] 同步更新额度条插件到 Antigravity 插件目录...")
        subprocess.run([find_python_exe(gui=False), str(DASH_DIR / "manage.py"), "install"], cwd=str(DASH_DIR))
    print("\n[*] 组件更新流程结束。如需立即生效到 app.asar，请运行 patch（或在菜单选 1）。")
    return 0 if ok_all else 1


def create_windows_shortcut(lnk_path: Path, target: str, arguments: str, icon: str, workdir: str, desc: str) -> None:
    lnk_path.parent.mkdir(parents=True, exist_ok=True)
    ps = (
        "$sh = New-Object -ComObject WScript.Shell; "
        f"$s = $sh.CreateShortcut('{str(lnk_path).replace(chr(39), chr(39)*2)}'); "
        f"$s.TargetPath = '{target.replace(chr(39), chr(39)*2)}'; "
        f"$s.Arguments = '{arguments.replace(chr(39), chr(39)*2)}'; "
        f"$s.WorkingDirectory = '{workdir.replace(chr(39), chr(39)*2)}'; "
        f"$s.IconLocation = '{icon.replace(chr(39), chr(39)*2)}'; "
        f"$s.Description = '{desc.replace(chr(39), chr(39)*2)}'; "
        "$s.Save()"
    )
    res = subprocess.run(["powershell", "-NoProfile", "-Command", ps], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or "Failed to create shortcut")


def cmd_setup_shortcut(app_dir: Path, custom_lnk: str | None = None) -> int:
    exe = app_dir / "Antigravity.exe"
    icon = f"{exe},0"
    targets: list[Path] = []
    if custom_lnk:
        targets.append(Path(custom_lnk))
    else:
        desktop = Path.home() / "Desktop"
        if desktop.exists():
            targets.append(desktop / "Antigravity (增强版).lnk")
        targets.append(SUITE_DIR / "启动 Antigravity (增强版).lnk")

    wscript = str(Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "wscript.exe")
    arg_str = f'"{VBS_LAUNCHER}"'
    for lnk in targets:
        create_windows_shortcut(
            lnk_path=lnk,
            target=wscript,
            arguments=arg_str,
            icon=icon,
            workdir=str(SUITE_DIR),
            desc="Antigravity 智能增强启动（自动保持汉化 + 推理等级滑条 + 额度条 + 自定义壁纸工坊）",
        )
        print(f"[OK] 已配置快捷方式: {lnk}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Antigravity 增强套件统一管理与智能启动器")
    parser.add_argument("command", nargs="?", default="status",
                        choices=["launch", "patch", "restore", "status", "update-mods", "setup-shortcut"])
    parser.add_argument("--app-dir", default=None, help="自定义 Antigravity 安装目录（默认 %%LOCALAPPDATA%%\\Programs\\antigravity）")
    parser.add_argument("--launch", action="store_true", help="执行完 patch / restore 后自动启动 Antigravity")
    parser.add_argument("--from-launcher", action="store_true", help="由静默 VBS 启动器调用")
    parser.add_argument("--skip-dashboard", action="store_true", help="仅测试 app.asar 注入，跳过插件检查")
    parser.add_argument("--shortcut-path", default=None, help="自定义要更新的 .lnk 快捷方式路径")
    parser.add_argument("--pause-on-error", action="store_true", help="出错时暂停等待回车，成功时自动退出")
    args, extra = parser.parse_known_args()

    app_dir = Path(args.app_dir).resolve() if args.app_dir else default_app_dir()

    rc = 0
    if args.command == "status":
        rc = cmd_status(app_dir)
    elif args.command == "patch":
        rc = cmd_patch(app_dir, launch_after=args.launch, skip_dashboard=args.skip_dashboard, extra_args=extra)
    elif args.command == "restore":
        rc = cmd_restore(app_dir, launch_after=args.launch)
    elif args.command == "launch":
        rc = cmd_launch(app_dir, from_launcher=args.from_launcher, extra_args=extra)
    elif args.command == "update-mods":
        rc = cmd_update_mods()
    elif args.command == "setup-shortcut":
        rc = cmd_setup_shortcut(app_dir, custom_lnk=args.shortcut_path)

    if args.pause_on_error:
        if rc != 0:
            try:
                input("\n操作失败，请查看上方日志。按回车键关闭窗口...")
            except EOFError:
                pass
        else:
            time.sleep(1.5)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
