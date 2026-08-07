# HackMD and OpenKnowledge roadmap progress

This document is the implementation ledger for product ideas adapted from the HackMD and OpenKnowledge reviews.

- **Active package branch:** `main`
- **Product plan:** MinuNotes note `note_73a3afed52cc4ae197056d59e34d351c`
- **Consumer-facing release notes:** [`CHANGELOG.md`](../CHANGELOG.md), under **0.12.0**

## Tracking rules

1. Keep one row per bounded work package.
2. Record implementation detail and verification here.
3. Record only consumer-visible additions, changes, fixes, and migrations in `CHANGELOG.md`.
4. Do not mark a package complete until automated checks pass and required manual review is approved.
5. Keep unrelated cleanup outside this branch unless it is required by an active package.
6. Use separate commits per work package so changes can be reviewed or reverted independently.

## Status legend

- **Planned** — accepted in the roadmap but not started.
- **In progress** — implementation is active.
- **Ready for review** — automated checks pass; human review remains.
- **Complete** — implementation and required review are complete.
- **Blocked** — a dependency or decision prevents safe progress.
- **Deferred** — intentionally postponed.

## Work packages

| Phase | Work package | Owner | Status | Review/evidence |
| --- | --- | --- | --- | --- |
| 1 | Heading outline and anchors | MinuEditor | Complete | 220 tests; typecheck; build; dist verification; manual demo approved |
| 1 | GitHub-style alerts/callouts | MinuEditor | Complete | 231 tests; typecheck; build; dist verification |
| 1 | Code-language completion | MinuEditor | Deferred | Lower current value; revisit with diagnostics or user demand |
| 1 | Rich paste | MinuEditor | Complete | 260 tests; browser/Docs/Notion/spreadsheet fixtures; manual review approved |
| 1 | Footnotes | MinuEditor | Deferred | No current demand; unsupported syntax remains editable Markdown |
| 2 | Shared diagnostics contract | Shared | Planned | Editor, MinuNotes UI, harness, and MCP schema |
| 2 | Problems panel | MinuNotes | Planned | Host-owned panel using shared diagnostics |
| 2 | Structured write advisories | MinuNotes | Planned | Non-fatal create/edit response advisories |
| 2 | Editor/static parity fixtures | MinuEditor | Complete | 243 tests; typecheck; build; dist verification; manual review approved |
| 2 | Static code-block shell | MinuEditor | Planned | Language, Copy, overflow, fallback, async safety |
| 2 | Cursor and viewport stability | MinuEditor | Complete | 245 tests; typecheck; build; dist; approved |
| 2 | Rich-widget viewport stability | MinuEditor | Complete | 280 tests; manual review approved; scroll snapshots; stress lab |
| 3 | Minimal rich-block lifecycle | MinuEditor | Complete | Cancellable serialized lifecycle; 274 tests; manual review approved |
| 3 | Mermaid | MinuEditor | Complete | Lazy strict renderer; parity and StrictMode fixes approved |
| 3 | Math | MinuEditor | Planned | Documented delimiters, lazy rendering, accessibility |
| 3 | Host-resolved media cards | Shared | Deferred | No arbitrary editor-side network fetching |
| 3 | CSV/TSV preview | MinuEditor | Deferred | Reuse table display after rich-block proof |
| 4 | Annotation visual alignment | MinuEditor | Complete | 231 tests; typecheck; callout-compatible semantic styling |
| 4 | Controlled comments v1 | Shared | Complete | 292 tests; manual review approved; versioned anchors; host adapter |
| 4 | Agent activity summaries and diffs | MinuNotes | Planned | Existing actor/event/version data first |
| 4 | Rollback and actor filtering | MinuNotes | Planned | No CRDT dependency |
| 4 | Graph-health audits | MinuNotes | Planned | Dead/ambiguous links, hubs, permission-safe audits |
| 4 | Optional enriched briefings | MinuNotes | Planned | Opt-in context to control token cost |
| 5 | Version comparison and named checkpoints | MinuNotes | Planned | Current-to-version and version-to-version |
| 5 | Folder export/import | MinuNotes | Planned | Markdown, assets, link manifest, ID reconciliation |
| 5 | GitHub snapshot export | MinuNotes | Planned | Precedes bidirectional synchronization |
| 5 | Bidirectional Git sync | MinuNotes | Deferred | Evaluate after export/import rules are proven |
| 5 | Publishing and permalinks | MinuNotes | Deferred | Separate lifecycle from unlisted shares |

