# Optional Shiki Plan

## Goal

Make syntax highlighting consumer-controlled so apps that only need plain Markdown editing do not pay for Shiki or its emitted language/theme chunks by default.

The editor and renderer should still render safe plain code blocks without any highlighter.

## Current state

- `highlight.js` and `lowlight` have been removed from first-party code.
- `@codemirror/language-data` is no longer bundled by default. Consumers can pass CodeMirror language descriptions through `codeLanguages`.
- Shiki is no longer imported by the default editor/renderer path.
- Syntax highlighting is consumer-controlled through `codeHighlighter`.
- A separate opt-in `@dpklabs/minueditor/shiki` export provides `createShikiHighlighter`.
- Because the Shiki helper is currently published from the same package, the package tarball still includes Shiki helper chunks even though default consumers do not import them.

## Design principles

1. Default behavior should be lightweight and safe.
2. Code blocks should always render as escaped plain HTML when no highlighter is configured.
3. Syntax highlighting should be opt-in.
4. The consuming app should decide whether to use Shiki, another highlighter, or no highlighter.
5. Existing Markdown editing behavior should not require syntax highlighting.

## Implemented API

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

## Implementation status

### Completed

- Added `CodeHighlighter` to `src/types.ts` and exported it from `src/index.tsx`.
- Kept `renderCodeHtml(code, lang)` as an escaped plain fallback.
- Removed Shiki imports from the default highlight helper.
- Added `highlightCodeHtml(...)` to safely apply a supplied highlighter.
- Threaded `codeHighlighter` through `MarkdownEditor` and code block widgets.
- Threaded `codeHighlighter` through `MarkdownRenderer`.
- Added `src/shiki.ts` and package export `@dpklabs/minueditor/shiki`.
- Added renderer tests for default plain rendering and supplied highlighter upgrades.
- Verified `npm test -- --run` and `npm run build` pass.

### Remaining validation

- Install the generated tarball into a fresh consumer app.
- Confirm default consumer usage works without importing `@dpklabs/minueditor/shiki`.
- Confirm opt-in Shiki usage works through `createShikiHighlighter`.
- Inspect consumer app bundle output to confirm Shiki is only pulled when the subpath is imported.

## Open question

If `./shiki` is built and published in the same package, its chunks may still be included in `dist/` and therefore in the tarball. That still helps consuming-app initial route bundles, but not package tarball size.

If tarball size is the primary goal, consider moving the Shiki helper to a separate optional package later:

```ts
import { createShikiHighlighter } from '@dpklabs/minueditor-shiki'
```

For now, start with a separate `./shiki` export and measure.
