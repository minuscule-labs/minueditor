# @dpklabs/minueditor

Controlled React markdown editor built on CodeMirror 6.

## Install

```bash
npm install @dpklabs/minueditor
```

Install directly from a GitHub release tag:

```bash
npm install github:spdydve/minueditor#v0.1.0
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

```tsx
function ReadOnlyExample() {
  return (
    <MarkdownEditor
      value={'# Locked\n\nThis surface is visible but not editable.'}
      onChange={() => {}}
      readOnly
    />
  )
}
```

## Initial render and focus

`MarkdownEditor` is editable by default, but it does **not** focus itself unless you pass `autoFocus`.

That means this opens as an editable editor surface without showing a cursor:

```tsx
<MarkdownEditor value={value} onChange={setValue} />
```

On initial mount, when the editor is not focused, markdown syntax is treated as inactive and rendered visually. For example:

```md
# Heading
```

is displayed like a heading instead of showing the raw `# Heading` text.

When the user clicks into the editor, the focused/active line reveals the markdown markers needed for editing. If you want the editor to place the cursor immediately and reveal markers on the first active line, pass `autoFocus`:

```tsx
<MarkdownEditor value={value} onChange={setValue} autoFocus />
```

Use `readOnly` only when the surface should not be editable. For a fully static display mode, use `MarkdownRenderer` instead.

## Styling guidance

Prefer MinuEditor CSS variables for app-level theming instead of styling CodeMirror internals directly:

```css
.my-editor {
  --me-text: #cdd6f4;
  --me-heading-color: #cdd6f4;
  --me-font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  --me-content-padding: 12px 0 0;
}
```

Avoid broad selectors that target generated editor internals, especially with `!important`, such as:

```css
.cm-line[class*="heading"] { ... }
.me-h1 { color: ... !important; }
```

MinuEditor uses internal marker spans like `.me-token` to hide inactive markdown syntax while preserving cursor/layout behavior. Styling through variables keeps heading colors, text colors, and token hiding working together.

## Editor command API

Use a ref when your app needs to drive the editor from an external toolbar, modal, or command palette. MinuEditor exposes common commands while still keeping the underlying CodeMirror `view` available for advanced integrations.

```tsx
import { useRef } from 'react'
import { MarkdownEditor, type MarkdownEditorHandle } from '@dpklabs/minueditor'

function NoteEditor() {
  const editorRef = useRef<MarkdownEditorHandle>(null)

  return (
    <>
      <button onClick={() => editorRef.current?.undo()}>Undo</button>
      <button onClick={() => editorRef.current?.redo()}>Redo</button>
      <button onClick={() => editorRef.current?.toggleBold()}>Bold</button>
      <button onClick={() => editorRef.current?.openImagePicker()}>Image</button>

      <MarkdownEditor ref={editorRef} value={value} onChange={setValue} />
    </>
  )
}
```

Available handle methods include:

- `focus()` / `blur()`
- `undo()` / `redo()`
- `getMarkdown()`
- `getSelection()` / `setSelection(from, to?)`
- `insertMarkdown(markdown)`
- `replaceSelection(markdown)`
- `insertImage({ src, alt })`
- `openImagePicker()`
- `toggleBold()` / `toggleItalic()` / `toggleInlineCode()` / `wrapLink()`
- `insertTable()` / `insertCodeBlock()`

For custom integrations, the handle also exposes `view`, the underlying CodeMirror `EditorView`:

```tsx
editorRef.current?.view?.dispatch(...)
```

Prefer the named commands for common editor actions; use `view` when you need lower-level CodeMirror behavior.

## Fenced code languages

By default, the editor does not bundle CodeMirror language packages for fenced-code editing. Code blocks still work as plain editable Markdown/code blocks.

If you want language-aware editing inside fenced code blocks, provide CodeMirror language descriptions from your app:

```tsx
import { languages } from '@codemirror/language-data'

<MarkdownEditor
  value={value}
  onChange={setValue}
  codeLanguages={languages}
/>
```

This keeps language bundle cost under the consuming app's control.

To enable only specific languages, filter the language descriptions before passing them to the editor:

```tsx
import { languages } from '@codemirror/language-data'

const codeLanguages = languages.filter((language) =>
  ['JavaScript', 'TypeScript', 'JSON', 'Markdown'].includes(language.name)
)

<MarkdownEditor
  value={value}
  onChange={setValue}
  codeLanguages={codeLanguages}
/>
```

## Optional syntax highlighting

Code blocks render safely as escaped plain HTML by default. The default editor and renderer do not require a syntax highlighter.

To opt into Shiki highlighting, import the separate Shiki helper entrypoint and pass the resulting highlighter to the editor and/or renderer:

```tsx
import { MarkdownEditor, MarkdownRenderer } from '@dpklabs/minueditor'
import { createShikiHighlighter } from '@dpklabs/minueditor/shiki'

const codeHighlighter = createShikiHighlighter()

<MarkdownEditor
  value={value}
  onChange={setValue}
  codeHighlighter={codeHighlighter}
/>

<MarkdownRenderer
  value={value}
  codeHighlighter={codeHighlighter}
/>
```

