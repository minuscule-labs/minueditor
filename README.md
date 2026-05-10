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

## Image uploads

Image uploads are intentionally bring-your-own-storage.

If you provide `onImageUpload`, the editor will:

1. intercept pasted image files
2. intercept dropped image files
3. insert a temporary markdown placeholder
4. call your upload function
5. replace the placeholder with the returned URL

If an upload fails, the editor leaves a visible plain-text marker in the document instead of silently dropping the image.

Paste and drop use the same upload hook.

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
