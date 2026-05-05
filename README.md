# @dpklabs/minueditor

Controlled React markdown editor built on CodeMirror 6.

## Install

```bash
npm install @dpklabs/minueditor
```

Import the default styles:

```ts
import '@dpklabs/minueditor/theme.css'
```

## Basic usage

```tsx
import { MarkdownEditor } from '@dpklabs/minueditor'

function Example() {
  const [value, setValue] = useState('# Hello')

  return <MarkdownEditor value={value} onChange={setValue} />
}
```

## Viewing vs editing

`MarkdownEditor` is editing-only. If you want an app-level display mode, compose it with `MarkdownRenderer`.

```tsx
import { MarkdownEditor, MarkdownRenderer } from '@dpklabs/minueditor'

function EditableNote() {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('Hello **world**')

  if (!editing) {
    return <MarkdownRenderer value={value} onClick={() => setEditing(true)} />
  }

  return <MarkdownEditor value={value} onChange={setValue} autoFocus />
}
```

## Behavior

`MarkdownEditor` always ships the full editing surface.

Built-in behavior toggles are intentionally small:

1. editable by default
2. `readOnly` when you want a non-editable editor surface

## Image uploads

Image uploads are intentionally bring-your-own-storage.

If you provide `onImageUpload`, the editor will:

1. intercept pasted image files
2. insert a temporary markdown placeholder
3. call your upload function
4. replace the placeholder with the returned URL

```tsx
<MarkdownEditor
  value={value}
  onChange={setValue}
  onImageUpload={async (file) => {
    const url = await uploadImageToS3(file)
    return url
  }}
/>
```

## Optional themes

`theme.css` is the neutral base theme.

Optional full-replacement theme files are also available:

1. `@dpklabs/minueditor/themes/opencode.css`
2. `@dpklabs/minueditor/themes/ghostty.css`
3. `@dpklabs/minueditor/themes/terminal.css`

Example:

```ts
import '@dpklabs/minueditor/theme.css'
import '@dpklabs/minueditor/themes/ghostty.css'
```

You can still override any CSS custom property yourself, or start from `theme.css` alone and style it in your app.

## Toolbar usage

```tsx
import { EditorToolbar, MarkdownEditor } from '@dpklabs/minueditor'

function WithToolbar() {
  const [value, setValue] = useState('')
  const [view, setView] = useState(null)

  return (
    <>
      <EditorToolbar view={view} variant="full" />
      <MarkdownEditor value={value} onChange={setValue} onViewReady={setView} />
    </>
  )
}
```

## More detail

See `ARCHITECTURE.md` for the internal module layout and extension boundaries.
