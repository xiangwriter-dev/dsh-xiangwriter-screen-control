# Tool reference

All coordinates are **physical screen pixels** unless `coordinate_space: "image"` is used. Fractions are not accepted; use integers.

Every tool returns its canonical value through the harness tool pipeline. Errors are raised as tool failures with a message and, where the engine supplies one, a code (`E_ARGS`, `E_LOCKED`, `E_NO_DESKTOP`, `E_UIPI`, `E_FAILSAFE`, `E_TIMEOUT`, `E_NOT_FOUND`, `E_FAIL`).

---

## `screen_capture`

Capture the screen, one window, or a rectangle.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `region` | `{x, y, width, height}` | — | Capture only this screen rectangle. Clamped to the virtual screen. |
| `window` | string | — | First visible window whose title contains this text (case-insensitive). |
| `hwnd` | integer | — | Window handle instead of a title match. |
| `max_width` | integer | config `capture.maxWidth` (1600) | Downscale so the image is at most this wide. |
| `format` | `"png"` \| `"jpeg"` | config `capture.format` | Image format. |
| `include_cursor` | boolean | `false` | Draw a crosshair at the cursor position. |

Returns:

```jsonc
{
  "ok": true,
  "path": "C:\\Users\\…\\Temp\\dsh-screen-control\\shots\\shot-….png",
  "mediaType": "image/png",
  "width": 1600,
  "height": 1000,
  "source": { "x": 0, "y": 0, "width": 2560, "height": 1600 },
  "scale": 0.625,
  "cursor": { "x": 1175, "y": 1220 },
  "image": { "attachmentId": "…", "mediaType": "image/png", "bytes": 512345, "width": 1600, "height": 1000, "name": "shot-….png" },
  "note": "optional explanation when no image block was attached"
}
```

- `source` is the screen rectangle that the image covers; `scale = width / source.width`.
- `image` is present only when the routed model accepts image input and the attachment service accepted the bytes.
- The most recent geometry is remembered per session for `coordinate_space: "image"`.

---

## `screen_pointer`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `action` | `move` \| `click` \| `double_click` \| `right_click` \| `middle_click` \| `drag` \| `scroll` | required | Action to perform. |
| `x`, `y` | integer | required | Target position. |
| `to_x`, `to_y` | integer | — | Drag end position (required for `drag`). |
| `duration_ms` | integer | 350 | Drag duration; movement is interpolated every ~16 ms. |
| `amount` | integer | 120 | Wheel delta for `scroll`; 120 is one notch, negative scrolls down. |
| `horizontal` | boolean | `false` | Scroll horizontally. |
| `button` | `left` \| `right` \| `middle` | `left` | Button for click/drag. |
| `coordinate_space` | `screen` \| `image` | `screen` | Interpret coordinates as screen pixels or as pixels of the last capture. |

Returns the action, the resolved target, and the cursor position read back **after** the action:

```jsonc
{ "ok": true, "action": "click", "cursor": { "x": 640, "y": 520 }, "target": { "x": 640, "y": 520 }, "coordinate_space": "screen" }
```

`click` moves the pointer first, then presses and releases. `double_click` sends two clicks 45 ms apart.

---

## `screen_keyboard`

| Parameter | Type | Description |
| --- | --- | --- |
| `action` | `type` \| `key` \| `paste` | Required. |
| `text` | string | Required for `type` and `paste`. `type` sends Unicode code units through `SendInput`; `paste` sets the clipboard, sends `ctrl+v`, then restores the previous text. |
| `keys` | string | Required for `key`. Chord such as `ctrl+s`, `alt+f4`, `enter`, `f5`, `win+r`. At most four keys. |

Returns `{ ok, action, chars }` for text actions, or `{ ok, action: "key", keys }` echoing the normalized chord.

`type` handles `\n` as Enter, `\t` as Tab, and sends every other character as a Unicode key event (CJK and emoji included). Some console hosts prefer `paste`.

---

## `screen_windows`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `action` | `list` \| `focus` | required | Operation. |
| `title` | string | — | For `list`: filter by title substring. For `focus`: target window title substring. |
| `hwnd` | integer | — | Focus this handle instead of a title. |
| `limit` | integer | 60 | Maximum rows returned by `list`. |

`list` returns `{ ok, action, count, windows: [{ hwnd, title, pid, process, x, y, width, height, minimized, foreground }] }`.

`focus` restores a minimized window, calls `SetForegroundWindow` (with an `AttachThreadInput` fallback) and reports the foreground window afterwards.

---

## `screen_ui`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `window` | string | foreground | Title substring of the window to inspect. |
| `hwnd` | integer | — | Handle to inspect. |
| `depth` | integer | 3 | Maximum tree depth. |
| `max_nodes` | integer | 300 | Element budget; the walk stops when it is exhausted. |
| `include_value` | boolean | `false` | Read `ValuePattern.Current.Value` for value controls. |

Returns `{ ok, window: { hwnd, title, process }, nodeCount, maxNodes, tree }` where each node has `type`, `name`, `automationId`, `enabled`, `offscreen`, `rect`, optional `value`, and `children`.

The rendered text is indented and includes rectangles, which can be passed straight to `screen_pointer`.

---

## `screen_wait`

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `for` | `ms` \| `window` | required | What to wait for. |
| `ms` | integer | 500 | Sleep duration for `for: "ms"`. |
| `title` | string | — | Regular expression matched against visible window titles. |
| `timeout_ms` | integer | 5000 | Overall timeout. |
| `poll_ms` | integer | 250 | Poll interval for `for: "window"`. |

Returns `{ ok, for, matched, waitedMs, window? }`. `matched` is `false` on timeout; the call itself does not fail.
