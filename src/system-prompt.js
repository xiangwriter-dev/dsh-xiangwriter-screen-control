/** System-prompt guidance for the screen tools. */
export const SCREEN_CONTROL_PROMPT = [
  'Screen Control tools (screen_*) drive this Windows desktop through a real mouse, keyboard and screen capture.',
  'Coordinates are physical screen pixels. screen_capture reports the captured screen rectangle (source) and the image scale; when you pick a pixel from the image, pass coordinate_space: "image" so the plugin converts it back to screen pixels.',
  'Act in small steps: capture, decide, act, then capture again to verify. Never assume a click or keystroke landed.',
  'Prefer screen_ui to read control names and rectangles over guessing pixel positions; use screen_windows to find and focus the target window first.',
  'Desktop input may require the user\'s approval, and the user can hold Ctrl+Alt+Esc to stop input for 30 seconds.',
  'Do not type secrets or press destructive shortcuts unless the user explicitly asked for them.',
].join(' ')
