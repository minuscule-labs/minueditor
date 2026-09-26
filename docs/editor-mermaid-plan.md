# Editor-only plan: rich-block stability and comment affordances

Status: **chunk 1 implemented on `fix/mermaid-widget-flicker`; chunk 2 awaits a separate API/UX decision**.

Source: MinuNotes “Observations 9-17-26” and the discussion of confirmed flicker and comments on diagrams/code snippets. This plan applies only to `@dpklabs/minueditor` in this repository; it does not change the MinuNotes app or API.

## Scope and order

### 1. Fix the confirmed Mermaid flicker (first implementation chunk)

- [x] Add a failing regression test with a styled bullet above a rendered Mermaid fence; verify the unchanged diagram stays mounted, its render function is not called again, and zoom state persists. Assert changed diagram source *does* render again.
- [x] Investigate CodeMirror widget comparison: absolute `from`/`to` offsets invalidated the surface after an earlier edit.
- [x] Preserve the unchanged widget DOM, and resolve the current source offset from its DOM position when “Edit source” is clicked rather than using a stale captured offset.
- [x] Cover shifted source navigation and two identical diagrams in unit tests; test real typing, zoom state, and Edit source in Chromium and Firefox.
- [ ] Check whether the ordinary fenced-code widget has the same remount behavior when text above it changes. Its equality also compares offsets, but that is a **separate follow-up**, not a confirmed bug fixed here.

Expected files: `src/extensions/mermaid.ts`, `src/extensions/mermaid.test.tsx`, possibly `src/MarkdownEditor.test.tsx` and a new `e2e/mermaid-stability.spec.ts` for real-browser coverage; if a code-block regression is confirmed, `src/extensions/codeblock/widget.ts` and a relevant code-block test. No MinuNotes files.

Verification: `npm run typecheck`, `npx vitest run src/extensions/mermaid.test.tsx src/MarkdownEditor.test.tsx`, `npm run test:browser` (including the new browser case if needed), and `npm run build`. Compare mount identity and render counts; a screenshot alone is not sufficient.

Done when: typing or styling an earlier bullet no longer resets an unchanged rendered diagram; source edits still re-render; “Edit source” navigates correctly after preceding text changes; editor tests and build pass.

### 2. Design/editor-only prototype for comments on rich blocks (separate checkpoint)

- [ ] Specify an accessible “Comment on block” action for inactive Mermaid diagrams and ordinary fenced-code widgets that requests an anchor covering the source block. Use the existing controlled `comments.onRequest` model where possible; do not create comment records inside MinuEditor.
- [ ] Decide whether the existing `range`/`line` anchor contract can express a **whole-block** anchor reliably. Test mapping when a block moves, changes internally, is deleted, or becomes ambiguous. If it cannot, propose a typed additive API rather than silently redefining range-anchor semantics.
- [ ] Prototype only after the API decision is reviewed. Confirm actions are keyboard reachable, do not steal focus from Edit source/copy/pan, and work with `showPanel: false` (the mode used by a host-owned comment UI).
- [ ] Document the host contract and add tests for anchor offsets, callbacks, and disabled/read-only behavior. Mark persistence and reattachment after source changes as **not complete** until MinuNotes adopts/supports the contract.

Potential files, contingent on the API decision: `src/types.ts`, `src/MarkdownEditor.tsx`, `src/extensions/mermaid.ts`, `src/extensions/codeblock/widget.ts`, `src/extensions/comments.ts`, associated tests (`src/extensions/mermaid.test.tsx`, `src/MarkdownEditor.test.tsx`), and `docs/comments.md` / `README.md`. Keep this separate from the flicker fix.

Verification: focused callback/keyboard/anchor tests, full editor typecheck and test suite, browser tests for rich-block interaction, build. Do not claim the MinuNotes comment UX works until separately verified in the host.

## Explicitly out of scope for this editor run

- MinuNotes OAuth checkboxes, comment-dialog placement, review-panel sizing, Markdown rendering of **host-owned** comment bodies, blank-note cleanup, templates, shared folders, folder cloning/moving, key rotation, and per-page Open Graph tags.
- Exports/backups and S3: **deferred to a later update run** as requested.
- Individual Mermaid element anchoring and cross-repository persistence/reattachment: defer pending the whole-block contract and host integration.

## Approval gates

1. Chunk 1 approved and implemented; review its regression evidence before starting chunk 2.
2. Clarify the block-comment UX and anchor semantics before implementing chunk 2.
3. Approve any new comment-anchor API and a separate MinuNotes integration plan before shipping rich-block commenting as a user-facing feature.
