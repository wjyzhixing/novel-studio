# Desktop Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add repeatable Windows NSIS and macOS DMG packaging commands for Novel Studio.

**Architecture:** Keep `electron-vite build` as the application build layer and use `electron-builder` as the packaging layer. Package the generated `out/` directory plus the existing `assets/` directory, with platform-specific targets selected by explicit npm scripts.

**Tech Stack:** Electron 38, electron-vite 4, electron-builder, npm scripts, existing PNG application icon.

## Global Constraints

- Installer artifacts are written to `release/`.
- Windows target is x64 NSIS.
- macOS target is DMG for the current machine architecture.
- Packaging is unsigned by default; signing and notarization remain out of scope.
- User projects, `demo/`, tests, development caches, and `node_modules/` are excluded from packaged files.

### Task 1: Add packaging dependency and builder configuration

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [x] Add `electron-builder` as a development dependency and scripts `dist`, `dist:win`, and `dist:mac`.
- [x] Configure the builder to use `out/main/index.js` as the packaged entry, include `out/**/*` and `assets/**/*`, exclude development-only files, and write artifacts to `release/`.
- [x] Configure `win.target` as `nsis` with `x64`, and `mac.target` as `dmg`.
- [x] Add `release/` to `.gitignore`.

### Task 2: Verify application build and packaging metadata

**Files:**
- Test: `package.json` scripts and builder configuration

- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Run `npm run dist:mac` and verify a `.dmg` exists in `release/`.
- [x] Run a non-producing builder configuration inspection for the Windows target and verify it resolves to NSIS x64.

> Evidence (2026-09-04): `npm run verify:packaging` resolved `windows → nsis` with `x64`, `macTarget: dmg`, and the local Electron distribution. After configuring `electronDist: node_modules/electron/dist`, `npm run dist:mac` completed successfully and generated `release/Novel Studio-0.1.0-arm64.dmg` (115 MB) plus its block map. The artifact is unsigned because no valid Developer ID identity is installed on this machine.

### Task 3: Document usage and handoff

**Files:**
- Modify: `README.md` if it contains project run instructions; otherwise leave it unchanged.

- [x] Document the three packaging commands and note that unsigned macOS builds may require the user to approve the app in macOS security settings.
- [x] Report generated artifact paths and any platform limitation observed on the current machine.

> Current platform limitation: this macOS arm64 machine cannot validate the Windows installer locally. macOS DMG packaging is verified; signing and notarization remain intentionally out of scope until Apple Developer credentials are available.
