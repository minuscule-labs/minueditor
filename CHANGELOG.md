# Changelog

## 0.10.7

- Added stable live preview rendering for external markdown links: links render cleanly when inactive and reveal raw markdown when the cursor enters them.
- Added pasted URL handling that inserts markdown links and leaves the cursor after the full link so the preview renders immediately.
- Added Cmd/Ctrl-click opening for rendered external links.
- Added Notion-style external link hover controls with open, copy, and live-edit actions, including outside-click/focus-loss closing behavior.
- Added Cmd/Ctrl+K editing for existing external links while preserving the existing wrap-link fallback.

Verified with typecheck, tests, and release build.

## 0.10.6

- Stabilized external markdown link live editing by replacing hidden link source syntax instead of CSS-shrinking it.
- Kept external link label edits label-only; hidden URLs now remain stable until an explicit URL edit affordance exists.
- Removed automatic URL-as-label mirroring to avoid cursor oddness and widget/decorator flicker during edits.

Verified with typecheck and targeted editor tests.

## 0.10.5

- Improved live markdown link editing so external link source syntax stays hidden while editing visible link text.
- Mirrored visible edits into the hidden URL for URL-as-label markdown links while preserving distinct label/URL links.
- Made pasted URLs render consistently as markdown links, including after existing text, with cursor placement at the visible label end.
- Reopened wikilink suggestions while editing existing wikilink targets and preserved aliases when completing targets.
- Normalized cursor placement for link/wikilink insertion paths so cursors avoid hidden markdown suffixes.

Verified with typecheck and targeted editor/wikilink/toolbar tests.

## 0.10.4

- Fixed markdown link cursor/selection flicker by revealing full link source while editing inside a decorated link.
- Added Backspace handling to remove list markers at the start of unordered, ordered, and task list item content.
- Added Slack-like ArrowLeft/ArrowRight escape behavior at inline code boundaries.

Verified with typecheck and targeted editor/toolbar tests.

## 0.10.3

- Added a built-in `Wiki Link` slash command when `wikiLinks` is enabled and the editor is using default slash commands.
- The command inserts `[[]]` with the cursor between markers, wraps selected text as `[[selected]]`, and starts wikilink autocomplete when available.
- Custom `slashCommands` arrays remain fully host-controlled and are not modified.

Verified with typecheck, tests, and release build.

## 0.10.2

- Fixed `wikiLinks.openOnClick` by opening decorated wikilinks on `mousedown` before CodeMirror moves the selection and reveals wikilink source markers.
- Kept Cmd/Ctrl-click handling on `click` for source-visible wikilinks.

Verified with typecheck, tests, and release build.

## 0.10.1

- Added opt-in plain-click wikilink opening with `wikiLinks.openOnClick`.
- Added `wikiLinks.openOnModifierClick` to allow hosts to disable the default Cmd/Ctrl-click behavior when needed.
- Plain-click opening is limited to decorated inactive wikilink labels, preserving source editing when the cursor is inside a wikilink.

Verified with typecheck, tests, and release build.

## 0.10.0

- Added generic Obsidian-style wikilink support through `MarkdownEditorProps.wikiLinks`.
- Added public wikilink API types for host-owned resolution, suggestions, open behavior, and create behavior.
- Added inline wikilink rendering for `[[Target]]` and `[[Target|Label]]`, including inactive marker hiding and active source reveal.
- Added resolved, unresolved, and unknown wikilink styling hooks and theme variables.
- Added wikilink autocomplete after `[[`, with keyboard selection through CodeMirror completions.
- Kept MinuNotes-specific note lookup, permissions, navigation, creation, and backlinks outside MinuEditor via callbacks.

Verified with typecheck, tests, and release build.

## 0.9.8

- Improved block-widget cursor navigation across tables, code blocks, and standalone images.
- Added stable before/after widget cursor boundaries, including editable trailing-line creation when exiting a widget at the end of the document.
- Improved table keyboard UX:
  - ArrowUp/ArrowDown can enter and exit table widgets from neighboring lines.
  - Vertical movement between table cells preserves the caret offset, clamped to target cell length.
  - Modified arrow keys such as Cmd/Ctrl+Arrow are no longer hijacked for table structure edits.
  - Table widgets no longer enter editing mode in `readOnly` editors.
- Improved code block widget behavior:
  - ArrowUp/ArrowDown can exit code block widgets cleanly to surrounding document lines.
  - Code block language loaders, highlighters, and highlight styles are isolated per editor instance.
- Improved standalone image previews with shared widget boundary navigation.
- Replaced the previously hardcoded editor content attributes:
  - `autocomplete: 'off'`
  - `autocorrect: 'off'`
  - `autocapitalize: 'off'`
  - `spellcheck: 'false'`
- Added native writing-assistance configuration to `MarkdownEditorProps` so hosts can opt in/out explicitly:
  - `spellCheck?: boolean` — defaults to `true`.
  - `autoCorrect?: 'on' | 'off'` — defaults to `'on'`.
  - `autoComplete?: string` — defaults to `'on'`.
  - `autoCapitalize?: string` — defaults to `'sentences'`.
- Kept password-manager suppression attributes on the editor content:
  - `data-form-type="other"`
  - `data-lpignore="true"`
  - `data-1p-ignore="true"`
- Added internal widget/control-plane groundwork:
  - Shared editor command factory.
  - Shared widget context.
  - Shared table command helpers.
  - Shared widget navigation helpers.
- Added `onRequestImage?: (context: MinuWidgetContext) => void` for host-provided image request flows.
- Improved inline markdown marker handling for visual selections and copy/cut serialization.
- Improved markdown link UX with URL paste handling and Ctrl/Cmd-click link navigation.
- Improved list/task-list marker gutter layout for wrapped and nested items.

Verified with typecheck, targeted editor/toolbar tests, release build, and dist verification.

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
