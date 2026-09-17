# Chapter Autosave Draft Recovery Implementation Plan

**Goal:** Preserve unsaved chapter edits locally and recover a newer draft after reopening the project.

**Architecture:** Store a bounded, project-and-chapter-scoped JSON draft in browser storage as a best-effort crash-recovery layer. Markdown on disk remains authoritative; a newer local draft is surfaced as dirty content and is auto-saved through the existing Main IPC path, then cleared only after the matching save succeeds.

**Verification:** Test malformed/oversized storage, draft restoration, save-state preservation, typecheck, build, and the full single-worker regression suite.

## Tasks

- [x] Add bounded draft storage helpers with safe parse/write/clear behavior.
- [x] Persist edits and restore only a newer draft for the same project/chapter.
- [x] Auto-save restored content and clear the recovery record only after a matching successful save.
- [ ] Validate crash recovery in a real Electron restart path when the native binary is available.
