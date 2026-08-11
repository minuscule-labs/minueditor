import { undoDepth } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from '../MarkdownEditor'

const canonicalImage = '![diagram](/internal/attachments/att_123/content)'

describe('MarkdownEditor resource image resolution', () => {
  it('renders a resolved image while preserving canonical Markdown', async () => {
    let view: EditorView | null = null
    const resolver = vi.fn((source: string) => `https://api.example.com${source}`)
    const { container } = render(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={resolver}
        onViewReady={(nextView) => { view = nextView }}
      />,
    )

    const image = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)
    expect(image).toHaveAttribute(
      'src',
      'https://api.example.com/internal/attachments/att_123/content',
    )
    expect(resolver).toHaveBeenCalledWith('/internal/attachments/att_123/content', {
      kind: 'image',
    })
    expect(view!.state.doc.toString()).toBe(canonicalImage)
  })

  it('parses titles, angle brackets, escaped syntax, and balanced parentheses', async () => {
    const resolver = vi.fn((source: string) => source)
    const value = '![diagram](<https://example.com/image (large).png> "Diagram title")'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        resourceUrlResolver={resolver}
      />,
    )

    const image = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)
    expect(resolver).toHaveBeenCalledWith('https://example.com/image (large).png', {
      kind: 'image',
    })
    expect(image).toHaveAttribute('src', 'https://example.com/image (large).png')
    expect(image.src).toBe('https://example.com/image%20(large).png')
    expect(image).toHaveAttribute('title', 'Diagram title')
  })

  it('refreshes mounted image DOM when resolver identity changes', async () => {
    const firstResolver = (source: string) => `https://api-a.example${source}`
    const secondResolver = (source: string) => `https://api-b.example${source}`
    const { container, rerender } = render(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={firstResolver}
      />,
    )

    const firstImage = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)
    expect(firstImage).toHaveAttribute(
      'src',
      'https://api-a.example/internal/attachments/att_123/content',
    )

    rerender(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={secondResolver}
      />,
    )

    const secondImage = await waitFor(() => {
      const image = container.querySelector('.me-image') as HTMLImageElement
      expect(image).toHaveAttribute(
        'src',
        'https://api-b.example/internal/attachments/att_123/content',
      )
      return image
    })
    expect(secondImage).not.toBe(firstImage)
  })

  it('recovers from a broken-image placeholder after resolver identity changes', async () => {
    const { container, rerender } = render(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={(source) => `https://broken.example${source}`}
      />,
    )

    const image = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)
    fireEvent.error(image)
    expect(container.querySelector('.me-image')).toBeNull()
    expect(container.querySelector('.me-image-broken')).toBeInTheDocument()

    rerender(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={(source) => `https://working.example${source}`}
      />,
    )

    await waitFor(() => {
      expect(container.querySelector('.me-image')).toHaveAttribute(
        'src',
        'https://working.example/internal/attachments/att_123/content',
      )
      expect(container.querySelector('.me-image-broken')).toBeNull()
    })
  })

  it('fails closed for denied resolver output', async () => {
    const { container } = render(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={() => 'javascript:alert(1)'}
      />,
    )

    await waitFor(() => expect(container.querySelector('.me-image-wrapper')).toBeTruthy())
    expect(container.querySelector('.me-image')).toBeNull()
    expect(container.querySelector('.me-image-broken')).toHaveTextContent('[image: diagram]')
  })

  it('falls back to the canonical image when the resolver throws', async () => {
    const { container } = render(
      <MarkdownEditor
        value={canonicalImage}
        onChange={vi.fn()}
        resourceUrlResolver={() => { throw new Error('failed') }}
      />,
    )

    const image = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)
    expect(image).toHaveAttribute('src', '/internal/attachments/att_123/content')
  })

  it('preserves selection and history across resolver reconfiguration', async () => {
    let view: EditorView | null = null
    const firstResolver = (source: string) => `https://api-a.example${source}`
    const secondResolver = (source: string) => `https://api-b.example${source}`
    const { rerender } = render(
      <MarkdownEditor
        value={`Before\n\n${canonicalImage}\n\nAfter`}
        onChange={vi.fn()}
        resourceUrlResolver={firstResolver}
        onViewReady={(nextView) => { view = nextView }}
      />,
    )
    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 3 } })
    })
    const historyBefore = undoDepth(view!.state)

    rerender(
      <MarkdownEditor
        value={`Before\n\n${canonicalImage}\n\nAfter`}
        onChange={vi.fn()}
        resourceUrlResolver={secondResolver}
        onViewReady={(nextView) => { view = nextView }}
      />,
    )

    await waitFor(() => {
      expect(view!.state.selection.main.anchor).toBe(3)
      expect(undoDepth(view!.state)).toBe(historyBefore)
    })
  })
})
