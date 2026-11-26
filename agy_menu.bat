@echo off
chcp 65001 >nul
setlocal
set "SUITE_DIR=%~dp0"
set "PY_SCRIPT=%SUITE_DIR%agy_suite.py"

:menu
cls
echo ============================================================
echo   Antigravity Suite (汉化 + 推理滑条 + 额度条 + 自定义壁纸)
echo ============================================================
echo   [1] 重新装入全部 4 项增强并启动 Antigravity
echo   [2] 智能启动 Antigravity（官方更新后自动重装）
echo   [3] 查看当前安装状态
echo   [4] 还原当前版本官方原版 Antigravity
echo   [5] 更新上游汉化与额度条源码（保留本地 120fps 增强）
echo   [6] 打开我的自定义壁纸文件夹 (wallpapers)
echo   [7] 修复/重建桌面快捷方式
echo   [0] 退出
echo ============================================================
set /p "choice=请选择 [0-7]: "

if "%choice%"=="1" (
    python "%PY_SCRIPT%" patch --launch
    pause
    goto menu
)
if "%choice%"=="2" (
    python "%PY_SCRIPT%" launch
    exit /b 0
)
if "%choice%"=="3" (
    python "%PY_SCRIPT%" status
    pause
    goto menu
)
if "%choice%"=="4" (
    python "%PY_SCRIPT%" restore
    pause
    goto menu
)
if "%choice%"=="5" (
    python "%PY_SCRIPT%" update-mods
    pause
    goto menu
)
if "%choice%"=="6" (
    if not exist "%SUITE_DIR%wallpapers" mkdir "%SUITE_DIR%wallpapers"
    explorer "%SUITE_DIR%wallpapers"
    goto menu
)
if "%choice%"=="7" (
    python "%PY_SCRIPT%" setup-shortcut
    pause
    goto menu
)
if "%choice%"=="0" exit /b 0
goto menu
