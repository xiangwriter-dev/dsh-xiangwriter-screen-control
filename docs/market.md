# Plugin market (Discover)

DeepSeek Harness 0.2.1-rc.2 exposes its plugin market as an optional bundle,
`@deepseek-ai/dsh-experimental-plugin-market-bundle` (official, disabled by
default). When it is enabled, the Web UI gains a Discover tab backed by the
`pluginMarket` service.

## How the market works

- A market is **an index URL you configure**. The service's `indexes` setting
  defaults to an empty list; this build ships no first-party index.
- An index is a JSON document in **format 1**, validated by
  `@deepseek-ai/dsh-plugin-market-index` when it is fetched.
- Each plugin version declares its source: `npm` (`name@version`) or `git`
  (a canonical `https` repository URL pinned to a 40-character commit). The
  market turns a version into an install spec and hands it to the same plugin
  manager that `dsh plugin add` uses.
- Indexes are fetched with `redirect: "error"`, so the URL must answer 200
  directly (raw GitHub does) and must be http(s) without credentials or a
  fragment.

## This repository's index

[`market/index.json`](../market/index.json) is a one-plugin index:

```json
{
  "format": 1,
  "title": { "en": "Xiangwriter DSH plugins", "zh": "xiangwriter 的 DSH 插件" },
  "metadata": { "categories": { "tools": { "title": { "en": "Tools", "zh": "工具" } } } },
  "plugins": [
    {
      "name": "dsh-xiangwriter-screen-control",
      "icon": "../icon.svg",
      "metadata": { "category": "tools", "keywords": ["computer-use", "windows"] },
      "versions": [
        {
          "version": "0.1.1",
          "publishTimestamp": 1792259662,
          "source": {
            "type": "git",
            "url": "https://github.com/xiangwriter-dev/dsh-screen-control",
            "commit": "c733f74624536d5d07ebb3f7cf7ba2ee6261a895"
          }
        }
      ]
    }
  ]
}
```

The relative `icon` resolves against the index URL, so it must be served over
https (raw GitHub is).

### Enable Discover and add the index

1. Settings → Plugins → enable **Plugin market** (the experimental bundle).
2. Open Discover → add the index URL:
   `https://raw.githubusercontent.com/xiangwriter-dev/dsh-screen-control/main/market/index.json`
3. The **Screen Control** entry appears with its icon and description; Install
   runs the pinned git spec through the plugin manager.

Enabling the bundle is reversible (disable the row in Settings → Plugins), and
the index can be removed from the same Discover settings.

## Publishing a new version

1. Bump `version` in `package.json`, commit, and tag `v<version>`.
2. Wait for the Release workflow; it uploads `dsh-xiangwriter-screen-control.tgz`.
3. Update `market/index.json`:
   - add (or replace) the `versions[]` entry with the new `version`,
   - set `publishTimestamp` to the current Unix time in seconds,
   - set `source.commit` to the **full 40-hex commit** the tag points at
     (`git rev-parse 'vX.Y.Z^{commit}'`).
4. Run `node scripts/check-market-index.mjs` and push.

Old versions stay in the list; the market sorts them by SemVer and shows the
installed/update-available state per profile.

## Validation

`scripts/check-market-index.mjs` mirrors the rules the harness enforces (format
version, localized `en` text, declared categories/labels/sort keys, SemVer and
timestamp, canonical git sources, icon resolution). It is not a substitute for
the harness parser, but CI runs it on every push so a malformed index fails
before it reaches a user's Discover tab.

## Is there an official store to submit to?

Not in this build. The market package's `indexes` default is empty and there is
no public submission flow in the shipped packages; listing in a DeepSeek-hosted
index would require the DeepSeek team to curate it. The practical route today
is the community list ([awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin),
entry prepared in `awesome-plugin-entry.yml`), plus this self-hosted index for
Discover.
