# Editor/static parity fixtures

The canonical fixture corpus in [`dev/fixtures/markdown-parity.ts`](../dev/fixtures/markdown-parity.ts) protects semantic parity between `MarkdownEditor` live mode and `MarkdownRenderer`. It also powers the **Editor/static parity fixtures** surface in the development app.

Parity means that both paths preserve the same authored meaning and portable source. It does not require identical DOM: live mode uses interactive CodeMirror widgets while the static renderer uses semantic HTML.

## Current matrix

| Fixture | Live editor | Static renderer | Intentional difference |
| --- | --- | --- | --- |
| Inline formatting and links | Inline decorations, external-link widget, resolved wikilink | Semantic inline HTML and external anchor | Static wikilinks remain literal until a host-owned renderer contract exists |
| Lists, tasks, and blockquotes | List markers, interactive checkboxes, ordinary quote decoration | Lists, disabled task inputs, semantic blockquote | Controls differ; authored checked state and nesting agree |
| Callout composition | Callout label, wikilink, nested lists, annotation rail | Labeled callout, nested formatting and lists | Review annotations are editor/host metadata; static wikilinks remain literal |
| Tables and fenced code | Interactive table and code-block widgets | Semantic table and `pre > code` | Editor widgets expose editing controls |
| Media and safe fallbacks | Image/link widgets, ordinary unknown alert, editable unknown code fence | Semantic image/link/blockquote/code | Unsupported syntax must not become a specialized block |

## Automated checks

`src/parity.test.tsx` reads the shared fixture definitions and asserts:

- expected semantic content and feature hooks in live mode;
- expected semantic content and structure in static rendering;
- explicit absence of unsupported enhancements;
- no source mutation during initial live rendering;
- exact portable syntax visibility in source mode;
- unique fixture identifiers.

Assertions use stable semantic classes and DOM structure rather than pixel snapshots.

## Manual review

Run `npm run dev`, open **Editor/static parity fixtures**, and review every fixture in:

1. live mode;
2. source mode;
3. static rendering;
4. base, light, and dark themes;
5. desktop and narrow layouts.

Check content, hierarchy, wrapping, semantic colors, overflow, and fallback readability. Exact spacing may differ between interactive widgets and static HTML, but the authored meaning must remain equivalent.

## Extending the corpus

Add or update a fixture whenever a feature changes both rendering paths. Each fixture should:

- be minimal enough to diagnose failures;
- include meaningful composition with existing Markdown when relevant;
- declare intentional absences instead of silently accepting them;
- avoid network-dependent assertions;
- preserve malformed or unsupported source as an editable fallback.

Rich paste and rich-block work should add fixtures here before introducing new rendering behavior.
