# Sprint 12 Hardening Report

## Verified locally

- `pnpm typecheck`
- `pnpm test`：golden path、migration v2 → v8、security configuration、backup/restore、1000 chapters/100000 facts smoke baseline
- `pnpm run build`
- Renderer uses `contextIsolation`, `nodeIntegration: false`, sandboxed BrowserWindow, CSP, and denies new windows/navigation.
- Provider secrets are OS-encrypted and stored under Electron userData, outside project archives.
- Electron is pinned to `^39.8.10`; the four Electron high-severity advisories reported against 38.x are resolved.

## Remaining gates / known upstream issue

- `pnpm audit --audit-level high` currently reports one high-severity transitive dependency: `electron@39.8.10 → extract-zip@2.0.1`. npm reports no patched version for `extract-zip`; it is used by Electron's install/update packaging path. This remains an upstream dependency exception and must be tracked before a zero-vulnerability release.
- Playwright Electron E2E requires adding/obtaining the Playwright runtime; it is not installed in this workspace.
- macOS/Windows signing, notarization, installer and auto-update verification require platform certificates and CI artifacts.

## Verification note

The local pnpm installation did not create `node_modules/.bin` links, so the successful checks were executed through the installed package entrypoints. The commands and results are equivalent:

- `node node_modules/typescript/bin/tsc --noEmit`
- `node node_modules/vitest/vitest.mjs run` — 20 files / 70 tests passed
- `node node_modules/electron-vite/bin/electron-vite.js build`
