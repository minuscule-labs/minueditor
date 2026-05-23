# Changelog

## 0.3.0

- Added public editor-state reporting with `MarkdownEditorState` and `onStateChange`.
- Added `baselineValue` support for explicit dirty-state tracking.
- Added `getState()` and `markClean()` to the editor ref handle.
- Added tests for dirty state, selection/active-line state, read-only state, and ref state APIs.

Verified with release checks.

## 0.2.2

- Fixed heading decoration rendering when markdown content loads asynchronously after editor mount.
- Added a regression test for delayed markdown value updates.

Verified with release checks.

## 0.2.1

- Fixed initial markdown heading rendering by refreshing CodeMirror decorations after the editor mounts and layout has had a frame to stabilize.
- Added a full-document decoration scan fallback for cases where CodeMirror visible ranges are not ready during initial render.

Verified with typecheck, tests, build, dist verification, and package dry run.
