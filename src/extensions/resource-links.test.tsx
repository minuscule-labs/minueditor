import type { EditorView } from '@codemirror/view'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from '../MarkdownEditor'

const canonicalLink = '[download](/internal/attachments/att_456/content)'

function runtimeResolver(origin: string) {
  return (source: string) => `${origin}${source}`
}

describe('MarkdownEditor resource link resolution', () => {
  it('renders a root-relative inline link while preserving its canonical destination', async () => {
    const { container } = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalLink}`}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api.example.com')}
      />,
    )

    const widget = await waitFor(() => container.querySelector('.me-link-widget') as HTMLElement)
    expect(widget).toHaveTextContent('download')
    expect(widget.dataset.meLinkUrl).toBe('/internal/attachments/att_456/content')
    expect(container.querySelector('.cm-content')?.textContent).not.toContain(
      'https://api.example.com',
    )
  })

  it('opens the resolved destination from live link controls', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container } = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalLink}`}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api.example.com')}
      />,
    )

    try {
      const widget = await waitFor(() => container.querySelector('.me-link-widget') as HTMLElement)
      fireEvent.mouseDown(widget, { ctrlKey: true })
      fireEvent.click(widget, { ctrlKey: true })

      expect(open).toHaveBeenCalledTimes(1)
      expect(open).toHaveBeenCalledWith(
        'https://api.example.com/internal/attachments/att_456/content',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      open.mockRestore()
    }
  })

  it('opens the resolved destination when Cmd/Ctrl-clicking raw link source', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={canonicalLink}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api.example.com')}
        onViewReady={(nextView) => { view = nextView }}
      />,
    )

    try {
      await waitFor(() => expect(view).toBeTruthy())
      act(() => {
        view!.dispatch({ selection: { anchor: 4 } })
      })
      vi.spyOn(view!, 'posAtCoords').mockReturnValue(4)
      expect(container.querySelector('.me-link-widget')).toBeNull()

      fireEvent.click(container.querySelector('.cm-content')!, {
        ctrlKey: true,
        clientX: 1,
        clientY: 1,
      })
      expect(open).toHaveBeenCalledWith(
        'https://api.example.com/internal/attachments/att_456/content',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      open.mockRestore()
    }
  })

  it('uses the latest resolver lazily for link activation', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const { container, rerender } = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalLink}`}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api-a.example')}
      />,
    )

    try {
      await waitFor(() => expect(container.querySelector('.me-link-widget')).toBeTruthy())
      rerender(
        <MarkdownEditor
          value={`Before\n\n${canonicalLink}`}
          onChange={vi.fn()}
          resourceUrlResolver={runtimeResolver('https://api-b.example')}
        />,
      )

      const widget = await waitFor(() => container.querySelector('.me-link-widget') as HTMLElement)
      fireEvent.mouseDown(widget, { ctrlKey: true })
      fireEvent.click(widget, { ctrlKey: true })

      expect(open).toHaveBeenCalledWith(
        'https://api-b.example/internal/attachments/att_456/content',
        '_blank',
        'noopener,noreferrer',
      )
    } finally {
      open.mockRestore()
    }
  })

  it('copies the resolved address from browser-style link controls', async () => {
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const { container } = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalLink}`}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api.example.com')}
      />,
    )

    try {
      const widget = await waitFor(() => container.querySelector('.me-link-widget') as HTMLElement)
      fireEvent.mouseOver(widget)
      const copy = await waitFor(() =>
        document.body.querySelector('[aria-label="Copy link"]') as HTMLButtonElement,
      )
      fireEvent.click(copy)

      expect(writeText).toHaveBeenCalledWith(
        'https://api.example.com/internal/attachments/att_456/content',
      )
    } finally {
      if (originalClipboard) {
        Object.defineProperty(navigator, 'clipboard', originalClipboard)
      } else {
        Reflect.deleteProperty(navigator, 'clipboard')
      }
    }
  })

  it('keeps the canonical destination in the link editing field', async () => {
    const { container } = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalLink}`}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api.example.com')}
      />,
    )

    const widget = await waitFor(() => container.querySelector('.me-link-widget') as HTMLElement)
    fireEvent.mouseOver(widget)
    const edit = await waitFor(() =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === 'Edit',
      ) as HTMLButtonElement,
    )
    fireEvent.click(edit)

    expect(document.body.querySelector<HTMLInputElement>('[aria-label="Link URL"]')?.value).toBe(
      '/internal/attachments/att_456/content',
    )
  })

  it('preserves canonical Markdown when copied from the editor selection', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={canonicalLink}
        onChange={vi.fn()}
        resourceUrlResolver={runtimeResolver('https://api.example.com')}
        onViewReady={(nextView) => { view = nextView }}
      />,
    )
    await waitFor(() => expect(view).toBeTruthy())
    act(() => {
      view!.dispatch({ selection: { anchor: 0, head: view!.state.doc.length } })
    })

    const clipboard: Record<string, string> = {}
    fireEvent.copy(container.querySelector('.cm-content')!, {
      clipboardData: {
        setData: (type: string, value: string) => { clipboard[type] = value },
      },
    })

    expect(clipboard['text/plain']).toBe(canonicalLink)
  })

  it('preserves titles and complete balanced-parenthesis URLs during link edits', async () => {
    let view: EditorView | null = null
    const value = '[reference](https://example.com/a_(b) "Reference title")'
    const { container } = render(
      <MarkdownEditor
        value={`Before\n\n${value}`}
        onChange={vi.fn()}
        onViewReady={(nextView) => { view = nextView }}
      />,
    )
    await waitFor(() => expect(view).toBeTruthy())

    const widget = await waitFor(() => container.querySelector('.me-link-widget') as HTMLElement)
    expect(widget.dataset.meLinkUrl).toBe('https://example.com/a_(b)')
    fireEvent.mouseOver(widget)
    const edit = await waitFor(() =>
      Array.from(document.body.querySelectorAll<HTMLButtonElement>('button')).find(
        (button) => button.textContent === 'Edit',
      ) as HTMLButtonElement,
    )
    fireEvent.click(edit)
    const label = document.body.querySelector<HTMLInputElement>('[aria-label="Link text"]')!
    fireEvent.change(label, { target: { value: 'updated' } })

    await waitFor(() => {
      expect(view!.state.doc.toString()).toBe(
        'Before\n\n[updated](https://example.com/a_(b) "Reference title")',
      )
    })
  })

  it('fails closed for unsafe canonical and resolved destinations', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const unsafeCanonical = render(
      <MarkdownEditor
        value={'Before\n\n[unsafe](javascript:alert(1))\n\n[encoded](java&#x73;cript&colon;alert(1))'}
        onChange={vi.fn()}
      />,
    )
    await waitFor(() => expect(unsafeCanonical.container.querySelector('.cm-content')).toBeTruthy())
    expect(unsafeCanonical.container.querySelector('.me-link-widget')).toBeNull()
    unsafeCanonical.unmount()

    const unsafeResolved = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalLink}`}
        onChange={vi.fn()}
        resourceUrlResolver={() => 'javascript:alert(1)'}
      />,
    )

    try {
      const widget = await waitFor(
        () => unsafeResolved.container.querySelector('.me-link-widget') as HTMLElement,
      )
      fireEvent.mouseDown(widget, { ctrlKey: true })
      fireEvent.click(widget, { ctrlKey: true })
      expect(open).not.toHaveBeenCalled()
    } finally {
      open.mockRestore()
    }
  })

  it('does not add live widgets for reference links, autolinks, or wikilinks', async () => {
    const value = [
      '[reference][id]',
      '',
      '<https://example.com/angle>',
      '',
      'https://example.com/bare',
      '',
      '[[Project Alpha]]',
      '',
      '[id]: /reference',
    ].join('\n')
    const resolver = vi.fn((source: string) => source)
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} resourceUrlResolver={resolver} />,
    )

    await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
    expect(container.querySelector('.me-link-widget')).toBeNull()
    expect(resolver).not.toHaveBeenCalled()
  })
})
