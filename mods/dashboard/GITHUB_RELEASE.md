# Antigrative Dashboard v0.9.10

Adds conversation compaction counts, context occupancy warning colors, and Windows proxy-launcher shortcut compatibility across the Desktop App plugin and standalone IDE extension:

- **Conversation compaction count (`🗜`):** Displays a compact compaction counter pill in the inline context card and native sidecar panel (plus chip/tab tooltip suffix) whenever `transcriptStats.compactionMarkers > 0`, localized across English, Simplified Chinese, and Traditional Chinese (#4, #7).
- **Context occupancy threshold colors:** Colors the inline context ring and context progress bar at `>= 75%` (warning) and `>= 90%` (danger) against the host-reported `maxContextTokens`, and prevents `localize()` from overwriting dynamic chip tooltips on polling ticks (#4, #7).
- **Windows `AntigravityLauncher.exe` shortcut support:** Recognizes desktop shortcuts created by `yuaotian/antigravity-proxy` (`Antigravity (代理).lnk` / `Antigravity (Proxy).lnk` / `Antigravity (Прокси).lnk`) in both JS and Python launch configuration helpers so `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1` is injected automatically while continuing to exclude IDE shortcuts (#3, #6).

## Install or update

- **Desktop App:** Download `antigrative-dashboard-0.9.10.zip`, extract it, and run `python manage.py install` (`python3` on Linux/macOS), then fully quit and reopen Antigravity from your shortcut / `Antigravity (Dashboard).app` (or run `python3 manage.py launch --restart`). Existing `v0.9.1+` installations can also update in-app via **⋯ → Check for updates**, then restart Antigravity once.
- **Standalone IDE:** Download `antigrative-dashboard-ide-0.9.10.vsix` and choose **Install from VSIX…** in the IDE extensions view. Fully quit the IDE and restart using `--remote-debugging-port=0 --remote-debugging-address=127.0.0.1`.
- **CLI:** Extract `antigrative-dashboard-0.9.10.zip` and rerun `python manage.py install-cli` (`python3` on Linux/macOS), including any previously chosen `--language` or `--node` options.

Existing statistics, preferences and IDE extension storage are retained. SHA-256 checksum files accompany both packages.

[Compatibility](https://github.com/ATtacK030130/antigrative-dashboard/blob/main/COMPATIBILITY.md) · [IDE installation](https://github.com/ATtacK030130/antigrative-dashboard/blob/main/ide/README.md)
