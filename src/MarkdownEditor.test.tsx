import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor } from './MarkdownEditor'
import { toggleBold, toggleItalic } from './toolbar/commands'

describe('MarkdownEditor', () => {
  // ── readOnlyOnBlur (viewing mode) ───────────────────────────────────────

  it('starts in viewing mode when readOnlyOnBlur=true and autoFocus=false', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello **world**'}
        onChange={vi.fn()}
        readOnlyOnBlur
      />
    )
    expect(container.querySelector('.me-renderer')).toBeTruthy()
    expect(container.querySelector('.minueditor')).toBeFalsy()
  })

  it('switches to editing mode when the renderer is clicked', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        readOnlyOnBlur
      />
    )
    const renderer = container.querySelector('.me-renderer')!
    fireEvent.click(renderer)
    expect(container.querySelector('.minueditor')).toBeTruthy()
    expect(container.querySelector('.me-renderer')).toBeFalsy()
  })

  it('activates editing on Enter key in viewing mode', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        readOnlyOnBlur
      />
    )
    const renderer = container.querySelector('.me-renderer')!
    fireEvent.keyDown(renderer, { key: 'Enter' })
    expect(container.querySelector('.minueditor')).toBeTruthy()
  })

  it('passes className to the renderer in viewing mode', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        readOnlyOnBlur
        className={'my-cls'}
      />
    )
    expect(container.querySelector('.me-renderer.my-cls')).toBeTruthy()
  })

  // ── readOnly (never editable) ────────────────────────────────────────────

  it('does not switch to editing when readOnly=true in readOnlyOnBlur mode', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        readOnlyOnBlur
        readOnly
      />
    )
    const renderer = container.querySelector('.me-renderer')!
    // renderer should have no onClick when readOnly — clicking does nothing
    fireEvent.click(renderer)
    expect(container.querySelector('.me-renderer')).toBeTruthy()
  })

  // ── editing mode ─────────────────────────────────────────────────────────

  it('starts in editing mode by default', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} />
    )
    // CM6 wraps content in .minueditor-wrap
    expect(container.querySelector('.minueditor-wrap')).toBeTruthy()
  })

  it('mounts the CM6 editor element', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} />
    )
    // CM6 creates a .cm-editor element inside .minueditor
    expect(container.querySelector('.cm-editor')).toBeTruthy()
  })

  it('passes className to the wrapper in editing mode', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} className={'foo'} />
    )
    expect(container.querySelector('.minueditor-wrap.foo')).toBeTruthy()
  })

  it('calls onViewReady with the EditorView after mounting', () => {
    const onViewReady = vi.fn()
    render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} onViewReady={onViewReady} />
    )
    expect(onViewReady).toHaveBeenCalledOnce()
    const view = onViewReady.mock.calls[0][0]
    // The view should expose .state
    expect(view).toHaveProperty('state')
  })

  it('starts in editing mode when autoFocus=true even with readOnlyOnBlur', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        readOnlyOnBlur
        autoFocus
      />
    )
    expect(container.querySelector('.minueditor-wrap')).toBeTruthy()
  })

  // ── floatingToolbar ──────────────────────────────────────────────────────

  it('does not render FloatingToolbar when floatingToolbar=false', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} />
    )
    // FloatingToolbar is invisible until a selection is made; it shouldn't
    // be in the DOM at all when floatingToolbar prop is false
    expect(container.querySelector('.me-toolbar--floating')).toBeFalsy()
  })

  it('prevents the native meta+i shortcut in the editor contenteditable', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} />
    )

    const content = container.querySelector('.cm-content')!
    const event = new KeyboardEvent('keydown', {
      key: 'i',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    })

    const prevented = !content.dispatchEvent(event)

    expect(prevented || event.defaultPrevented).toBe(true)
  })

  it('prevents native formatItalic beforeinput events in the editor contenteditable', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} />
    )

    const content = container.querySelector('.cm-content')!
    const event = new InputEvent('beforeinput', {
      inputType: 'formatItalic',
      bubbles: true,
      cancelable: true,
    })

    const prevented = !content.dispatchEvent(event)

    expect(prevented || event.defaultPrevented).toBe(true)
  })

  it('uses markdown italic toggle instead of CodeMirror parent selection on meta+i', async () => {
    let view: EditorView | null = null

    const { container } = render(
      <MarkdownEditor
        value={'hello'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 5 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'i', metaKey: true })

    expect(view!.state.doc.toString()).toBe('hello**')
    expect(view!.state.selection.main.from).toBe(6)
    expect(view!.state.selection.main.to).toBe(6)
  })

  it('hides inline markdown markers when the selection is outside the formatted text', async () => {
    const { container } = render(
      <MarkdownEditor value={'Hello **world**'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.me-token--inline')).toHaveLength(2)
      expect(container.querySelector('.me-bold')).toBeTruthy()
    })
  })

  it('keeps inline markdown markers hidden when the cursor moves inside formatted text', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'Hello **world**'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 8 } })
    })

    await waitFor(() => {
      expect(container.querySelectorAll('.me-token--inline')).toHaveLength(2)
      expect(container.querySelector('.me-bold')).toBeTruthy()
    })
  })

  it('reveals inline markdown markers when the selection touches a marker', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'Hello **world**'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 6, head: 8 } })
    })

    await waitFor(() => {
      expect(container.querySelector('.me-token--inline')).toBeFalsy()
      expect(container.querySelector('.me-bold')).toBeFalsy()
    })
  })

  it('hides italic markdown markers while the cursor is inside italic text', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'Hello *world*'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 8 } })
    })

    await waitFor(() => {
      expect(container.querySelectorAll('.me-token--inline')).toHaveLength(2)
      expect(container.querySelector('.me-italic')).toBeTruthy()
    })
  })

  it('exits italic cleanly after a completed bold segment and plain text', async () => {
    let view: EditorView | null = null

    render(
      <MarkdownEditor
        value={''}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      toggleBold(view!)
      view!.dispatch({
        changes: { from: 2, to: 2, insert: 'bold' },
        selection: { anchor: 6 },
      })
      toggleBold(view!)
      view!.dispatch({
        changes: { from: 8, to: 8, insert: ' plain ' },
        selection: { anchor: 15 },
      })
      toggleItalic(view!)
      view!.dispatch({
        changes: { from: 16, to: 16, insert: 'italic' },
        selection: { anchor: 22 },
      })
      toggleItalic(view!)
    })

    expect(view!.state.doc.toString()).toBe('**bold** plain *italic*')
    expect(view!.state.selection.main.from).toBe(23)
    expect(view!.state.selection.main.to).toBe(23)
  })

  it('hides heading markers on inactive lines', async () => {
    const { container } = render(
      <MarkdownEditor value={'Intro\n# Heading'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-token--block')).toBeTruthy()
      expect(container.querySelector('.me-h1')).toBeTruthy()
    })
  })

  it('keeps heading markers visible on the active line', async () => {
    const { container } = render(
      <MarkdownEditor value={'# Heading'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-h1')).toBeTruthy()
      expect(container.querySelector('.me-token--block')).toBeFalsy()
    })
  })

  it('uses list marker decorations only on inactive list lines', async () => {
    const { container } = render(
      <MarkdownEditor value={'Intro\n- bullet\n1. ordered'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-unordered-list-marker')).toBeTruthy()
      expect(container.querySelector('.me-ordered-list-marker')).toBeTruthy()
    })
  })

  it('shows the unordered bullet decoration on the active list line', async () => {
    const { container } = render(
      <MarkdownEditor value={'- bullet'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-unordered-list-marker')).toBeTruthy()
    })
  })

  it('renders interactive task checkboxes and toggles markdown when clicked', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <MarkdownEditor value={'- [ ] task'} onChange={onChange} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-checkbox')).toBeTruthy()
    })

    const checkbox = container.querySelector('.me-checkbox') as HTMLInputElement
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
      const latestValue = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(latestValue).toBe('- [x] task')
    })
  })

  it('does not render unordered bullet decoration for task list items', async () => {
    const { container } = render(
      <MarkdownEditor value={'- [ ] task'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-checkbox')).toBeTruthy()
      expect(container.querySelector('.me-unordered-list-marker')).toBeFalsy()
      expect(container.querySelector('.me-token--block')).toBeTruthy()
    })
  })

  it('toggles indented task checkboxes without corrupting markdown text', async () => {
    const onChange = vi.fn()
    const { container } = render(
      <MarkdownEditor value={'- parent\n    - [ ] dsflskdjf'} onChange={onChange} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-checkbox')).toBeTruthy()
    })

    const checkbox = container.querySelector('.me-checkbox') as HTMLInputElement
    fireEvent.click(checkbox)

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
      const latestValue = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(latestValue).toBe('- parent\n    - [x] dsflskdjf')
      expect(latestValue).not.toContain('[x] [ ]')
    })
  })

  it('wraps selected text as a markdown link when a URL is pasted', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'hello world'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 0, head: 5 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.paste(content, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? 'https://example.com' : '',
      },
    })

    expect(view!.state.doc.toString()).toBe('[hello](https://example.com) world')
  })

  it('inserts [url](url) when a URL is pasted on an empty line', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={''}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    const content = container.querySelector('.cm-content')!
    fireEvent.paste(content, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? 'https://example.com' : '',
      },
    })

    expect(view!.state.doc.toString()).toBe(
      '[https://example.com](https://example.com)'
    )
  })

  it('styles markdown links as underlined links when markers are hidden', async () => {
    const { container } = render(
      <MarkdownEditor value={'[example](https://example.com)'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-link')).toBeTruthy()
      expect(container.querySelectorAll('.me-token--inline').length).toBeGreaterThan(0)
    })
  })
})
