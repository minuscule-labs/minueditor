import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from '../MarkdownEditor'
import type { MarkdownEditorProps } from '../types'
import { autolinkPaste } from './autolink'

function clipboard(plain: string, html = '', files: Array<{ kind: string; type: string }> = []) {
  return {
    getData: (type: string) => type === 'text/plain' ? plain : type === 'text/html' ? html : '',
    items: files,
  }
}

async function setup(
  value = '',
  wikiLinks: NonNullable<MarkdownEditorProps['wikiLinks']> = {},
  mode: 'live' | 'source' = 'live',
) {
  let view: EditorView | null = null
  const result = render(
    <MarkdownEditor
      value={value}
      onChange={vi.fn()}
      mode={mode}
      wikiLinks={wikiLinks}
      onViewReady={(next) => { view = next }}
    />,
  )
  await waitFor(() => expect(view).toBeTruthy())
  return { ...result, view: () => view!, content: result.container.querySelector('.cm-content')! }
}

describe('wikilink internal URL smart paste', () => {
  it.each(['live', 'source'] as const)('stores a bare recognized URL canonically in %s mode', async (mode) => {
    const resolvePastedUrl = vi.fn(() => ({ target: 'note_123' }))
    const { content, view } = await setup('', { resolvePastedUrl }, mode)

    fireEvent.paste(content, { clipboardData: clipboard('  https://notes.example/notes/note_123  ') })

    expect(view().state.doc.toString()).toBe('[[note_123]]')
    expect(view().state.selection.main.from).toBe(12)
    expect(resolvePastedUrl).toHaveBeenCalledWith(
      'https://notes.example/notes/note_123',
      { selectedText: '', mode },
    )
  })

  it('preserves selected text as a label', () => {
    const resolvePastedUrl = vi.fn(() => ({ target: 'note_123' }))
    const parent = document.createElement('div')
    document.body.append(parent)
    const view = new EditorView({
      parent,
      doc: 'before project plan after',
      selection: { anchor: 7, head: 19 },
      extensions: [
        autolinkPaste({ mode: 'source', resolvePastedUrl }),
      ],
    })

    fireEvent.paste(view.contentDOM, { clipboardData: clipboard('https://notes.example/notes/note_123') })

    expect(resolvePastedUrl).toHaveBeenCalledWith(expect.any(String), {
      selectedText: 'project plan',
      mode: 'source',
    })
    expect(view.state.doc.toString()).toBe('before [[note_123|project plan]] after')
    expect(view.state.selection.main.from).toBe(30)
    view.destroy()
    parent.remove()
  })

  it('keeps bare source title-independent while displaying the resolved title', async () => {
    const resolve = vi.fn(() => ({ status: 'resolved' as const, title: 'Project Plan' }))
    const { content, view, container } = await setup('', {
      resolvePastedUrl: () => ({ target: 'note_123' }),
      resolve,
    })
    fireEvent.paste(content, { clipboardData: clipboard('https://notes.example/notes/note_123') })

    expect(view().state.doc.toString()).toBe('[[note_123]]')
    await waitFor(() => expect(container.querySelector('.me-wikilink--resolved')?.textContent).toBe('Project Plan'))
    expect(resolve).toHaveBeenCalledWith('note_123')
    expect(view().state.doc.toString()).toBe('[[note_123]]')
  })

  it.each([
    ['null result', () => null],
    ['exception', () => { throw new Error('resolver failed') }],
    ['empty target', () => ({ target: ' ' })],
    ['multiline target', () => ({ target: 'note_1\nnote_2' })],
    ['closing markers', () => ({ target: 'note_1]]bad' })],
    ['label separator', () => ({ target: 'note_1|spoofed' })],
  ])('falls back to standard URL insertion for %s', async (_name, resolvePastedUrl) => {
    const { content, view } = await setup('', { resolvePastedUrl })
    fireEvent.paste(content, { clipboardData: clipboard('https://example.com') })
    expect(view().state.doc.toString()).toBe('[https://example.com](https://example.com)')
  })

  it.each([
    'mailto:test@example.com',
    '//notes.example/notes/note_123',
    'See https://notes.example/notes/note_123',
    'https://user:pass@notes.example/notes/note_123',
  ])('does not offer ineligible clipboard text to the resolver: %s', async (plain) => {
    const resolvePastedUrl = vi.fn(() => ({ target: 'note_123' }))
    const { content, view } = await setup('', { resolvePastedUrl })
    fireEvent.paste(content, { clipboardData: clipboard(plain) })
    expect(resolvePastedUrl).not.toHaveBeenCalled()
    if (plain.startsWith('https://')) {
      expect(view().state.doc.toString()).toBe(`[${plain}](${plain})`)
    } else {
      expect(view().state.doc.toString()).toBe(plain)
    }
  })

  it('recognizes exact URL text before rich anchor HTML', async () => {
    const { content, view } = await setup('', {
      resolvePastedUrl: () => ({ target: 'note_123' }),
    })
    fireEvent.paste(content, {
      clipboardData: clipboard(
        'https://notes.example/notes/note_123',
        '<a href="https://notes.example/notes/note_123">Project Plan</a>',
      ),
    })
    expect(view().state.doc.toString()).toBe('[[note_123]]')
  })

  it('uses an updated resolver and mode without remounting', async () => {
    let view: EditorView | null = null
    const first = vi.fn(() => ({ target: 'note_first' }))
    const second = vi.fn(() => ({ target: 'note_second' }))
    const props = {
      value: '',
      onChange: vi.fn(),
      onViewReady: (next: EditorView) => { view = next },
    }
    const result = render(
      <MarkdownEditor {...props} mode="live" wikiLinks={{ resolvePastedUrl: first }} />,
    )
    await waitFor(() => expect(view).toBeTruthy())
    const originalView = view

    result.rerender(
      <MarkdownEditor {...props} mode="source" wikiLinks={{ resolvePastedUrl: second }} />,
    )
    await waitFor(() => expect(view!.state.facet(EditorView.editable)).toBe(true))
    fireEvent.paste(result.container.querySelector('.cm-content')!, {
      clipboardData: clipboard('https://notes.example/notes/note_123'),
    })

    expect(view).toBe(originalView)
    expect(view!.state.doc.toString()).toBe('[[note_second]]')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith(expect.any(String), { selectedText: '', mode: 'source' })
  })

  it('is one undo step', async () => {
    const { content, view } = await setup('', {
      resolvePastedUrl: () => ({ target: 'note_123' }),
    })
    fireEvent.paste(content, { clipboardData: clipboard('https://notes.example/notes/note_123') })
    expect(view().state.doc.toString()).toBe('[[note_123]]')

    act(() => {
      view().focus()
      view().dispatch({ selection: { anchor: view().state.doc.length } })
    })
    fireEvent.keyDown(content, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(view().state.doc.toString()).toBe(''))
  })
})
