# Rich paste

Rich paste converts common clipboard structure into portable Markdown while keeping Markdown as the only canonical editor value.

## Precedence

Paste handlers run in this order:

1. **Plain-text escape hatch:** Cmd/Ctrl+Shift+V inserts `text/plain` without rich conversion.
2. **Image files:** rich conversion yields to the existing host-owned `onImageUpload` flow.
3. **Tabular text:** clipboard text containing multiple tab-delimited columns becomes a Markdown table.
4. **Recognized Markdown:** Markdown-looking `text/plain` bypasses HTML conversion and is left to native CodeMirror paste.
5. **Safe HTML:** supported clipboard HTML becomes Markdown.
6. **URLs:** rich conversion yields to the existing URL paste behavior.
7. **Plain text:** CodeMirror performs ordinary insertion.

The `richPaste` prop defaults to enabled. Pass `false`, or use `{ html: false }` or `{ tabular: false }`, to narrow behavior.

## Supported HTML

The conservative converter supports:

- headings and paragraphs;
- bold, italic, strike, and inline code;
- safe HTTP(S), mail, anchor, and relative links;
- ordered, unordered, and nested lists;
- blockquotes and horizontal rules;
- tables;
- fenced code, including `language-*` classes.

It discards scripts, styles, templates, iframes, objects, unsafe links, and HTML-only images. Clipboard image files use `onImageUpload`; MinuEditor never uploads or fetches pasted resources itself.

## Spreadsheet behavior

Tab-delimited text with at least two columns is converted into a Markdown table. The first row becomes the header, uneven rows are padded, and pipe characters are escaped.

## Fixtures

[`dev/fixtures/rich-paste.ts`](../dev/fixtures/rich-paste.ts) includes browser article, Google Docs, Notion, spreadsheet, and existing-Markdown examples. The same fixtures drive focused conversion tests and the development **Rich paste lab**.

## Known boundaries

- HTML conversion is intentionally conservative rather than a complete browser DOM serializer.
- Spreadsheet paste treats the first row as a header because portable Markdown tables require one.
- HTML-only images are omitted; hosts should use clipboard files and `onImageUpload` for durable assets.
- Recognized Markdown is preserved exactly by bypassing rich HTML conversion.
- Unsupported HTML falls back to its safe textual descendants where possible.
