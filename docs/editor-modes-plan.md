# Editor Modes Plan

## Goal
Add explicit editor modes for the two primary editing experiences:

- `live`: Obsidian/Notion-style live preview editing. Inactive markdown renders visually; active lines reveal source as needed.
- `source`: raw markdown editing. No widgets or token hiding; markdown source is visible everywhere.

`MarkdownRenderer` remains the separate reading/static rendering primitive for hosted/public/read-only pages.

## Public API

```ts
type MarkdownEditorMode = 'live' | 'source'

interface MarkdownEditorProps {
  mode?: MarkdownEditorMode // default: 'live'
}
```

## Behavior

### Live mode
- Default behavior.
- Inactive headings hide heading markers.
- Inactive images render previews.
- Tables render/edit through the table widget.
- Code fences render/edit through code block widgets.
- Inline markdown markers hide where appropriate.
- Active image line shows full raw markdown.

### Source mode
- Raw markdown everywhere.
- No image previews.
- No table widgets.
- No code block widgets.
- No hidden markdown markers.
- No checkbox replacement widgets.
- Markdown shortcuts and paste handlers still work.
- Optional syntax/language behavior can remain CodeMirror-native.

## Implementation

Use a CodeMirror `Compartment` for mode-specific visual/widget extensions so mode can change after mount without recreating the editor.

Mode-specific extensions in `live`:
- `visualMarkdown`
- `tableDecorations`
- `codeBlockDecorations(...)`
- `markdownDecorations`
- `checkboxDecorations`
- `imageDecorations`

Mode-specific extensions in `source`:
- none initially

## Tests
- Default mode is live.
- `mode="source"` shows raw heading/image/table/code markdown.
- Source mode does not render `.me-image-wrapper`, `.me-table-widget`, `.me-codeblock-widget`, or `.me-token`.
- Switching from live to source removes widgets.
- Switching from source to live restores widgets.

## Docs
- Document `mode="live"` and `mode="source"`.
- Explain `MarkdownRenderer` as reading view.
