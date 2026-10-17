# Contributing

Thanks for helping. This repository is a DeepSeek Harness bundle, so a change is only complete when the bundle still installs and the tests still pass.

## Setup

```sh
git clone https://github.com/xiangwriter-dev/dsh-screen-control.git
cd dsh-screen-control
node scripts/check.mjs
node --test --test-isolation=none "test/unit/*.test.mjs"
```

No `npm install` is needed: the bundle declares no runtime dependencies on purpose (see [Architecture](docs/architecture.md)).

The tests run with `--test-isolation=none` so they work in hosts that forbid child processes; that flag requires Node 22.8 or newer (the plugin runtime itself only needs Node 20).

## Manual testing

Install the checkout as a bundle into a test profile, then exercise the tools from a chat:

```sh
dsh plugin add /absolute/path/to/dsh-screen-control
```

The live e2e suite moves the mouse briefly:

```sh
DSH_SCREEN_E2E=1 node --test --test-isolation=none "test/e2e/*.test.mjs"
```

## Rules

- Keep the plugin free of `@deepseek-ai/*` imports. Installed bundles are loaded from the profile directory, where those packages are not resolvable; `test/unit/imports.test.mjs` enforces this.
- Keep the JSON Schema of every tool inside the supported subset (`type`, `oneOf`, `properties`, `required`, `additionalProperties`, `items`, `enum`, `const` plus annotations). The tool schema test enforces it.
- Any new input operation must be gated by `ensureInputAllowed` and must check the failsafe before injecting.
- Update `docs/tools.md` and `CHANGELOG.md` with user-visible changes.
- Descriptions state what the plugin does; marketing language is not accepted.

## Reporting bugs

Include the DSH version, the Windows build, the PowerShell version, the tool call and the exact error message. Screenshots help, but redact anything private: captures contain the whole screen.
