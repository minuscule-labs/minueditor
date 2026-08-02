# HackMD and OpenKnowledge roadmap progress

This document is the implementation ledger for product ideas adapted from the HackMD and OpenKnowledge reviews.

- **Integration branch:** `feat/hackmd-openknowledge-roadmap`
- **Product plan:** MinuNotes note `note_73a3afed52cc4ae197056d59e34d351c`
- **Consumer-facing release notes:** [`CHANGELOG.md`](../CHANGELOG.md), under **Unreleased**

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
| 1 | GitHub-style alerts/callouts | MinuEditor | Planned | Portable blockquote syntax; live/source/static parity |
| 1 | Code-language completion | MinuEditor | Planned | Aliases, suggestions, unsupported state |
| 1 | Rich paste | MinuEditor | Planned | Browser/Docs/Notion/spreadsheet fixtures required |
| 1 | Footnotes | MinuEditor | Planned | Navigation, diagnostics, accessible backlinks |
| 2 | Shared diagnostics contract | Shared | Planned | Editor, MinuNotes UI, harness, and MCP schema |
| 2 | Problems panel | MinuNotes | Planned | Host-owned panel using shared diagnostics |
| 2 | Structured write advisories | MinuNotes | Planned | Non-fatal create/edit response advisories |
| 2 | Editor/static parity fixtures | MinuEditor | Planned | Code, table, task, quote, link, image fixtures |
| 2 | Static code-block shell | MinuEditor | Planned | Language, Copy, overflow, fallback, async safety |
| 3 | Minimal rich-block lifecycle | MinuEditor | Planned | Derived from callouts, Mermaid, and math—not designed in advance |
| 3 | Mermaid | MinuEditor | Planned | Lazy, safe, cancellable, editable source fallback |
| 3 | Math | MinuEditor | Planned | Documented delimiters, lazy rendering, accessibility |
| 3 | Host-resolved media cards | Shared | Deferred | No arbitrary editor-side network fetching |
| 3 | CSV/TSV preview | MinuEditor | Deferred | Reuse table display after rich-block proof |
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

## Next package

**GitHub-style alerts/callouts** is next, but it should begin only after the heading package is committed as its own reviewable commit.
