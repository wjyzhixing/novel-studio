# Illustration Studio Visual Bible Implementation Plan

**Goal:** Let writers choose existing image assets as persistent Visual Bible references and preserve those Asset IDs on generated image provenance.

**Architecture:** Keep insertion selection and reference selection as independent Renderer state. Use a small pure toggle/limit model for the 20-reference contract, then pass the selected stable Asset IDs through the existing typed image request; no external Provider wire format changes are required.

**Verification:** Unit-test reference toggling and limits, verify bilingual UI keys and the component contract, then run typecheck/build and the existing image/runtime regression suite.

## Tasks

- [x] Add pure reference selection helpers and regression tests.
- [x] Add bilingual Visual Bible labels and a keyboard-accessible reference picker.
- [x] Pass selected reference Asset IDs to `image.generate`, prune deleted/stale IDs on refresh, and preserve insertion selection independently.
- [ ] Complete real Electron visual/provider acceptance when the native Electron binary and provider credentials are available.
