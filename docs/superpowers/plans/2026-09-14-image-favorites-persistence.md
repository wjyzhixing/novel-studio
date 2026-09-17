# Illustration Asset Favorites Persistence Plan

**Goal:** Preserve Asset Review favorites between Illustration Studio visits for each project.

**Architecture:** Store only validated stable Asset IDs in bounded local storage keyed by project root. The image sidecar and Main asset index remain authoritative; missing/deleted assets are naturally removed during the existing asset refresh/delete paths.

**Verification:** Test malformed values, ID validation, deduplication and the cap; verify the studio reads/writes the project-scoped store, then run typecheck/build and the image/UI regression suite.

## Tasks

- [x] Add bounded project-scoped favorite storage helpers.
- [x] Load favorites when the active project changes and persist user toggles.
- [x] Keep favorites independent from insertion/reference selection and clear deleted assets.
- [ ] Validate persistence through a real Electron project switch/restart.
