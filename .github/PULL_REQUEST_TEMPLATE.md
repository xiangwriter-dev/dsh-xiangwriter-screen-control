## Summary

<!-- What changes, and why? -->

## Checklist

- [ ] `node scripts/check.mjs` passes
- [ ] `node --test --test-isolation=none "test/unit/*.test.mjs"` passes
- [ ] No `@deepseek-ai/*` import was added
- [ ] New input operations go through `ensureInputAllowed` and the failsafe check
- [ ] `docs/tools.md` and `CHANGELOG.md` are updated for user-visible changes
- [ ] The bundle still installs (`dsh plugin add /absolute/path/to/checkout`)

## Screenshots

<!-- Optional. Redact anything private: captures contain the whole screen. -->
