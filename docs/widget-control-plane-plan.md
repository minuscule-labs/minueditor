# Widget Control Plane Plan

## Goal
Define a standardized widget/plugin control plane so host applications can provide custom widgets (image pickers, attachment browsers, custom table editors, embeds, etc.) while MinuEditor owns the markdown document, selection, undo/redo history, read-only behavior, and lifecycle.

This builds on the `MarkdownEditorHandle` command API introduced in `v0.6.0`.

## Non-goals for first iteration
- Do not replace every built-in widget immediately.
- Do not expose raw CodeMirror internals as the primary widget API.
- Do not require consumers to write CodeMirror decorations for common custom UI use cases.
- Do not make the public API too generic before validating image/table extension needs.

## Principles
1. **Editor owns the document**
   - Widgets request changes through editor commands/control context.
   - Widgets should not mutate DOM and markdown independently.

2. **Editor owns history**
   - Widget edits must participate in CodeMirror undo/redo.
   - Nested inputs/editors route undo/redo through the parent editor unless they have a clearly isolated history model.

3. **Editor owns read-only gating**
   - Mutating widget commands return false in read-only mode.
   - View-only widgets can still render/interact if safe.

4. **Widgets own product UI**
   - Host apps can bring custom modals, asset browsers, attachment libraries, previews, and metadata fields.

5. **Stable friendly API first, CodeMirror escape hatch second**
   - Common widget operations should use command/context methods.
   - Advanced plugins may still access `EditorView`.

## Proposed public concepts

### Widget context

```ts
export interface MinuWidgetContext {
  view: EditorView
  readOnly: boolean

  getMarkdown(): string
  getSelection(): { from: number; to: number; empty: boolean }
  setSelection(from: number, to?: number): boolean
  focus(): boolean

  commands: MinuEditorCommands
}
```

### Shared commands

```ts
export interface MinuEditorCommands {
  undo(): boolean
  redo(): boolean
  insertMarkdown(markdown: string): boolean
  replaceSelection(markdown: string): boolean
  insertImage(image: { src: string; alt?: string }): boolean
  openImagePicker(): boolean
  toggleBold(): boolean
  toggleItalic(): boolean
  toggleInlineCode(): boolean
  wrapLink(): boolean
  insertTable(): boolean
  insertCodeBlock(): boolean
}
```

This should align with `MarkdownEditorHandle`. Internally, both the handle and widget context should share one command factory so read-only checks and behavior cannot diverge.

### Namespaced widget commands

Future-compatible command dispatch:

```ts
editor.runCommand('image.openPicker')
editor.runCommand('table.insertRowBelow')
editor.runCommand('customEmbed.insert', payload)
```

Potential type shape:

```ts
export interface MinuWidgetCommand<Payload = unknown> {
  id: string
  run(ctx: MinuWidgetContext, payload: Payload): boolean
}
```

### Widget extension

Initial shape for discussion:

```ts
export interface MinuWidgetExtension {
  id: string
  commands?: readonly MinuWidgetCommand[]
  slashCommands?: readonly SlashCommand[]
  decorations?: (ctx: MinuWidgetContext) => Extension
}
```

For app-provided UI that does not need custom markdown parsing, a command-only extension may be enough.

## First practical target: custom image picker

Current problem: MinuEditor has built-in image picker behavior, but host apps may want their own asset modal.

Proposed API:

```tsx
<MarkdownEditor
  onImageUpload={uploadImage}
  onRequestImage={(ctx) => {
    openAssetModal({
      onInsert(asset) {
        ctx.commands.insertImage({ src: asset.url, alt: asset.name })
      },
      onUpload(file) {
        // host can upload, then call insertImage
      },
    })
  }}
/>
```

Behavior:
- `openImagePicker()` calls `onRequestImage(ctx)` when provided.
- If `onRequestImage` is absent, built-in image picker opens.
- Slash `/Image` uses the same pathway.
- External toolbar button uses `editorRef.current.openImagePicker()`.

This validates the control-plane shape without requiring full custom widget rendering yet.

## Second practical target: table command API

Expose table commands through the same control plane:

```ts
table.insertRowAbove
table.insertRowBelow
table.insertColumnLeft
table.insertColumnRight
table.deleteRow
table.deleteColumn
```

These should work from:
- built-in table widget keyboard shortcuts
- external toolbar
- future custom table UI

## Internal refactor plan

1. Extract command factory
   - `createEditorCommands(viewRef, readOnlyRef, ...)`
   - Used by `MarkdownEditorHandle` and widget contexts.

2. Introduce widget context factory
   - `createWidgetContext(view, commands, readOnly)`

3. Route built-in image picker through command pathway
   - Add optional `onRequestImage` prop.
   - Make slash command and handle use same `requestImage` implementation.

4. Add tests
   - `openImagePicker` calls `onRequestImage` when provided.
   - Built-in picker still opens when no custom handler exists.
   - Custom handler can call `ctx.commands.insertImage`.
   - Read-only mode prevents mutating custom image insertion.

5. Document integration examples
   - External toolbar
   - Custom image modal
   - Advanced `view.dispatch` escape hatch

## Open questions

1. Should `onRequestImage` be a prop or a widget extension?
   - Prop is easier and validates demand.
   - Extension is more general but may be premature.

2. How much should custom widgets render inside the editor vs open external UI?
   - Image picker likely external/modal-friendly.
   - Tables may need in-editor rendering.

3. Should command IDs be public in `v0.7`, or keep named methods until more commands exist?

4. How should async commands be represented?
   - Current commands return boolean.
   - Modal flows are often async but the command itself can return true once the modal opens.

## Suggested milestone

### v0.7.0
- Shared command/context factory internally.
- Add `onRequestImage` custom image picker hook.
- Route image slash command + handle through one pathway.
- Document custom image modal integration.

### Later
- Public widget extension registry.
- Namespaced command dispatch.
- Custom table widget hooks.
- Embed/card widget API.
