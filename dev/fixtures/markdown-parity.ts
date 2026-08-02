import type { DocumentAnnotation } from '../../src/types'

export type ParityExpectation = {
  selector: string
  text?: string
  count?: number
}

export type MarkdownParityFixture = {
  id: string
  title: string
  description: string
  markdown: string
  editor: readonly ParityExpectation[]
  renderer: readonly ParityExpectation[]
  editorAbsent?: readonly string[]
  rendererAbsent?: readonly string[]
  annotations?: readonly DocumentAnnotation[]
}

export const markdownParityFixtures: readonly MarkdownParityFixture[] = [
  {
    id: 'inline-links',
    title: 'Inline formatting and links',
    description: 'Formatting, external links, and the intentional static wikilink fallback.',
    markdown: [
      '# Inline parity',
      '',
      '**Bold**, *emphasis*, ~~deleted~~, and `inline code`.',
      '',
      'Open [the website](https://example.com) or [[Project Alpha|the project note]].',
    ].join('\n'),
    editor: [
      { selector: '.me-bold', text: 'Bold' },
      { selector: '.me-italic', text: 'emphasis' },
      { selector: '.me-strikethrough', text: 'deleted' },
      { selector: '.me-inline-code', text: 'inline code' },
      { selector: '.me-link-widget', text: 'the website' },
      { selector: '.me-wikilink--resolved', text: 'the project note' },
    ],
    renderer: [
      { selector: 'strong', text: 'Bold' },
      { selector: 'em', text: 'emphasis' },
      { selector: 'del', text: 'deleted' },
      { selector: 'code', text: 'inline code' },
      { selector: 'a[href="https://example.com"]', text: 'the website' },
      { selector: '.me-renderer', text: '[[Project Alpha|the project note]]' },
    ],
    rendererAbsent: ['.me-wikilink'],
  },
  {
    id: 'lists-quotes',
    title: 'Lists, tasks, and blockquotes',
    description: 'Nested list structure, checked state, and ordinary quote fallback.',
    markdown: [
      '# Lists and quotes',
      '',
      '- [x] Shipped item',
      '- [ ] Follow-up item',
      '  - Nested item',
      '',
      '> An ordinary blockquote with **formatting**.',
    ].join('\n'),
    editor: [
      { selector: '.me-checkbox', count: 2 },
      { selector: '.me-list-marker-widget' },
      { selector: '.me-blockquote', text: 'An ordinary blockquote' },
    ],
    renderer: [
      { selector: 'input[type="checkbox"]', count: 2 },
      { selector: 'li', count: 3 },
      { selector: 'blockquote', text: 'An ordinary blockquote' },
    ],
    editorAbsent: ['.me-callout-line'],
    rendererAbsent: ['.me-callout'],
  },
  {
    id: 'callout-composition',
    title: 'Callout composition',
    description: 'A callout containing a wikilink, formatting, a nested list, and review metadata.',
    markdown: [
      '> [!IMPORTANT]',
      '> Review [[Project Alpha|the project note]] before **publishing**.',
      '>',
      '> - Keep the Markdown portable.',
      '> - Preserve nested structures.',
    ].join('\n'),
    annotations: [
      {
        id: 'parity-comment',
        documentId: 'parity-fixture',
        kind: 'comment',
        actorType: 'user',
        status: 'open',
        anchorType: 'line',
        startLine: 2,
        endLine: 2,
        label: 'Review this callout',
      },
    ],
    editor: [
      { selector: '.me-callout-line--important', count: 5 },
      { selector: '.me-callout-label--important', text: 'Important' },
      { selector: '.me-wikilink--resolved', text: 'the project note' },
      { selector: '.me-callout-line.me-annotation--kind-comment' },
      { selector: '.me-list-marker-widget', count: 2 },
    ],
    renderer: [
      { selector: '.me-callout--important' },
      { selector: '.me-callout-title', text: 'Important' },
      { selector: 'strong', text: 'publishing' },
      { selector: 'li', count: 2 },
      { selector: '.me-callout', text: '[[Project Alpha|the project note]]' },
    ],
    rendererAbsent: ['.me-annotation'],
  },
  {
    id: 'table-code',
    title: 'Tables and fenced code',
    description: 'Interactive editor widgets and their semantic static equivalents.',
    markdown: [
      '# Structured blocks',
      '',
      '| Feature | Status |',
      '| --- | --- |',
      '| Callouts | Ready |',
      '',
      '```ts',
      'const portable: boolean = true',
      '```',
    ].join('\n'),
    editor: [
      { selector: '.me-table-widget' },
      { selector: '.me-table-render th', count: 2 },
      { selector: '.me-table-render td', count: 2 },
      { selector: '.me-codeblock-widget' },
      { selector: '.me-codeblock-body', text: 'const portable: boolean = true' },
    ],
    renderer: [
      { selector: 'table' },
      { selector: 'th', count: 2 },
      { selector: 'td', count: 2 },
      { selector: 'pre code', text: 'const portable: boolean = true' },
    ],
  },
  {
    id: 'media-fallbacks',
    title: 'Media and safe fallbacks',
    description: 'Images, external links, unknown callouts, and malformed source remain recoverable.',
    markdown: [
      '# Media and fallbacks',
      '',
      '![Landscape](https://example.com/landscape.png)',
      '',
      '[External reference](https://example.com/reference)',
      '',
      '> [!CUSTOM]',
      '> Unknown alerts remain ordinary blockquotes.',
      '',
      '```unknown-language',
      'still editable',
      '```',
    ].join('\n'),
    editor: [
      { selector: '.me-image-widget img[alt="Landscape"]' },
      { selector: '.me-link-widget', text: 'External reference' },
      { selector: '.me-blockquote', text: '[!CUSTOM]' },
      { selector: '.me-codeblock-widget', text: 'still editable' },
    ],
    renderer: [
      { selector: 'img[alt="Landscape"]' },
      { selector: 'a[href="https://example.com/reference"]', text: 'External reference' },
      { selector: 'blockquote', text: '[!CUSTOM]' },
      { selector: 'pre code', text: 'still editable' },
    ],
    editorAbsent: ['.me-callout-line'],
    rendererAbsent: ['.me-callout'],
  },
]