## Change log

### 2026-08-02 — Heading outline and anchors

**Status:** Complete

Added:

- `MarkdownHeading` and `MarkdownHeadingLevel` public types.
- `getMarkdownHeadings(state)` for configured CodeMirror states.
- `parseMarkdownHeadings(markdown)` for host-owned outline UIs.
- `slugifyMarkdownHeading(text)` with Unicode-aware normalization.
- Collision-safe duplicate anchors.
- `MarkdownEditorHandle.getHeadings()` and `goToHeading(slug)`.
- Development outline review surface with active section, navigation, copy-anchor behavior, duplicate headings, dark theme, and responsive layout.
- Focused heading parser and handle tests.

Verification:

- `npm test -- --run` — 220 tests passed across 7 files.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.
- Manual review — approved.

Files:

- `src/headings.ts`
- `src/headings.test.ts`
- `src/MarkdownEditor.tsx`
- `src/MarkdownEditor.test.tsx`
- `src/index.tsx`
- `dev/App.tsx`
- `dev/dev.css`
- `README.md`
- `CHANGELOG.md`

### 2026-08-02 — GitHub-style alerts/callouts

**Status:** Complete

Implemented scope:

- Portable `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION` syntax.
- Live callout lines with source reveal on the marker line.
- Static renderer enhancement with accessible labels.
- Slash commands for all supported types.
- Theme variables, malformed fallback, focused tests, and a live/static parity demo.
- Visual-review fixes for static variant-color specificity and editor list-marker gutter compatibility.

Verification:

- `npm test -- --run` — 231 tests passed across 8 files, including wikilink composition and static literal fallback.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review approved for live/source behavior, static parity, semantic colors, and annotation alignment.

### 2026-08-02 — Annotation visual alignment

**Status:** Complete

Direction:

- Reuse the callout tinted-surface and semantic-color language for line comments and generic change highlights.
- Place review accents on the right so annotations remain distinguishable from authored callouts and can coexist on the same line.
- Use comment/generated/added/updated/deleted kind colors; actor identity remains metadata rather than overriding semantic color.
- Keep source-range annotations as compact inline highlights.

Verification:

- `npm test -- --run` — 231 tests passed across 8 files.
- `npm run typecheck` — passed.
- `git diff --check` — passed.

Manual review approved; further annotation polish is deferred until after the broader roadmap effort.

### 2026-08-02 — Editor/static parity fixtures

**Status:** Complete

Implemented:

- Canonical shared fixtures for inline formatting/links, lists/tasks/quotes, callout composition, tables/code, and media/safe fallbacks.
- Semantic DOM assertions for both live editor and static renderer paths.
- Explicit coverage for intentional static wikilink and annotation differences.
- Source-mode portability and initial-render source-mutation checks.
- Consolidated fixture selector and side-by-side visual review surface.
- Review and extension guidance in `docs/editor-static-parity.md`.

Verification:

- `npm test -- --run` — 243 tests passed across 9 files.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review approved after confirming the package benefit and visual fixture surface.

### 2026-08-02 — Revised package sequence

**Approved sequence:** editor/static parity fixtures → rich paste → Mermaid with a minimal expandable rich-block lifecycle.

Decisions:

- Defer code-language completion and footnotes until user demand or diagnostic evidence justifies them.
- Keep unsupported Markdown editable rather than adding speculative UI.
- Use semantic DOM assertions and a consolidated visual surface for parity; avoid brittle pixel snapshots.
- Derive the rich-block lifecycle from callouts and Mermaid before adapting it to math, CSV previews, or host-resolved media.
- Execute and review each package separately; do not advance automatically.

### 2026-08-02 — Cursor and viewport stability audit

**Status:** Complete

Implemented:

- Replaced full-document controlled-value synchronization with a minimal common-prefix/common-suffix change.
- Tagged prop-driven changes so they do not echo through `onChange`.
- Excluded external synchronization from local undo history.
- Added a 120-line regression proving that an insertion near the top keeps a cursor attached to its original line-100 content.
- Recorded performance findings and measured follow-up candidates in MinuNotes: `note_25c12e115f6b4f7a990b4414224f6cb4`.

Verification:

