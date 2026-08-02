export type RichPasteFixture = {
  id: string
  title: string
  source: 'browser' | 'google-docs' | 'notion' | 'spreadsheet' | 'markdown'
  plain: string
  html: string
  expected: string | null
  description: string
}

export const richPasteFixtures: readonly RichPasteFixture[] = [
  {
    id: 'browser-article',
    title: 'Browser article',
    source: 'browser',
    description: 'Headings, links, emphasis, and lists copied from a web page.',
    plain: 'Release notes\nRead the specification.\nStable source\nSafe fallback',
    html: [
      '<article>',
      '<h2>Release notes</h2>',
      '<p>Read the <a href="https://example.com/spec"><strong>specification</strong></a>.</p>',
      '<ul><li>Stable source</li><li>Safe fallback</li></ul>',
      '</article>',
    ].join(''),
    expected: [
      '## Release notes',
      '',
      'Read the [**specification**](https://example.com/spec).',
      '',
      '- Stable source',
      '- Safe fallback',
    ].join('\n'),
  },
  {
    id: 'google-docs-list',
    title: 'Google Docs checklist',
    source: 'google-docs',
    description: 'Common Docs-style spans and nested list markup.',
    plain: 'Launch checklist\nReview copy\nNotify team\nPublish',
    html: [
      '<p><b>Launch checklist</b></p>',
      '<ul>',
      '<li><span>Review copy</span></li>',
      '<li><span>Notify team</span><ul><li><span>Publish</span></li></ul></li>',
      '</ul>',
    ].join(''),
    expected: [
      '**Launch checklist**',
      '',
      '- Review copy',
      '- Notify team',
      '  - Publish',
    ].join('\n'),
  },
  {
    id: 'notion-decision',
    title: 'Notion decision block',
    source: 'notion',
    description: 'Block wrappers, inline code, ordered steps, and a safe link.',
    plain: 'Decision\nKeep Markdown canonical.\nCapture source\nRender preview',
    html: [
      '<div><h3>Decision</h3>',
      '<p>Keep <code>Markdown</code> <em>canonical</em>.</p>',
      '<ol><li>Capture source</li><li>Render <a href="/preview">preview</a></li></ol>',
      '</div>',
    ].join(''),
    expected: [
      '### Decision',
      '',
      'Keep `Markdown` *canonical*.',
      '',
      '1. Capture source',
      '2. Render [preview](/preview)',
    ].join('\n'),
  },
  {
    id: 'spreadsheet-table',
    title: 'Spreadsheet cells',
    source: 'spreadsheet',
    description: 'Tab-delimited cells become a portable Markdown table.',
    plain: 'Feature\tStatus\tOwner\nCallouts\tReady\tEditor\nMermaid\tPlanned\tEditor',
    html: '',
    expected: [
      '| Feature | Status | Owner |',
      '| --- | --- | --- |',
      '| Callouts | Ready | Editor |',
      '| Mermaid | Planned | Editor |',
    ].join('\n'),
  },
  {
    id: 'existing-markdown',
    title: 'Existing Markdown',
    source: 'markdown',
    description: 'Recognized Markdown bypasses HTML conversion and remains exact.',
    plain: '# Existing Markdown\n\n> [!NOTE]\n> Preserve [[Project Alpha]].',
    html: '<h1>Existing Markdown</h1><blockquote><p>[!NOTE]<br>Preserve [[Project Alpha]].</p></blockquote>',
    expected: null,
  },
]
