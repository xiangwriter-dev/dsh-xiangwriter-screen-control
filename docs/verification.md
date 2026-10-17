# Verification

This document records what was actually exercised on the development machine and what remains manual. It is a snapshot, not a claim about every Windows configuration.

## Environment

| Item | Value |
| --- | --- |
| OS | Windows 11 (build 22621) |
| Shell available to the harness | Windows PowerShell 5.1.22621.5697 (no `pwsh` 7 on PATH) |
| Desktop session | 79, interactive, single 2560×1600 monitor at 125% scaling (DPI 120) |
| Node | v24.18.0 |
| DeepSeek Harness | 0.2.1-rc.2, profile `desktop` |
| Plugin | `dsh-screen-control` 0.1.0, installed from the local checkout |

## Static and unit checks

```text
$ node scripts/check.mjs
check: 19 modules, manifest and resources look consistent

$ node scripts/run-tests.mjs     # --sandboxed in a confined host
tests 25, pass 25
```

Coverage: protocol encoding/framing, coordinate mapping, chord validation, configuration defaults and rejection, tool schema subset, argument validation, and a self-containment check that no module imports a bare package specifier.

## Engine self-test

```text
$ powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/screen-control.ps1 -SelfTest
{"ok":true,"info":{"interactive":true,"sessionId":79,"dpi":120,"virtualScreen":{"x":0,"y":0,"width":2560,"height":1600},…},
 "capture":{"mediaType":"image/png","width":1600,"height":1000,"source":{…},"scale":0.625,"path":"…\\shot-….png"}}
```

The saved file starts with the PNG signature `89 50 4E 47` and was 1.68 MB at 1600×1000.

## Live plugin checks (installed in the running harness)

Install result:

```json
{ "stage": "enable", "target": "dsh-screen-control", "application": "applied",
  "warnings": [], "bundle": "dsh-screen-control", "version": "0.1.0" }
```

| Check | Command | Result |
| --- | --- | --- |
| Tools registered | tool list after install | `screen_capture`, `screen_pointer`, `screen_keyboard`, `screen_windows`, `screen_ui`, `screen_wait` |
| Screenshot | `screen_capture {max_width: 800, include_cursor: true}` | 800×500 PNG, source 2560×1600, scale 0.3125; image block committed as an attachment (`sha256:60eafa89…`) |
| Window list | `screen_windows {action: "list", limit: 10}` | 10 rows with titles, process names (`DeepSeek Harness`, `msedge`, `explorer`, …), rectangles and flags |
| UI Automation | `screen_ui {depth: 2, max_nodes: 30}` | 4-element tree for the foreground window with rectangles |
| Cursor move | `screen_pointer {action: "move", x: 1185, y: 1210}` | engine read the cursor back at exactly `1185,1210` |
| Key chord | `screen_keyboard {action: "key", keys: "win"}` | Start menu opened (verified by the next screenshot) |
| Unicode typing | `screen_keyboard {action: "type", text: "计算器 测试 ABC"}` | the text appeared in the focused input field (verified by screenshot), then `ctrl+a` + `delete` cleared it and the field returned to its placeholder |
| Wait (ms) | `screen_wait {for: "ms", ms: 120}` | returned after ≥ 120 ms |
| Wait (window) | `screen_wait {for: "window", title: "记事本"}` | timed out after 8.2 s, returning `matched: false` (no such window existed) |

Evidence images were returned to the model as real image blocks, which also verifies the attachment path end to end.

## Reload and window targeting

A live defect was found during this verification and fixed in the same change:

- `screen_capture { window: "…" }` matched nothing and silently captured the foreground window, because the engine resolved windows only from a `title` argument while the capture tool sends `window`. `Get-WindowByRef` now accepts both.
- Reloading the running plugin (**Settings → Plugins** toggle, or `set_plugin enabled: false` followed by `true`) applies engine fixes: after the toggle, `screen_capture { window: "…" }` captured the matched window's rectangle and an unmatched title returned `E_NOT_FOUND: no visible window title contains 'no-such-window-xyz-123'`.
- The toggle itself exercised the dispose path: the disabled row stopped the worker and removed the tools, and enabling it re-registered all six tools and the system-prompt section (`application: applied` both ways, no warnings).

## What the automated e2e covers

`test/e2e/tools.test.mjs` (with `DSH_SCREEN_E2E=1`) drives the real engine through all six tools: capture + PNG signature, cursor move and read-back, image→screen coordinate mapping, window enumeration, UIA tree, wait, and an invalid chord that must be rejected before reaching the engine.

Inside an externally sandboxed shell (the harness's own command sandbox) the cursor cannot be moved — `SetCursorPos` fails — so the e2e suite passes only when run from an unrestricted process, which is exactly where the plugin runs. The sandboxed run is expected to fail the three input assertions and to pass capture, windows, UIA and wait.

## Not yet exercised automatically

These need a human or a disposable machine and are documented rather than claimed:

- The approval card itself: in the development session the first input call was granted without an observable prompt (the session's approval policy answered it), so the rejection path and the card rendering still need a fresh session with `inputPolicy: "ask"`. Later in the same session the approval policy was switched to `never` and input kept working because the per-session grant was already cached — a fresh session under `never` should be expected to reject input.
- The `Ctrl+Alt+Esc` failsafe: requires holding the chord while an input call happens.
- Elevated (administrator) target windows: expect `E_UIPI`.
- A locked workstation (secure desktop): expect `E_LOCKED`.
- Multi-monitor negative origins: implemented and unit-tested, not exercised on real hardware here.
- Long-lived worker restart after a crash and idle exit: implemented with a restart budget; only the happy path was observed live.
