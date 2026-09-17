# Context Replay Difference Summary Implementation Plan

**Goal:** Make Context Replay drift understandable at a glance while retaining per-source evidence.

**Architecture:** Summarize the existing typed `ContextReplayDifference[]` in a pure Renderer helper. RightPanel renders the counts for added/removed/changed sources and the net token delta above the existing detailed list; no snapshot or replay semantics change.

**Verification:** Test complete and missing token measurements, verify stable UI selectors and bilingual labels, then run typecheck/build and the existing Context/RightPanel regression suite.

## Tasks

- [x] Add pure difference-summary model and tests.
- [x] Render summary chips alongside the detailed source-level diff.
- [x] Add bilingual labels and responsive wrapping styles.
- [ ] Validate the visual hierarchy in real Electron at multiple widths.
