# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-10-17

### Changed

- The GitHub repository was renamed to **`xiangwriter-dev/dsh-xiangwriter-screen-control`** (GitHub redirects the old URL). Manifest links, badges, clone/install commands, the market index URL and the awesome-dsh-plugin entry now use the new repository. The package name, bundle row id and the six tool names are unchanged.

## [0.1.1] - 2026-10-17

### Changed

- The package is now published as **`dsh-xiangwriter-screen-control`** (was `dsh-screen-control`). Update any profile dependency, market index, or documentation that names the old package. The bundle row id (`screen-control`) and the six tool names are unchanged.
- The release asset is now `dsh-xiangwriter-screen-control.tgz`; the installation commands and the market index point at the new name.

## [0.1.0] - 2026-10-17

### Added

- Six agent tools: `screen_capture`, `screen_pointer`, `screen_keyboard`, `screen_windows`, `screen_ui`, `screen_wait`.
- Long-lived Windows PowerShell 5.1 worker with a JSON-lines protocol, request serialization, per-call timeouts, restart budgeting and a one-shot fallback for hosts that forbid piped stdio.
- GDI/`PrintWindow` capture with downscale, JPEG quality, cursor crosshair and per-session image geometry.
- `SendInput` mouse and Unicode keyboard injection, key chords, clipboard paste with restore.
- Window enumeration with process names, focus with an `AttachThreadInput` fallback.
- UI Automation tree snapshots (type, name, automation id, rectangle, state, value).
- Approval gating (`inputPolicy: ask | allow | deny`) and a `Ctrl+Alt+Esc` input failsafe.
- Image-capable route detection and durable image attachments; text-only routes receive the file path and metadata.
- Locale metadata (English, Chinese), icon, bundle patch, CI, release workflow and an awesome-dsh-plugin entry generator.

[Unreleased]: https://github.com/xiangwriter-dev/dsh-xiangwriter-screen-control/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/xiangwriter-dev/dsh-xiangwriter-screen-control/releases/tag/v0.1.2
[0.1.1]: https://github.com/xiangwriter-dev/dsh-xiangwriter-screen-control/releases/tag/v0.1.1
[0.1.0]: https://github.com/xiangwriter-dev/dsh-xiangwriter-screen-control/releases/tag/v0.1.0
