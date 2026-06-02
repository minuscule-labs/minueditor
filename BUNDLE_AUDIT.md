# Bundle Audit

## Current observations

The default editor/renderer source path no longer imports Shiki directly. Syntax highlighting is now consumer-controlled through `codeHighlighter`, with an opt-in Shiki helper at `@dpklabs/minueditor/shiki`.

After the current build:

- `dist/` is about 21 MB unpacked.
- npm tarball dry-run is about 3.9 MB packed / 20.9 MB unpacked.
- `dist/` contains 600+ emitted JS/CJS files.
- Most emitted files are Shiki language/theme chunks from the optional `./shiki` build entry.

Main entry sizes from Vite output:

| file | raw | gzip |
|---|---:|---:|
| `dist/index.js` | ~916 KB | ~270 KB |
| `dist/index.cjs` | ~637 KB | ~218 KB |
| `dist/shiki.js` | ~286 KB | ~80 KB |
| `dist/shiki.cjs` | ~210 KB | ~67 KB |

## Dependency boundaries

### CodeMirror language data

`MarkdownEditor` does not bundle `@codemirror/language-data` by default. Consumers can supply CodeMirror language descriptions when they want language-aware fenced-code editing:

```tsx
import { languages } from '@codemirror/language-data'

<MarkdownEditor codeLanguages={languages} />
```

The default is no bundled CodeMirror language packages.

### Syntax highlighting

Code blocks render as escaped plain HTML by default.

Consumers can opt into Shiki by importing the separate subpath:

```tsx
import { createShikiHighlighter } from '@dpklabs/minueditor/shiki'

const codeHighlighter = createShikiHighlighter()

<MarkdownEditor codeHighlighter={codeHighlighter} />
<MarkdownRenderer codeHighlighter={codeHighlighter} />
```

Consumers can also provide any custom `CodeHighlighter` implementation.

## Why package size is still large

The `./shiki` helper is built and published from the same package. Vite emits Shiki's dynamic language/theme chunks into `dist/`, and `package.json` publishes the whole `dist` directory.

This means:

1. Default consumer app bundles should not pull Shiki unless they import `@dpklabs/minueditor/shiki`.
2. The package tarball still includes the optional Shiki helper and its emitted chunks.

## Remaining validation

Before release, test the generated tarball in a fresh consumer app:

1. Install the local `.tgz` from `npm pack`.
2. Verify default `@dpklabs/minueditor` usage works with plain code blocks.
3. Verify `@dpklabs/minueditor/shiki` usage highlights code blocks.
4. Inspect the consumer app bundle to confirm Shiki only appears when the subpath is imported.

## Future option

If tarball size becomes the primary concern, move the Shiki helper into a separate optional package, for example:

```ts
import { createShikiHighlighter } from '@dpklabs/minueditor-shiki'
```

That would keep the main package tarball smaller while preserving opt-in Shiki support.
