# Optional Shiki Plan

## Goal

Make syntax highlighting consumer-controlled so apps that only need plain Markdown editing do not pay for Shiki or its emitted language/theme chunks by default.

The editor and renderer should still render safe plain code blocks without any highlighter.

## Current state

- `highlight.js` and `lowlight` have been removed from first-party code.
- `@codemirror/language-data` is no longer bundled by default. Consumers can pass CodeMirror language descriptions through `codeLanguages`.
- Shiki is the only remaining syntax highlighter dependency.
- Shiki is still imported by `src/extensions/highlight.ts`, so the default package build still emits many Shiki language/theme chunks.

## Design principles

1. Default behavior should be lightweight and safe.
2. Code blocks should always render as escaped plain HTML when no highlighter is configured.
3. Syntax highlighting should be opt-in.
4. The consuming app should decide whether to use Shiki, another highlighter, or no highlighter.
5. Existing Markdown editing behavior should not require syntax highlighting.

## Proposed API

Add a highlighter callback type:

```ts
export type CodeHighlighter = (code: string, lang: string) => string | Promise<string | null> | null
```

Add props:

```ts
interface MarkdownEditorProps {
  codeHighlighter?: CodeHighlighter
}

interface MarkdownRendererProps {
  codeHighlighter?: CodeHighlighter
}
```

Default: no highlighter.

The built-in fallback remains escaped plain code HTML.

## Optional Shiki helper

Provide a separate opt-in export, so importing the default editor does not pull Shiki:

```ts
import { createShikiHighlighter } from '@dpklabs/minueditor/shiki'

const codeHighlighter = createShikiHighlighter({
  themes: {
    light: 'github-light',
    dark: 'github-dark',
  },
})

<MarkdownEditor codeHighlighter={codeHighlighter} />
<MarkdownRenderer codeHighlighter={codeHighlighter} />
```

Possible package exports:

```json
{
  "./shiki": {
    "types": "./dist/shiki.d.ts",
    "import": "./dist/shiki.js",
    "require": "./dist/shiki.cjs"
  }
}
```

## Implementation steps

### 1. Introduce highlighter types

- Add `CodeHighlighter` to `src/types.ts`.
- Export it from `src/index.tsx`.

### 2. Split plain rendering from highlighting

- Keep `renderCodeHtml(code, lang)` as escaped plain fallback.
- Remove Shiki imports from `src/extensions/highlight.ts`.
- Add helper that applies a passed highlighter and falls back safely.

### 3. Thread highlighter through editor code block widgets

- Add a configurable highlighter path for `codeBlockDecorations(...)`.
- Pass `codeHighlighter` from `MarkdownEditor`.
- Ensure code block widgets render plain code first, then upgrade when async highlighter resolves.

### 4. Thread highlighter through MarkdownRenderer

- Add `codeHighlighter` prop.
- Synchronously render plain escaped code blocks.
- In `useEffect`, upgrade `pre[data-language]` blocks if a highlighter is present.

### 5. Add Shiki helper entrypoint

- Create `src/shiki.ts` or `src/shiki/index.ts`.
- Import Shiki only in that entrypoint.
- Add Vite/package export for `./shiki`.
- Keep default `src/index.tsx` Shiki-free.

### 6. Tests

- Default editor renders plain code blocks without highlighter.
- Editor upgrades code block widget when highlighter is supplied.
- Renderer renders plain code blocks without highlighter.
- Renderer upgrades code blocks when highlighter is supplied.
- Default import path does not reference `shiki` in source dependency graph.

### 7. Build/package validation

- Run tests and typecheck.
- Build package.
- Compare:
  - `dist/` size
  - tarball size
  - emitted file count
- Confirm default package no longer emits Shiki language/theme chunks unless `./shiki` is included in the package output.

## Open question

If `./shiki` is built and published in the same package, its chunks may still be included in `dist/` and therefore in the tarball. That still helps consuming-app initial route bundles, but not package tarball size.

If tarball size is the primary goal, consider moving the Shiki helper to a separate optional package later:

```ts
import { createShikiHighlighter } from '@dpklabs/minueditor-shiki'
```

For now, start with a separate `./shiki` export and measure.