- `npm test -- --run` — 245 tests passed across 9 files.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review approved with further performance candidates deferred to later bounded packages.

### 2026-08-02 — Rich paste

**Status:** Complete

Implemented:

- Default safe HTML-to-Markdown conversion for headings, formatting, links, lists, quotes, tables, and fenced code.
- Tab-delimited spreadsheet conversion with header generation, uneven-row padding, and pipe escaping.
- Exact recognized-Markdown preservation by bypassing HTML conversion.
- Cmd/Ctrl+Shift+V plain-text escape hatch.
- `richPaste` configuration for complete or per-path opt-out.
- Existing URL behavior and host-owned image upload precedence.
- Active-content, unsafe-link, embed, and HTML-only-image rejection.
- Shared browser, Google Docs, Notion, spreadsheet, and existing-Markdown fixtures.
- Development rich-paste lab and public documentation.

Verification:

- `npm test -- --run` — 260 tests passed across 10 files.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review approved.

### 2026-08-02 — Mermaid and minimal rich-block lifecycle

**Status:** Complete

Implemented:

- Opt-in `mermaid` configuration for `MarkdownEditor` and `MarkdownRenderer`.
- Dynamically imported Mermaid engine with fixed strict security and host-selectable visual theme.
- Closed-fence matching with ordinary-code fallback for disabled, malformed, unclosed, or unsupported syntax.
- Inactive live preview and explicit exact-source editing.
- Static and read-only rendering parity, including React StrictMode effect replay cleanup/restart.
- Loading, ready, bounded error, and source-fallback surfaces.
- Cancellable async lifecycle that suppresses stale results and serializes Mermaid's singleton renderer across editor/static surfaces.
- Mermaid slash command and development live/source/static demo.
- Stable configuration derivation to avoid compartment/effect churn from equivalent inline config objects.
- Internal lifecycle boundary and future-block review criteria in `docs/rich-block-lifecycle.md`.

Verification:

- `npm test -- --run` — 274 tests passed across 12 files.
- `npm run typecheck` — passed.
- `npm run build` — passed with Mermaid emitted as lazy chunks.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review approved after fixing singleton concurrency and React StrictMode static-renderer restart behavior.

### 2026-08-02 — Rich-widget viewport stability

**Status:** Complete

Implemented:

- Preserve the editor scroller snapshot while table/code widgets enter or leave editing state.
- Preserve the scroll anchor while nested table/code edits synchronize portable Markdown back to the parent editor.
- Focus nested widget controls with `preventScroll` so browser page scrolling does not override CodeMirror anchoring.
- Add table/code/Mermaid scroll-anchor regressions and a long-note manual stress surface with cursor line, selection, and scroll telemetry.
- Move upward by source position after entering text below a final code widget, avoiding stale replacement-widget geometry.

Verification:

- `npm test -- --run` — 280 tests passed across 13 files.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review confirmed the reported final-code-block Arrow Up jump is fixed.

### 2026-08-04 — Controlled comments v1

**Status:** Complete

Approved scope:

- Host-owned comment records, persistence, actors, permissions, and network behavior.
- Selection-to-comment requests and whole-line comment actions from MinuEditor.
- Inline source-range anchors with compact count-free right-gutter icons.
- Multiple independent, overlapping, or same-line comments with complete quoted-anchor cards.
- Attached-card navigation to source ranges and host-formatted timestamps.
- Simple controlled side-panel text editing, with `showPanel: false`, `onRequest`, and line-level `onSelectGroup` for host-owned popovers.
- Create, edit, resolve/reopen, and delete callbacks.
- Versioned `range` and `line` anchors: range quotes detach when changed, while whole-line anchors follow line edits until their source is removed.
- Local CRUD development demo proving the MinuNotes adapter boundary.
- No replies, mentions, reactions, suggested edits, or AI-specific wrapper.
- Keep `DocumentAnnotation` generic for diagnostics and future revision-derived diff review.

Verification:

- `npm test -- --run` — 292 tests passed across 13 files.
- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm run verify:dist` — passed.
- `git diff --check` — passed.

Manual review approved the controlled API, whole-line actions, grouped cards with quoted anchors, anchor tradeoffs, source navigation, timestamps, and the host-popover boundary. Release approval was given for v0.12.0.

## Next package

Choose the next bounded package explicitly; revision-based diff review remains a candidate but has not started.
