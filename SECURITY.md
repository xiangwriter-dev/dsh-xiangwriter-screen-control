# Security policy

## Reporting a vulnerability

Please report privately through GitHub's [security advisories](https://github.com/xiangwriter-dev/dsh-xiangwriter-screen-control/security/advisories/new) rather than a public issue. Include the DeepSeek Harness version, the Windows version, the tool call involved, and what an attacker could achieve.

Expect an initial response within a week. This is a volunteer project, so please allow reasonable time before disclosure.

## What this plugin can do

dsh-xiangwriter-screen-control injects real mouse and keyboard input and captures the screen. Treat it as remote control of the logged-in desktop:

- Any tool call that reaches `screen_pointer` or `screen_keyboard` can act with the user's privileges, including in security-sensitive applications.
- Screenshots contain everything visible on screen, with no redaction, and are sent to the configured model provider.
- The approval gate defaults to `ask`, but `inputPolicy: "allow"` removes it. Set `deny` for read-only deployments.
- `Ctrl+Alt+Esc` pauses input for 30 seconds; it is not a process-level kill switch.

## Scope

In scope: injection or escape from the tool layer, approval bypass, unauthorised input, capture of a window the user did not intend, crashes of the harness host caused by malformed engine responses, and command injection through configuration values.

Out of scope: risks inherent in giving an agent desktop control, model provider data handling, and Windows behaviour such as UIPI, secure-desktop restrictions, or DRM-protected capture.
