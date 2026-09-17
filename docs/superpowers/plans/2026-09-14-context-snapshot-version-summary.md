# Context Snapshot Version Summary Plan

**Goal:** Show snapshot format, retrieval, and project schema versions before a user starts Replay.

**Architecture:** Reuse the version fields already present in `ContextSnapshotSummary`; render a localized compact line in each existing snapshot button. Replay and migration behavior remain Main-owned and unchanged.

**Verification:** Add the snapshot version UI/i18n contract, run Context/RightPanel tests, typecheck, build, and diff validation.

## Tasks

- [x] Add bilingual version-summary copy.
- [x] Render version metadata in snapshot entries with existing stable selectors.
- [x] Verify legacy-compatible snapshot fields and current UI build.
- [ ] Validate visual density in real Electron at narrow right-panel widths.
