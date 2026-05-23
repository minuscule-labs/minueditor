import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { createRef, useEffect, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor } from './MarkdownEditor'
import { toggleBold, toggleItalic } from './toolbar/commands'

describe('MarkdownEditor', () => {
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

  it('reports editor state on mount and external value changes', async () => {
    const onStateChange = vi.fn()
    const { rerender } = render(
      <MarkdownEditor
        value={'# Heading'}
        baselineValue={'# Heading'}
        onChange={vi.fn()}
        onStateChange={onStateChange}
      />
    )

    await waitFor(() => {
      expect(onStateChange).toHaveBeenCalled()
      expect(onStateChange.mock.calls.at(-1)?.[0]).toMatchObject({
        value: '# Heading',
        isDirty: false,
        isEmpty: false,
        activeLine: { number: 1, text: '# Heading' },
        activeMarks: { headingLevel: 1 },
      })
    })

    rerender(
      <MarkdownEditor
        value={'# Heading changed'}
        baselineValue={'# Heading'}
        onChange={vi.fn()}
        onStateChange={onStateChange}
      />
    )

    await waitFor(() => {
      expect(onStateChange.mock.calls.at(-1)?.[0]).toMatchObject({
        value: '# Heading changed',
        isDirty: true,
      })
    })
  })

  it('exposes getState and markClean through the editor ref', async () => {
    const ref = createRef<React.ElementRef<typeof MarkdownEditor>>()
    let view: EditorView | null = null

    render(
      <MarkdownEditor
        ref={ref}
        value={'Hello'}
        baselineValue={'Original'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    expect(ref.current?.getState()?.isDirty).toBe(true)

    act(() => {
      ref.current?.markClean()
    })

    expect(ref.current?.getState()?.isDirty).toBe(false)
  })

  it('reports selection and active line changes', async () => {
    const onStateChange = vi.fn()
    let view: EditorView | null = null

    render(
      <MarkdownEditor
        value={'First line\n## Second line'}
        onChange={vi.fn()}
        onStateChange={onStateChange}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 14 } })
    })

    await waitFor(() => {
      expect(onStateChange.mock.calls.at(-1)?.[0]).toMatchObject({
        selection: { from: 14, to: 14, empty: true },
        activeLine: { number: 2, text: '## Second line' },
        activeMarks: { headingLevel: 2 },
      })
    })
  })

  it('reports readOnly changes in editor state', async () => {
    const onStateChange = vi.fn()
    const { rerender } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        onStateChange={onStateChange}
      />
    )

    await waitFor(() => {
      expect(onStateChange.mock.calls.at(-1)?.[0]).toMatchObject({
        readOnly: false,
      })
    })

    rerender(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        onStateChange={onStateChange}
        readOnly
      />
    )

    await waitFor(() => {
      expect(onStateChange.mock.calls.at(-1)?.[0]).toMatchObject({
        readOnly: true,
      })
    })
  })

  it('starts in editing mode when autoFocus=true', () => {
    const { container } = render(<MarkdownEditor value={'Hello'} onChange={vi.fn()} autoFocus />)
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

  it('renders table widgets by default', async () => {
    const { container } = render(
      <MarkdownEditor value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-table-widget')).toBeTruthy()
    })
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

  it('renders heading decorations when markdown content loads asynchronously', async () => {
    function AsyncMarkdownEditor() {
      const [value, setValue] = useState('')

      useEffect(() => {
        setValue('# Heading')
      }, [])

      return <MarkdownEditor value={value} onChange={setValue} />
    }

    const { container } = render(<AsyncMarkdownEditor />)

    await waitFor(() => {
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

  it('renders horizontal rules as full-width lines on inactive lines', async () => {
    const { container } = render(
      <MarkdownEditor value={'Intro\n\n---'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-hr-line')).toBeTruthy()
      expect(container.querySelector('.me-hr-text')).toBeTruthy()
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

  it('uploads pasted images with the provided upload handler', async () => {
    const onChange = vi.fn()
    const onImageUpload = vi.fn(async () => 'https://cdn.example.com/note.png')
    const file = new File(['image'], 'note.png', { type: 'image/png' })
    const { container } = render(
      <MarkdownEditor value={''} onChange={onChange} onImageUpload={onImageUpload} />
    )

    const content = container.querySelector('.cm-content')!
    fireEvent.paste(content, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    })

    await waitFor(() => {
      expect(onImageUpload).toHaveBeenCalledWith(file)
      const latestValue = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(latestValue).toBe('![note.png](https://cdn.example.com/note.png)')
    })
  })

  it('uploads dropped images with the provided upload handler', async () => {
    const onChange = vi.fn()
    const onImageUpload = vi.fn(async () => 'https://cdn.example.com/drop.png')
    const file = new File(['image'], 'drop.png', { type: 'image/png' })
    const { container } = render(
      <MarkdownEditor value={''} onChange={onChange} onImageUpload={onImageUpload} />
    )

    const content = container.querySelector('.cm-content')!
    fireEvent.drop(content, {
      clientX: 0,
      clientY: 0,
      dataTransfer: {
        files: [file],
      },
    })

    await waitFor(() => {
      expect(onImageUpload).toHaveBeenCalledWith(file)
      const latestValue = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(latestValue).toBe('![drop.png](https://cdn.example.com/drop.png)')
    })
  })

  it('leaves a visible failure marker when image upload fails', async () => {
    const onChange = vi.fn()
    const onImageUpload = vi.fn(async () => {
      throw new Error('upload failed')
    })
    const file = new File(['image'], 'broken.png', { type: 'image/png' })
    const { container } = render(
      <MarkdownEditor value={''} onChange={onChange} onImageUpload={onImageUpload} />
    )

    const content = container.querySelector('.cm-content')!
    fireEvent.paste(content, {
      clipboardData: {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      },
    })

    await waitFor(() => {
      const latestValue = onChange.mock.calls[onChange.mock.calls.length - 1][0]
      expect(latestValue).toBe('[image upload failed: broken.png]')
    })
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

  it('pressing Enter at visual end of inline code inserts newline after closing marker', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'- **Bold**, *italic*, ~~strikethrough~~, `inline code`'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      // Simulate caret placed at visual EOL, before hidden closing backtick
      view!.dispatch({ selection: { anchor: 54 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'Enter' })

    expect(view!.state.doc.toString()).toBe(
      '- **Bold**, *italic*, ~~strikethrough~~, `inline code`\n- '
    )
    expect(view!.state.selection.main.from).toBe(57)
    expect(view!.state.selection.main.to).toBe(57)
  })

  it('pressing Enter inside inline code at visual end moves to next line without carrying marker', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'`text`'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      // Visual end of inline code content (before hidden closing backtick)
      view!.dispatch({ selection: { anchor: 5 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'Enter' })

    expect(view!.state.doc.toString()).toBe('`text`\n')
    expect(view!.state.selection.main.from).toBe(7)
    expect(view!.state.selection.main.to).toBe(7)
  })

  it('pressing Enter at end of a markdown table row inserts a new empty row', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 41 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'Enter' })

    expect(view!.state.doc.toString()).toBe(
      '| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|||'
    )
    expect(view!.state.selection.main.from).toBe(43)
    expect(view!.state.selection.main.to).toBe(43)
  })

  it('pressing Tab in a table cell moves to the next cell', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 32 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'Tab' })

    expect(view!.state.selection.main.from).toBe(37)
    expect(view!.state.selection.main.to).toBe(37)
  })

  it('pressing Tab at the last table cell inserts a new row', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 37 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'Tab' })

    expect(view!.state.doc.toString()).toBe(
      '| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|||'
    )
    expect(view!.state.selection.main.from).toBe(43)
    expect(view!.state.selection.main.to).toBe(43)
  })

  it('pressing Shift-Tab in first table cell moves to previous row', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |\n| Bob | 30 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 44 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'Tab', shiftKey: true })

    expect(view!.state.selection.main.from).toBe(37)
    expect(view!.state.selection.main.to).toBe(37)
  })

  it('pressing Cmd+Right inserts a table column to the right', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 31 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowRight', ctrlKey: true })

    expect(view!.state.doc.toString()).toBe(
      '| Name || Age |\n| --- | --- | --- |\n| Ada || 42 |'
    )
  })

  it('pressing Cmd+Left inserts a table column to the left', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 37 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowLeft', ctrlKey: true })

    expect(view!.state.doc.toString()).toBe(
      '| Name || Age |\n| --- | --- | --- |\n| Ada || 42 |'
    )
  })

  it('pressing Cmd+Down inserts a table row below', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 31 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowDown', ctrlKey: true })

    expect(view!.state.doc.toString()).toBe(
      '| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|||'
    )
  })

  it('pressing Cmd+Up inserts a table row above', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |\n| Bob | 30 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 44 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowUp', ctrlKey: true })

    expect(view!.state.doc.toString()).toBe(
      '| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|||\n| Bob | 30 |'
    )
  })

  it('renders markdown tables with the table widget', async () => {
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-table-widget')).toBeTruthy()
      expect(container.querySelectorAll('.me-table-render th').length).toBe(2)
      expect(container.querySelectorAll('.me-table-render td').length).toBe(2)
    })
  })

  it('activates table on ArrowUp from any cursor position on the line below', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |\nbottom text'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    // Place cursor in the middle of 'bottom text' (not at line start)
    act(() => {
      view!.dispatch({ selection: { anchor: 44 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowUp' })

    await waitFor(() => {
      expect(container.querySelector('.me-table-widget--editing')).toBeTruthy()
    })
  })

  it('activates codeblock on ArrowUp from any cursor position on the line below', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'```js\nconsole.log(1)\n```\nbottom text'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    // Place cursor in the middle of 'bottom text' (not at line start)
    act(() => {
      view!.dispatch({ selection: { anchor: 29 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowUp' })

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget--editing')).toBeTruthy()
    })
  })

  it('activates table on ArrowDown from any cursor position on the line above', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'top text\n| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    // Place cursor in the middle of 'top text' (not at line end)
    act(() => {
      view!.dispatch({ selection: { anchor: 4 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(container.querySelector('.me-table-widget--editing')).toBeTruthy()
    })
  })

  it('activates codeblock on ArrowDown from any cursor position on the line above', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'top text\n```js\nconsole.log(1)\n```'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    // Place cursor in the middle of 'top text' (not at line end)
    act(() => {
      view!.dispatch({ selection: { anchor: 4 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.keyDown(content, { key: 'ArrowDown' })

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget--editing')).toBeTruthy()
    })
  })
})
