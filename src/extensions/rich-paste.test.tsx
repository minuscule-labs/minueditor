import { fireEvent, render, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../MarkdownEditor'
import { richPasteFixtures } from '../../dev/fixtures/rich-paste'
import {
  htmlToMarkdown,
  looksLikeMarkdown,
  normalizeRichPasteConfig,
  richClipboardToMarkdown,
  tabularTextToMarkdown,
} from './rich-paste'

describe('rich paste conversion', () => {
  it('normalizes rich paste configuration with safe defaults', () => {
    expect(normalizeRichPasteConfig(undefined)).toEqual({ enabled: true, html: true, tabular: true })
    expect(normalizeRichPasteConfig({ html: false })).toEqual({ enabled: true, html: false, tabular: true })
    expect(normalizeRichPasteConfig(false)).toEqual({ enabled: false, html: false, tabular: false })
  })

  it('converts common document HTML into portable Markdown', () => {
    const html = `
      <h2>Release plan</h2>
      <p><strong>Ship</strong> the <a href="https://example.com/spec">specification</a>.</p>
      <ul>
        <li>Review <em>carefully</em></li>
        <li>Publish<ul><li>Notify the team</li></ul></li>
      </ul>
      <blockquote><p>Markdown stays canonical.</p></blockquote>
    `

    expect(htmlToMarkdown(html)).toBe([
      '## Release plan',
      '',
      '**Ship** the [specification](https://example.com/spec).',
      '',
      '- Review *carefully*',
      '- Publish',
      '  - Notify the team',
      '',
      '> Markdown stays canonical.',
    ].join('\n'))
  })

  it('converts HTML tables and fenced code', () => {
    const html = `
      <table>
        <tr><th>Name</th><th>Status</th></tr>
        <tr><td>Callouts</td><td>Ready</td></tr>
      </table>
      <pre><code class="language-ts">const ready = true</code></pre>
    `

    expect(htmlToMarkdown(html)).toBe([
      '| Name | Status |',
      '| --- | --- |',
      '| Callouts | Ready |',
      '',
      '```ts',
      'const ready = true',
      '```',
    ].join('\n'))
  })

  it('drops active content and unsafe links from pasted HTML', () => {
    expect(htmlToMarkdown(`
      <p>Safe <a href="javascript:alert(1)">label</a>.</p>
      <script>alert('no')</script>
      <iframe src="https://example.com/embed"></iframe>
      <img src="data:text/html,unsafe" alt="unsafe">
    `)).toBe('Safe label.')
  })

  it('converts spreadsheet-style tabular text and escapes pipes', () => {
    expect(tabularTextToMarkdown('Name\tStatus\nCallouts\tReady\nA | B\tLater')).toBe([
      '| Name | Status |',
      '| --- | --- |',
      '| Callouts | Ready |',
      '| A \\| B | Later |',
    ].join('\n'))
    expect(tabularTextToMarkdown('ordinary text')).toBeNull()
  })

  it('recognizes Markdown that should be preserved instead of converted from HTML', () => {
    expect(looksLikeMarkdown('# Heading\n\n- Item')).toBe(true)
    expect(looksLikeMarkdown('See [[Project Alpha]]')).toBe(true)
    expect(looksLikeMarkdown('An ordinary sentence.')).toBe(false)
  })

  it.each(richPasteFixtures)('handles the $source fixture: $title', (fixture) => {
    expect(richClipboardToMarkdown(fixture.plain, fixture.html)).toBe(fixture.expected)
  })
})

describe('MarkdownEditor rich paste', () => {
  it('inserts converted HTML at the selection', async () => {
    const onChange = vi.fn()
    const ref = createRef<MarkdownEditorHandle>()
    const { container } = render(
      <MarkdownEditor ref={ref} value={'Before After'} onChange={onChange} />,
    )
    const content = container.querySelector('.cm-content') as HTMLElement
    await waitFor(() => expect(ref.current?.setSelection(7, 12)).toBe(true))

    fireEvent.paste(content, {
      clipboardData: {
        items: [],
        getData: (type: string) => type === 'text/html'
          ? '<p><strong>pasted</strong> text</p>'
          : 'pasted text',
      },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Before **pasted** text'))
  })

  it('turns tab-delimited clipboard text into a Markdown table', async () => {
    const onChange = vi.fn()
    const { container } = render(<MarkdownEditor value={''} onChange={onChange} />)

    fireEvent.paste(container.querySelector('.cm-content')!, {
      clipboardData: {
        items: [],
        getData: (type: string) => type === 'text/plain' ? 'Name\tStatus\nCallouts\tReady' : '',
      },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      '| Name | Status |\n| --- | --- |\n| Callouts | Ready |',
    ))
  })

  it('uses Mod-Shift-V as a plain-text escape hatch', async () => {
    const onChange = vi.fn()
    const { container } = render(<MarkdownEditor value={''} onChange={onChange} />)
    const content = container.querySelector('.cm-content')!

    fireEvent.keyDown(content, { key: 'v', metaKey: true, shiftKey: true })
    fireEvent.paste(content, {
      clipboardData: {
        items: [],
        getData: (type: string) => type === 'text/html' ? '<strong>Bold</strong>' : 'Bold',
      },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('Bold'))
  })

  it('can disable rich conversion while retaining existing URL paste behavior', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <MarkdownEditor value={''} onChange={onChange} richPaste={false} />,
    )

    fireEvent.paste(container.querySelector('.cm-content')!, {
      clipboardData: {
        items: [],
        getData: (type: string) => type === 'text/plain' ? 'https://example.com' : '',
      },
    })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(
      '[https://example.com](https://example.com)',
    ))
  })
})
