# Bundle Audit

## Current observations

The published package is usable but heavy for route-level app usage.

After the `0.3.3` build:

- `dist/` is about 24 MB unpacked.
- npm tarball is about 4.8 MB.
- `dist/` contains 800+ emitted files.
- Most emitted files are syntax highlighting language/theme chunks.

Large dependencies involved:

- `shiki` via `src/extensions/highlight.ts`

Previously this path also used `highlight.js`, `lowlight`, and `@codemirror/language-data`; those have been removed from the default dependency path. Shiki is now the only syntax highlighter dependency, and CodeMirror language packages are consumer-supplied through `codeLanguages`.

## Why this happens

### 1. MarkdownEditor no longer eagerly imports CodeMirror language data

`MarkdownEditor` now accepts consumer-provided CodeMirror language descriptions:

```tsx
<MarkdownEditor codeLanguages={languages} />
```

The default is no bundled CodeMirror language packages. This keeps fenced-code language editing cost under the consuming app's control.

### 2. Code block widgets import highlighting

`src/extensions/codeblock/widget.ts` imports `renderCodeHtmlWithShiki`.
`src/extensions/codeblock/model.ts` imports `renderCodeHtml` and uses the configured `codeLanguages` list for nested fenced-code editors.

`renderCodeHtml` returns escaped plain code HTML synchronously. Shiki is used for highlighted upgrades.

### 3. MarkdownRenderer imports highlighting too

`src/renderer/index.tsx` imports both:

```ts
import { renderCodeHtml, renderCodeHtmlWithShiki } from '../extensions/highlight'
```

So renderer usage is also connected to Shiki.

### 4. Vite library build emits dynamic chunks into `dist/`

Because Shiki and language packages use many dynamic imports, the library build emits many chunks. Since `package.json` publishes the whole `dist` directory, all those chunks go into the package tarball.

## Recommended plan

### Phase 1: Add a minimal editor path

Goal: provide a documented import that avoids highlighter and broad language-data dependencies.

Potential entrypoint:

```ts
import { MarkdownEditor } from '@dpklabs/minueditor/minimal'
```

Minimal editor should:

- keep core markdown editing
- keep slash commands, tables, checkboxes, images, annotations
- omit Shiki/lowlight/highlight.js
- avoid `@codemirror/language-data` when possible
- render code fences as plain editable blocks

Possible implementation options:

1. Add a `highlighting?: boolean | 'basic' | 'full'` prop.
2. Add a separate `MarkdownEditorMinimal` component.
3. Add a separate package export that uses a minimal internal editor configuration.

The separate export is clearest for consumers because bundle analyzers can see a different import path.

### Phase 2: Make Shiki lazy/optional

Move Shiki behind a dynamic import so the main editor bundle is not directly connected to it.

Example direction:

```ts
export async function renderCodeHtmlWithShiki(...) {
  const { codeToHtml } = await import('shiki')
  return codeToHtml(...)
}
```

This may still emit chunks, but it can keep them out of the initial app route when bundled by consuming apps.

### Phase 3: Reduce default language data

Instead of importing all `@codemirror/language-data`, provide one of:

- no code language support by default
- a small curated language list
- consumer-supplied `codeLanguages`
- separate full build with all languages

Possible API:

```tsx
<MarkdownEditor codeLanguages="none" />
<MarkdownEditor codeLanguages="common" />
<MarkdownEditor codeLanguages={customLanguages} />
```

### Phase 4: Document lazy loading

Add an app integration section showing route-level lazy loading:

```tsx
const MarkdownEditor = lazy(() =>
  import('@dpklabs/minueditor').then((mod) => ({ default: mod.MarkdownEditor }))
)
```

And the corresponding CSS import requirement.

### Phase 5: Publish package-size guidance

Document:

- full editor vs minimal editor tradeoffs
- expected package size
- how to avoid loading renderer/highlighting on routes that do not need it
- when to use `MarkdownRenderer` vs app-owned rendering

## Proposed next concrete task

Completed first cleanup:

1. Removed `highlight.js`, `lowlight`, and direct HAST-to-HTML rendering from first-party code.
2. Kept Shiki as the only syntax highlighter.
3. `renderCodeHtml` now emits safe plain code HTML synchronously; `renderCodeHtmlWithShiki` upgrades highlighted blocks.

Result: package size improved only slightly because Shiki and CodeMirror language data remain the dominant contributors.

Next best task: decide whether Shiki should also become consumer-supplied/optional for consumers who only need plain Markdown editing.
