# Architecture

## Overview

`@dpklabs/minueditor` is a controlled React markdown editor built on CodeMirror 6.

Core principles:

1. The source of truth is always plain markdown text.
2. Rich editing behavior is layered on top with CodeMirror decorations and widgets.
3. `MarkdownEditor` is responsible for editing only.
4. Viewing/render-only presentation is handled separately by `MarkdownRenderer`.

## Main Surfaces

### `src/MarkdownEditor.tsx`

The main editor wrapper.

Responsibilities:

1. Create and destroy the `EditorView`
2. Wire the controlled `value` / `onChange` contract
3. Install the editor extensions
4. Reconfigure `readOnly` state
5. Expose the `EditorView` via `onViewReady` and ref

Non-responsibilities:

1. It does not manage a built-in viewing mode
2. It does not switch between renderer/editor on blur

If a product needs display-vs-edit behavior, compose `MarkdownRenderer` and `MarkdownEditor` externally.

### `src/renderer/index.tsx`

Static markdown rendering surface.

Responsibilities:

1. Render markdown to HTML
2. Provide a lightweight non-editor display surface
3. Support external click-to-edit composition patterns

## Extension Layout

### Lightweight extensions

Single-file extensions remain appropriate when behavior is small and local:

1. `autolink.ts`
2. `checkboxes.ts`
3. `decorations.ts`
4. `images.ts`
5. `keymap.ts`
6. `visual-markdown.ts`

### Rich block extensions

Larger interactive block systems live in folders.

#### `src/extensions/tables/`

1. `index.ts`
Composes the public extension export.

2. `state.ts`
Owns active-table state and effects.

3. `model.ts`
Table block detection, parsing, and markdown formatting helpers.

4. `widget.ts`
Widget DOM, editing interactions, selection behavior, and decoration construction.

#### `src/extensions/codeblock/`

1. `index.ts`
Composes the public extension export.

2. `state.ts`
Owns active-code-block state and effects.

3. `types.ts`
Shared types for fenced block metadata and nested editor mounts.

4. `theme.ts`
Nested editor theme used inside editable code block widgets.

5. `model.ts`
Fenced block parsing, language extension loading, click-position mapping, and HTML rendering helpers.

6. `widget.ts`
Widget DOM, nested editor lifecycle, keyboard interactions, focus transitions, and decoration construction.

## Performance Notes

Recent refactor goals:

1. Avoid unnecessary whole-extension rebuilds for rich block decorations.
2. Avoid continuous toolbar polling.
3. Keep the public API stable while making large interactive extensions easier to maintain.

Current guidance:

1. Rebuild rich block decorations only when document content or active widget state changes.
2. Keep toolbar positioning event-driven rather than frame-polled.
3. Prefer small internal modules over adding more behavior into already large widget files.

## Toolbar Boundaries

### `src/toolbar/commands.ts`

Holds markdown editing commands that operate on an `EditorView`.

These commands are shared by:

1. keyboard shortcuts
2. the full toolbar
3. the floating toolbar

### `src/toolbar/Toolbar.tsx`

Persistent full toolbar surface.

### `src/toolbar/FloatingToolbar.tsx`

Selection-driven inline toolbar surface.

## Future Refactor Direction

Likely future work:

1. Split `toolbar/commands.ts` by domain if command complexity keeps growing.
2. Add targeted tests around rich widget internals, not only editor-level integration.
3. Continue keeping editing concerns in `MarkdownEditor` and presentation concerns outside it.
