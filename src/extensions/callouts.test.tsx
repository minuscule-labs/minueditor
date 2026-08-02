import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { createRef } from 'react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor, type MarkdownEditorHandle } from '../MarkdownEditor'
import { enhanceRendererCallouts, findCalloutBlocks } from './callouts'

function parse(value: string) {
  return EditorState.create({
    doc: value,
    extensions: [markdown({ base: markdownLanguage })],
  })
}

describe('GitHub-style callouts', () => {
  it('finds supported callouts and preserves their exact source ranges', () => {
    const value = [
      '> [!NOTE]',
      '> First line.',
      '>',
      '> - item',
      '',
      '> ordinary quote',
      '',
      '> [!WARNING]',
      '> Be careful.',
    ].join('\n')

    const blocks = findCalloutBlocks(parse(value))

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      type: 'note',
      from: 0,
      markerFrom: 2,
      markerTo: 9,
      startLine: 1,
      endLine: 4,
    })
    expect(value.slice(blocks[0].from, blocks[0].to)).toBe(
      '> [!NOTE]\n> First line.\n>\n> - item',
    )
    expect(blocks[1]).toMatchObject({ type: 'warning', startLine: 8, endLine: 9 })
  })

  it('leaves unknown and malformed markers as ordinary blockquotes', () => {
    const state = parse([
      '> [!CUSTOM]',
      '> Unknown.',
      '',
      '> [!TIP] trailing title',
      '> Not portable GitHub syntax.',
      '',
      '> [!CAUTION',
    ].join('\n'))

    expect(findCalloutBlocks(state)).toEqual([])
  })

  it('enhances static blockquotes without changing nested Markdown content', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <blockquote><p>[!IMPORTANT]\nRead <strong>this</strong>.</p><ul><li>Item</li></ul></blockquote>
      <blockquote><p>Ordinary quote</p></blockquote>
    `

    enhanceRendererCallouts(container)

    const callout = container.querySelector('.me-callout--important')
    expect(callout).toHaveAttribute('aria-label', 'Important')
    expect(callout?.querySelector('.me-callout-title')).toHaveTextContent('Important')
    expect(callout?.querySelector('p')).toHaveTextContent('Read this.')
    expect(callout?.querySelector('strong')).toHaveTextContent('this')
    expect(callout?.querySelector('li')).toHaveTextContent('Item')
    expect(container.querySelectorAll('.me-callout')).toHaveLength(1)
  })

  it('composes callout styling with resolved wikilinks', async () => {
    const { container } = render(
      <MarkdownEditor
        value={'> [!NOTE]\n> See [[Project Alpha|the project notes]].'}
        onChange={vi.fn()}
        wikiLinks={{
          resolve: (target) => ({ status: target === 'Project Alpha' ? 'resolved' : 'unresolved' }),
        }}
      />,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.me-callout-line--note')).toHaveLength(2)
      expect(container.querySelector('.me-wikilink--resolved')).toHaveTextContent('the project notes')
    })
  })

  it('styles callout lines and reveals the source marker while editing it', async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const { container } = render(
      <MarkdownEditor
        ref={ref}
        value={'> [!TIP]\n> Helpful text.'}
        onChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.me-callout-line--tip')).toHaveLength(2)
      expect(container.querySelector('.me-callout-label--tip')).toHaveTextContent('Tip')
    })

    expect(ref.current?.setSelection(4)).toBe(true)
    await waitFor(() => {
      expect(container.querySelector('.me-callout-label--tip')).not.toBeInTheDocument()
      expect(container.querySelector('.cm-content')).toHaveTextContent('[!TIP]')
    })
  })
})
