import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  markdownParityFixtures,
  type ParityExpectation,
} from '../dev/fixtures/markdown-parity'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownRenderer } from './renderer'

function assertExpectation(container: HTMLElement, expectation: ParityExpectation): void {
  const matches = container.querySelectorAll(expectation.selector)
  if (expectation.count != null) {
    expect(matches, expectation.selector).toHaveLength(expectation.count)
  } else {
    expect(matches.length, expectation.selector).toBeGreaterThan(0)
  }

  if (expectation.text != null) {
    expect(matches[0], expectation.selector).toHaveTextContent(expectation.text)
  }
}

describe('editor/static parity fixtures', () => {
  it('keeps fixture identifiers unique', () => {
    const ids = markdownParityFixtures.map((fixture) => fixture.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  for (const fixture of markdownParityFixtures) {
    it(`renders ${fixture.title} in the live editor without mutating source`, async () => {
      const onChange = vi.fn()
      const { container } = render(
        <MarkdownEditor
          value={fixture.markdown}
          onChange={onChange}
          {...(fixture.annotations ? { annotations: fixture.annotations } : {})}
          wikiLinks={{
            resolve: (target) => ({
              status: target === 'Project Alpha' ? 'resolved' : 'unresolved',
            }),
          }}
          minHeight={360}
        />,
      )

      await waitFor(() => {
        for (const expectation of fixture.editor) {
          assertExpectation(container, expectation)
        }
      })

      for (const selector of fixture.editorAbsent ?? []) {
        expect(container.querySelector(selector), selector).not.toBeInTheDocument()
      }
      expect(onChange).not.toHaveBeenCalled()
    })

    it(`renders ${fixture.title} through the static renderer`, async () => {
      const { container } = render(<MarkdownRenderer value={fixture.markdown} />)

      await waitFor(() => {
        for (const expectation of fixture.renderer) {
          assertExpectation(container, expectation)
        }
      })

      for (const selector of fixture.rendererAbsent ?? []) {
        expect(container.querySelector(selector), selector).not.toBeInTheDocument()
      }
    })
  }

  it('keeps canonical resources stable while resolving live and static destinations', async () => {
    const value = [
      '[Download](/internal/attachments/att_link/content)',
      '',
      '![Diagram](/internal/attachments/att_image/content)',
    ].join('\n')
    const resolver = (source: string) => `https://api.example.com${source}`
    const onChange = vi.fn()
    const editor = render(
      <MarkdownEditor
        value={value}
        onChange={onChange}
        resourceUrlResolver={resolver}
      />,
    )
    const renderer = render(
      <MarkdownRenderer value={value} resourceUrlResolver={resolver} />,
    )

    await waitFor(() => {
      expect(editor.container.querySelector('.me-link-widget')).toHaveAttribute(
        'data-me-link-url',
        '/internal/attachments/att_link/content',
      )
      expect(editor.container.querySelector('.me-image')).toHaveAttribute(
        'src',
        'https://api.example.com/internal/attachments/att_image/content',
      )
    })
    expect(renderer.container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api.example.com/internal/attachments/att_link/content',
    )
    expect(renderer.container.querySelector('img')).toHaveAttribute(
      'src',
      'https://api.example.com/internal/attachments/att_image/content',
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps portable syntax visible in source mode', () => {
    const fixture = markdownParityFixtures.find(({ id }) => id === 'callout-composition')
    expect(fixture).toBeDefined()

    const { container } = render(
      <MarkdownEditor
        value={fixture!.markdown}
        onChange={vi.fn()}
        mode="source"
        wikiLinks={{ enabled: true }}
      />,
    )

    expect(container.querySelector('.cm-content')).toHaveTextContent('[!IMPORTANT]')
    expect(container.querySelector('.cm-content')).toHaveTextContent('[[Project Alpha|the project note]]')
    expect(container.querySelector('.me-callout-line')).not.toBeInTheDocument()
    expect(container.querySelector('.me-wikilink')).not.toBeInTheDocument()
  })
})
