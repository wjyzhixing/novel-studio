# Asset Image Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make chapter images render when their filename differs from their stable `asset_*` ID, while preserving the original Markdown path on save.

**Architecture:** The Markdown converter resolves an asset ID from the image title first and filename second. It carries both the stable ID and source path as HTML data attributes; Turndown uses the source path when present and falls back to the stable-ID filename for legacy HTML.

**Tech Stack:** TypeScript, MarkdownIt, Turndown, Vitest.

## Global Constraints

- Markdown remains the canonical on-disk chapter format.
- Existing `asset_*` filename references remain compatible.
- No image bytes are embedded in Markdown.

---

### Task 1: Preserve asset identity and source paths during conversion

**Files:**
- Modify: `src/renderer/src/lib/markdown.ts:23-54`
- Create: `tests/markdown.test.ts`

**Interfaces:**
- `markdownToHtml(source: string, projectRoot?: string): string` emits `data-asset-id` and `data-asset-path` for project asset references.
- `htmlToMarkdown(html: string): string` prefers `data-asset-path`, retaining legacy fallback behavior.

- [x] **Step 1: Write the failing tests**

Test that a Chinese-named image with its stable ID in the Markdown title becomes hydratable HTML, and that its HTML round trip keeps the original path. Also test legacy `asset_*` filenames.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `node_modules/.bin/vitest run tests/markdown.test.ts --reporter=verbose`

Expected: the title-based asset ID is missing and the original Chinese path is not preserved.

- [x] **Step 3: Implement the minimal conversion fix**

Read the asset ID from the title before the filename, emit the original path in `data-asset-path`, and let Turndown use that path when rebuilding the Markdown image reference.

- [x] **Step 4: Run the focused tests and verify they pass**

Run: `node_modules/.bin/vitest run tests/markdown.test.ts --reporter=verbose`

Expected: all focused Markdown conversion tests pass.

- [x] **Step 5: Run broader verification**

Run: `npm run typecheck` and `npm run build`.

Expected: both commands complete successfully; unrelated pre-existing test failures are not changed by this fix.

> Evidence (2026-09-04): `tests/markdown.test.ts` covers title-based IDs, original Chinese asset paths, legacy `asset_*` filenames, and round-trip fidelity. Focused tests, `npm run typecheck`, and `npm run build` pass; runtime/UI contract checks also confirm asset hydration remains behind typed IPC.