You can customize Shiki themes:

```tsx
const codeHighlighter = createShikiHighlighter({
  themes: {
    light: 'github-light',
    dark: 'github-dark',
  },
})
```

or use a single theme:

```tsx
const codeHighlighter = createShikiHighlighter({ theme: 'github-dark' })
```

To highlight only specific languages, wrap the highlighter and return `null` for unsupported languages. Unsupported blocks fall back to safe escaped plain HTML:

```tsx
import { createShikiHighlighter } from '@dpklabs/minueditor/shiki'
import type { CodeHighlighter } from '@dpklabs/minueditor'

const shikiHighlighter = createShikiHighlighter()
const highlightedLanguages = new Set(['js', 'jsx', 'ts', 'tsx', 'json', 'md'])

const codeHighlighter: CodeHighlighter = (code, lang) => {
  if (!highlightedLanguages.has(lang.toLowerCase())) return null
  return shikiHighlighter(code, lang)
}
```

You can also bring your own highlighter by implementing the exported `CodeHighlighter` type:

```tsx
import type { CodeHighlighter } from '@dpklabs/minueditor'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const codeHighlighter: CodeHighlighter = async (code, lang) => {
  return `<pre data-language="${lang}"><code>${escapeHtml(code)}</code></pre>`
}
```

If you do not pass `codeHighlighter`, fenced code remains plain and escaped.

In `readOnly` mode, code blocks stay in static display mode. They still render plain escaped code by default, and they use `codeHighlighter` for highlighted display when one is provided.

## Image uploads

Image uploads are intentionally bring-your-own-storage.

If you provide `onImageUpload`, the editor will:

1. intercept pasted image files
2. intercept dropped image files
3. insert a temporary markdown placeholder
4. call your upload function
5. replace the placeholder with the returned URL

If an upload fails, the editor leaves a visible plain-text marker in the document instead of silently dropping the image.

Paste, drop, and the `/Image` slash-command picker use the same upload hook.

`/Image` opens an inline picker with:

1. **Upload** — calls `onImageUpload(file)` and inserts the returned URL
2. **Link** — inserts an image URL directly as markdown

If `onImageUpload` is not provided, Link still works and Upload is disabled with a helpful message.

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

For local demos or previews, a consumer-controlled upload handler can just return an object URL:

```tsx
<MarkdownEditor
  value={value}
  onChange={setValue}
  onImageUpload={async (file) => URL.createObjectURL(file)}
/>
```

## Optional themes

`theme.css` is the neutral base theme.

Optional full-replacement theme files are also available:

1. `@dpklabs/minueditor/themes/light.css`
2. `@dpklabs/minueditor/themes/dark.css`

Example:

```ts
import '@dpklabs/minueditor/theme.css'
import '@dpklabs/minueditor/themes/dark.css'
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

## Releases

For personal GitHub-based installs, tag releases from the version already in `package.json`.

### Install from a release tag

```bash
npm install github:spdydve/minueditor#v0.1.0
```

Use tags rather than a branch like `main` when you want reproducible installs.

### Version bump helpers

Choose the release type you want:

```bash
pnpm run version:patch
pnpm run version:minor
pnpm run version:major
```

These update `package.json` and `package-lock.json` without creating a git tag.

Version behavior:

1. `patch`: `0.1.0 -> 0.1.1`
2. `minor`: `0.1.0 -> 0.2.0`
3. `major`: `0.1.0 -> 1.0.0`

### Release validation

Dry run the release validation without creating a tag:

```bash
pnpm run release:tag:dry-run
```

This checks that:

1. the git worktree is clean
2. the version tag does not already exist
3. `pnpm run check:release` passes

### Tagging

Create the local annotated tag after validation passes:

```bash
pnpm run release:tag
```

Create and push the tag in one step:

```bash
pnpm run release:tag:push
```

The release script will:

1. require a clean git worktree
2. run `pnpm run check:release` when invoked from pnpm
3. create `v<package.json version>` as an annotated git tag
4. optionally push the current branch and tag

### Recommended workflow

For a patch release:

```bash
pnpm run version:patch
git add package.json package-lock.json
git commit -m "Release v0.1.1"
pnpm run release:tag:push
```

For a minor release:

```bash
pnpm run version:minor
git add package.json package-lock.json
git commit -m "Release v0.2.0"
pnpm run release:tag:push
```

For a major release:

```bash
pnpm run version:major
git add package.json package-lock.json
git commit -m "Release v1.0.0"
pnpm run release:tag:push
```

### First release checklist

1. finish the remaining code/docs changes
2. confirm `git status` is clean
3. choose the version bump with `pnpm run version:patch|minor|major`
4. commit the version bump
5. run `pnpm run release:tag:dry-run`
6. run `pnpm run release:tag:push`
7. install it from GitHub in the consuming app

### Notes

1. `pnpm version` without `--no-git-tag-version` is intentionally not used here, because this repo's release tag is created by `release:tag`
2. `release:tag:push` pushes the current branch first, then the release tag
3. if you want a tag without pushing it yet, use `pnpm run release:tag`
