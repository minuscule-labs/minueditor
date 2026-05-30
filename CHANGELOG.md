# Changelog

## 0.3.3

- Added a Notion-style `/Image` picker with Upload and Link flows.
- Reused `onImageUpload` for slash-command uploads while keeping storage consumer-owned.
- Fixed picker focus handling so CodeMirror no longer steals focus from image link inputs.
- Added light and dark theme variables for the slash command menu and image picker.
- Updated image insertion documentation and roadmap notes.

Verified with release checks.

## 0.3.2

- Added generic document annotations with line and range anchors.
- Added annotation click handling and annotation metadata classes/data attributes.
- Added dev app examples for comments, generated, updated, added, and deleted ranges.
- Documented the planned Notion-style `/Image` picker feature.

Verified with release checks.

## 0.3.1

- Polished the slash-command menu styling and removed extra command metadata from the display.
- Fixed horizontal rule rendering so the divider text no longer leaves a visible stub.

Verified with release checks.

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
