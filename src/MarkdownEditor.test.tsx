import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { createRef, useEffect, useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import type { CompletionContext } from '@codemirror/autocomplete'
import { HighlightStyle, LanguageDescription } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor'
import { editorSlashCommands, slashCommandCompletions } from './extensions/slash-commands'
import { toggleBold, toggleItalic } from './toolbar/commands'

function applyEditorSlashCommand(view: EditorView, label: string) {
  const result = slashCommandCompletions({
    state: view.state,
    pos: view.state.selection.main.from,
    explicit: true,
  } as CompletionContext, editorSlashCommands)
  const option = result!.options.find((completion) => completion.label === label)!
  const apply = option.apply
  expect(typeof apply).toBe('function')
  if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)
}

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

  it('allows native writing assistance by default', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} />
    )
    const content = container.querySelector('.cm-content')!

    expect(content.getAttribute('spellcheck')).toBe('true')
    expect(content.getAttribute('autocorrect')).toBe('on')
    expect(content.getAttribute('autocomplete')).toBe('on')
    expect(content.getAttribute('autocapitalize')).toBe('sentences')
  })

  it('allows consumers to disable native writing assistance', () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        spellCheck={false}
        autoCorrect="off"
        autoComplete="off"
        autoCapitalize="off"
      />
    )
    const content = container.querySelector('.cm-content')!

    expect(content.getAttribute('spellcheck')).toBe('false')
    expect(content.getAttribute('autocorrect')).toBe('off')
    expect(content.getAttribute('autocomplete')).toBe('off')
    expect(content.getAttribute('autocapitalize')).toBe('off')
  })

  it('passes className to the wrapper in editing mode', () => {
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={vi.fn()} className={'foo'} />
    )
    expect(container.querySelector('.minueditor-wrap.foo')).toBeTruthy()
  })

  it('wires wikilink rendering through the wikiLinks prop', async () => {
    const { container } = render(
      <MarkdownEditor
        value={'See [[Note B|the note]] today'}
        onChange={vi.fn()}
        wikiLinks={{
          resolve: (target) => ({ status: target === 'Note B' ? 'resolved' : 'unresolved' }),
          suggest: async () => [],
        }}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-wikilink--resolved')).toBeTruthy()
      expect(container.querySelector('.me-wikilink-label')?.textContent).toBe('the note')
    })
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

  it('exposes common editor commands through the ref handle', async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const onChange = vi.fn()
    const { container } = render(
      <MarkdownEditor value={'Hello'} onChange={onChange} ref={ref} />
    )

    await waitFor(() => expect(ref.current?.view).toBeTruthy())

    expect(ref.current?.getMarkdown()).toBe('Hello')
    expect(ref.current?.setSelection(5)).toBe(true)
    expect(ref.current?.insertMarkdown(' world')).toBe(true)

    await waitFor(() => {
      expect(ref.current?.getMarkdown()).toBe('Hello world')
      expect(onChange).toHaveBeenCalledWith('Hello world')
    })

    expect(ref.current?.undo()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('Hello'))

    expect(ref.current?.redo()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('Hello world'))

    expect(ref.current?.setSelection(0, 5)).toBe(true)
    expect(ref.current?.replaceSelection('Hi')).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('Hi world'))

    expect(ref.current?.setSelection(ref.current.getMarkdown()!.length)).toBe(true)
    expect(ref.current?.insertImage({ src: 'https://example.com/a.png', alt: 'A' })).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('Hi world![A](https://example.com/a.png)'))

    expect(ref.current?.openImagePicker()).toBe(true)
    await waitFor(() => expect(container.querySelector('.me-image-picker')).toBeTruthy())
  })

  it('exposes formatting and block insertion commands through the ref handle', async () => {
    const ref = createRef<MarkdownEditorHandle>()
    render(<MarkdownEditor value={'Hello'} onChange={vi.fn()} ref={ref} />)

    await waitFor(() => expect(ref.current?.view).toBeTruthy())

    expect(ref.current?.setSelection(0, 5)).toBe(true)
    expect(ref.current?.toggleBold()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toBe('**Hello**'))

    expect(ref.current?.setSelection(2, 7)).toBe(true)
    expect(ref.current?.toggleItalic()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('*Hello*'))

    expect(ref.current?.setSelection(ref.current.getMarkdown()!.length)).toBe(true)
    expect(ref.current?.toggleInlineCode()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('``'))

    expect(ref.current?.insertTable()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('| --- | --- |'))

    expect(ref.current?.insertCodeBlock()).toBe(true)
    await waitFor(() => expect(ref.current?.getMarkdown()).toContain('```'))
  })

  it('returns false for mutating ref commands in readOnly mode', async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const onChange = vi.fn()
    render(<MarkdownEditor value={'Hello'} onChange={onChange} ref={ref} readOnly />)

    await waitFor(() => expect(ref.current?.view).toBeTruthy())

    expect(ref.current?.focus()).toBe(true)
    expect(ref.current?.getMarkdown()).toBe('Hello')
    expect(ref.current?.setSelection(5)).toBe(true)
    expect(ref.current?.insertMarkdown(' world')).toBe(false)
    expect(ref.current?.replaceSelection('Hi')).toBe(false)
    expect(ref.current?.insertImage({ src: 'https://example.com/a.png' })).toBe(false)
    expect(ref.current?.openImagePicker()).toBe(false)
    expect(ref.current?.toggleBold()).toBe(false)
    expect(ref.current?.insertTable()).toBe(false)
    expect(ref.current?.insertCodeBlock()).toBe(false)
    expect(ref.current?.undo()).toBe(false)
    expect(ref.current?.redo()).toBe(false)
    expect(ref.current?.getMarkdown()).toBe('Hello')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('returns false for ref commands after unmount', () => {
    const ref = createRef<MarkdownEditorHandle>()
    const { unmount } = render(<MarkdownEditor value={'Hello'} onChange={vi.fn()} ref={ref} />)

    expect(ref.current?.focus()).toBe(true)
    unmount()
    expect(ref.current).toBeNull()
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

  it('renders document annotations and forwards clicks', async () => {
    const onAnnotationClick = vi.fn()

    const { container } = render(
      <MarkdownEditor
        value={'First line\nSecond line\nThird line'}
        onChange={vi.fn()}
        annotations={[
          {
            id: 'annotation-1',
            documentId: 'doc-1',
            kind: 'comment',
            actorType: 'agent',
            status: 'open',
            anchorType: 'line',
            startLine: 2,
            endLine: 2,
            label: 'AI comment',
          },
        ]}
        onAnnotationClick={onAnnotationClick}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('[data-me-annotation-id="annotation-1"]')).toBeTruthy()
    })

    const annotation = container.querySelector('[data-me-annotation-id="annotation-1"]') as HTMLElement
    expect(annotation.className).toContain('me-annotation--kind-comment')
    expect(annotation.className).toContain('me-annotation--actor-agent')
    expect(annotation.className).toContain('me-annotation--status-open')

    fireEvent.click(annotation)

    expect(onAnnotationClick).toHaveBeenCalledOnce()
    expect(onAnnotationClick.mock.calls[0][0]).toMatchObject({
      id: 'annotation-1',
      kind: 'comment',
      actorType: 'agent',
      status: 'open',
    })
  })

  it('uses live mode by default for visual widgets and markdown token hiding', async () => {
    const { container } = render(
      <MarkdownEditor value={'# Heading\n\n![test](https://example.com/test.png)'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-h1')).toBeTruthy()
      expect(container.querySelector('.me-token--block')).toBeTruthy()
      expect(container.querySelector('.me-image-wrapper')).toBeTruthy()
    })
  })

  it('shows raw markdown in source mode without live widgets or hidden tokens', async () => {
    const value = [
      '# Heading',
      '',
      '![test](https://example.com/test.png)',
      '',
      '| Name | Age |',
      '| --- | --- |',
      '| Ada | 42 |',
      '',
      '```ts',
      'const x = 1',
      '```',
    ].join('\n')

    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} mode="source" />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-image-wrapper')).toBeFalsy()
      expect(container.querySelector('.me-table-widget')).toBeFalsy()
      expect(container.querySelector('.me-codeblock-widget')).toBeFalsy()
      expect(container.querySelector('.me-token')).toBeFalsy()
      expect(container.querySelector('.cm-content')?.textContent).toContain('![test](https://example.com/test.png)')
      expect(container.querySelector('.cm-content')?.textContent).toContain('| Name | Age |')
      expect(container.querySelector('.cm-content')?.textContent).toContain('```ts')
    })
  })

  it('adds table widget boundaries for cursor navigation', async () => {
    let view: EditorView | null = null
    const value = 'Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter'
    const tableFrom = value.indexOf('| A | B |')
    const tableTo = value.indexOf('\n\nAfter')
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} onViewReady={(nextView) => { view = nextView }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-table-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-table-boundary--before')!)
    expect(view!.state.selection.main.from).toBe(tableFrom)

    fireEvent.mouseDown(container.querySelector('.me-table-boundary--after')!)
    expect(view!.state.selection.main.from).toBe(tableTo)
  })

  it('adds code block widget boundaries for cursor navigation', async () => {
    let view: EditorView | null = null
    const value = 'Before\n\n```ts\nconst x = 1\n```\n\nAfter'
    const blockFrom = value.indexOf('```ts')
    const blockTo = value.indexOf('\n\nAfter')
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} onViewReady={(nextView) => { view = nextView }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-codeblock-boundary--before')!)
    expect(view!.state.selection.main.from).toBe(blockFrom)

    fireEvent.mouseDown(container.querySelector('.me-codeblock-boundary--after')!)
    expect(view!.state.selection.main.from).toBe(blockTo)
  })

  it('creates an editable trailing line when navigating after a table at document end', async () => {
    let view: EditorView | null = null
    const value = '| A | B |\n| --- | --- |\n| 1 | 2 |'
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} onViewReady={(nextView) => { view = nextView }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-table-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-table-boundary--after')!)

    expect(view!.state.doc.toString()).toBe(`${value}\n`)
    expect(view!.state.selection.main.from).toBe(value.length + 1)
  })

  it('creates an editable trailing line when navigating after a code block at document end', async () => {
    let view: EditorView | null = null
    const value = '```ts\nconst x = 1\n```'
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} onViewReady={(nextView) => { view = nextView }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-codeblock-boundary--after')!)

    expect(view!.state.doc.toString()).toBe(`${value}\n`)
    expect(view!.state.selection.main.from).toBe(value.length + 1)
  })

  it('adds image widget boundaries for cursor navigation', async () => {
    let view: EditorView | null = null
    const value = 'Before\n\n![alt](https://example.com/image.png)\n\nAfter'
    const imageFrom = value.indexOf('![alt]')
    const imageTo = value.indexOf('\n\nAfter')
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} onViewReady={(nextView) => { view = nextView }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-image-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-image-boundary--before')!)
    expect(view!.state.selection.main.from).toBe(imageFrom)

    fireEvent.mouseDown(container.querySelector('.me-image-boundary--after')!)
    expect(view!.state.selection.main.from).toBe(imageTo)
  })

  it('creates an editable trailing line when navigating after an image at document end', async () => {
    let view: EditorView | null = null
    const value = '![alt](https://example.com/image.png)'
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} onViewReady={(nextView) => { view = nextView }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-image-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-image-boundary--after')!)

    expect(view!.state.doc.toString()).toBe(`${value}\n`)
    expect(view!.state.selection.main.from).toBe(value.length + 1)
  })

  it('switches between live and source modes', async () => {
    const value = '![test](https://example.com/test.png)\n\n| Name | Age |\n| --- | --- |\n| Ada | 42 |'
    const { container, rerender } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} mode="live" />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-image-wrapper')).toBeTruthy()
      expect(container.querySelector('.me-table-widget')).toBeTruthy()
    })

    rerender(<MarkdownEditor value={value} onChange={vi.fn()} mode="source" />)

    await waitFor(() => {
      expect(container.querySelector('.me-image-wrapper')).toBeFalsy()
      expect(container.querySelector('.me-table-widget')).toBeFalsy()
      expect(container.querySelector('.cm-content')?.textContent).toContain('![test](https://example.com/test.png)')
    })

    rerender(<MarkdownEditor value={value} onChange={vi.fn()} mode="live" />)

    await waitFor(() => {
      expect(container.querySelector('.me-image-wrapper')).toBeTruthy()
      expect(container.querySelector('.me-table-widget')).toBeTruthy()
    })
  })

  it('renders inactive image lines as previews and active image lines as raw markdown', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'![test](https://example.com/test.png)'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-image-wrapper')).toBeTruthy()
    })

    act(() => {
      view!.focus()
      view!.dispatch({ selection: { anchor: 2 } })
    })

    await waitFor(() => {
      expect(container.querySelector('.me-image-wrapper')).toBeFalsy()
      expect(container.querySelector('.me-token--inline')).toBeFalsy()
      expect(container.querySelector('.cm-content')?.textContent).toContain('![test](https://example.com/test.png)')
    })
  })

  it('inserts and focuses a live table from the editor slash table command', async () => {
    let view: EditorView | null = null

    const { container } = render(
      <MarkdownEditor
        value={'/table'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 6 } })
      applyEditorSlashCommand(view!, 'Table')
    })

    await waitFor(() => {
      const input = container.querySelector(
        '.me-table-input[data-row-index="0"][data-col-index="0"]',
      ) as HTMLInputElement | null
      expect(container.querySelector('.me-table-widget--editing')).toBeTruthy()
      expect(document.activeElement).toBe(input)
    })

    expect(view!.state.doc.toString()).toBe('\n|  |  |\n| --- | --- |\n|  |  |\n')
  })

  it('inserts and focuses a live code block from the editor slash code command', async () => {
    let view: EditorView | null = null

    const { container } = render(
      <MarkdownEditor
        value={'/code'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 5 } })
      applyEditorSlashCommand(view!, 'Code Block')
    })

    await waitFor(() => {
      const nestedContent = container.querySelector('.me-codeblock-editor-host .cm-content')
      expect(container.querySelector('.me-codeblock-widget--editing')).toBeTruthy()
      expect(document.activeElement).toBe(nestedContent)
    })

    expect(view!.state.doc.toString()).toBe('\n```\n\n```\n')
  })

  it('focuses inserted table and code widgets from ref block commands', async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const { container } = render(<MarkdownEditor value={'Hello'} onChange={vi.fn()} ref={ref} />)

    await waitFor(() => expect(ref.current?.view).toBeTruthy())

    expect(ref.current?.setSelection(5)).toBe(true)
    expect(ref.current?.insertTable()).toBe(true)

    await waitFor(() => {
      const input = container.querySelector(
        '.me-table-input[data-row-index="0"][data-col-index="0"]',
      ) as HTMLInputElement | null
      expect(document.activeElement).toBe(input)
    })
    expect(ref.current?.getMarkdown()).toContain('\n\n|  |  |\n| --- | --- |\n|  |  |\n\n')

    expect(ref.current?.setSelection(ref.current.getMarkdown()!.length)).toBe(true)
    expect(ref.current?.insertCodeBlock()).toBe(true)

    await waitFor(() => {
      const nestedContent = container.querySelector('.me-codeblock-editor-host .cm-content')
      expect(document.activeElement).toBe(nestedContent)
    })
  })

  it('opens the image picker from the editor slash image command', async () => {
    let view: EditorView | null = null

    const { container } = render(
      <MarkdownEditor
        value={'/image'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: view!.state.doc.length } })
      applyEditorSlashCommand(view!, 'Image')
    })

    await waitFor(() => {
      expect(container.querySelector('.me-image-picker')).toBeTruthy()
    })

    expect(container.querySelector('.me-image-picker__upload')).toHaveAttribute('disabled')
  })

  it('routes image commands to a custom image requester with editor context', async () => {
    const ref = createRef<MarkdownEditorHandle>()
    const onRequestImage = vi.fn((context) => {
      expect(context.getMarkdown()).toBe('Hello')
      expect(context.getSelection()).toEqual({ from: 5, to: 5, empty: true })
      context.commands.insertImage({ src: 'https://example.com/custom.png', alt: 'custom' })
    })

    render(
      <MarkdownEditor
        value={'Hello'}
        onChange={vi.fn()}
        ref={ref}
        onRequestImage={onRequestImage}
      />
    )

    await waitFor(() => expect(ref.current?.view).toBeTruthy())

    expect(ref.current?.setSelection(5)).toBe(true)
    expect(ref.current?.openImagePicker()).toBe(true)

    expect(onRequestImage).toHaveBeenCalledOnce()
    expect(ref.current?.getMarkdown()).toBe('Hello![custom](https://example.com/custom.png)')
  })

  it('uploads an image file from the slash image picker', async () => {
    const onChange = vi.fn()
    const onImageUpload = vi.fn(async () => 'https://cdn.example.com/file.png')
    let view: EditorView | null = null

    const { container } = render(
      <MarkdownEditor
        value={'/image'}
        onChange={onChange}
        onImageUpload={onImageUpload}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: view!.state.doc.length } })
      applyEditorSlashCommand(view!, 'Image')
    })

    const fileInput = await waitFor(() => container.querySelector('input[type="file"]') as HTMLInputElement)
    const file = new File(['image'], 'file.png', { type: 'image/png' })
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(onImageUpload).toHaveBeenCalledWith(file)
      expect(onChange).toHaveBeenCalledWith('![file.png](https://cdn.example.com/file.png)')
    })
  })

  it('embeds an image link from the slash image picker', async () => {
    const onChange = vi.fn()
    let view: EditorView | null = null

    const { container } = render(
      <MarkdownEditor
        value={'/image'}
        onChange={onChange}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: view!.state.doc.length } })
      applyEditorSlashCommand(view!, 'Image')
    })

    const linkTab = await waitFor(() => container.querySelectorAll('.me-image-picker__tab')[1] as HTMLButtonElement)
    fireEvent.click(linkTab)

    const input = container.querySelector('.me-image-picker__input') as HTMLInputElement
    fireEvent.mouseDown(input)
    input.focus()

    expect(document.activeElement).toBe(input)

    fireEvent.change(input, { target: { value: 'https://example.com/image.png' } })
    fireEvent.submit(input.closest('form')!)

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('![](https://example.com/image.png)')
    })
  })

  it('renders range annotations with the generic decoration API', async () => {
    const { container } = render(
      <MarkdownEditor
        value={'Hello world'}
        onChange={vi.fn()}
        annotations={[
          {
            id: 'annotation-range',
            documentId: 'doc-1',
            kind: 'generated',
            anchorType: 'range',
            from: 0,
            to: 5,
          },
        ]}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('[data-me-annotation-id="annotation-range"]')).toBeTruthy()
    })

    expect(container.querySelector('[data-me-annotation-id="annotation-range"]')?.className).toContain(
      'me-annotation--kind-generated',
    )
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
      <MarkdownEditor value={'# Heading'} onChange={vi.fn()} autoFocus />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-h1')).toBeTruthy()
      expect(container.querySelector('.me-token--block')).toBeFalsy()
    })
  })

  it('hides heading markers on initial mount when not focused', async () => {
    const { container } = render(
      <MarkdownEditor value={'# Heading'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-h1')).toBeTruthy()
      expect(container.querySelector('.me-token--block')).toBeTruthy()
    })
  })

  it('keeps unfocused heading markers hidden with consumer heading color overrides', async () => {
    const style = document.createElement('style')
    style.textContent = `
      .consumer-editor .me-h1,
      .consumer-editor .me-h2,
      .consumer-editor .me-h3 {
        color: rgb(255, 0, 0);
      }
    `
    document.head.appendChild(style)

    try {
      const { container } = render(
        <MarkdownEditor
          value={'# Heading'}
          onChange={vi.fn()}
          className="consumer-editor"
        />
      )

      await waitFor(() => {
        const token = container.querySelector('.me-token--block')
        expect(token).toBeTruthy()
        expect(getComputedStyle(token!).color).toBe('rgba(0, 0, 0, 0)')
      })
    } finally {
      style.remove()
    }
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
      expect(latestValue).toBe('- [/] task')
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
      expect(container.querySelector('.cm-line.me-list-line--task')).toBeTruthy()
    })
  })

  it('applies standard list layout classes for bullets, ordered lists, and tasks', async () => {
    const { container } = render(
      <MarkdownEditor value={'- bullet\n1. ordered\n- [ ] task'} onChange={vi.fn()} />
    )

    await waitFor(() => {
      const lines = Array.from(container.querySelectorAll('.cm-line.me-list-line')) as HTMLElement[]
      expect(lines).toHaveLength(3)
      expect(lines[0].classList.contains('me-list-line--indent-0')).toBe(true)
      expect(lines[1].classList.contains('me-list-line--indent-0')).toBe(true)
      expect(lines[2].classList.contains('me-list-line--task')).toBe(true)
      expect(lines[2].getAttribute('style')).toBeFalsy()
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
      expect(latestValue).toBe('- parent\n    - [/] dsflskdjf')
      expect(latestValue).not.toContain('[x] [ ]')
    })
  })

  it('copies selected markdown from the document instead of decorated DOM text', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'`ce-5028` already contains `2851`'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 0, head: view!.state.doc.length } })
    })

    const clipboard: Record<string, string> = {}
    const content = container.querySelector('.cm-content')!
    fireEvent.copy(content, {
      clipboardData: {
        setData: (type: string, value: string) => {
          clipboard[type] = value
        },
      },
    })

    expect(clipboard['text/plain']).toBe('`ce-5028` already contains `2851`')
  })

  it('expands full inline-code content selections to include markdown markers when copying', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'`ce-5028` already contains text'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 1, head: 8 } })
    })

    const clipboard: Record<string, string> = {}
    const content = container.querySelector('.cm-content')!
    fireEvent.copy(content, {
      clipboardData: {
        setData: (type: string, value: string) => {
          clipboard[type] = value
        },
      },
    })

    expect(clipboard['text/plain']).toBe('`ce-5028`')
  })

  it('includes opening inline markdown markers when copying a larger selection from formatted content', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'`ce-5028` already contains the `2851` implementation'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 2, head: view!.state.doc.length } })
    })

    const clipboard: Record<string, string> = {}
    const content = container.querySelector('.cm-content')!
    fireEvent.copy(content, {
      clipboardData: {
        setData: (type: string, value: string) => {
          clipboard[type] = value
        },
      },
    })

    expect(clipboard['text/plain']).toBe('`ce-5028` already contains the `2851` implementation')
  })

  it('includes opening inline markdown markers when copying a multi-line selection from formatted content', async () => {
    let view: EditorView | null = null
    const value = '`ce-5028` already contains the `2851` implementation\n- Merge main\n- Rebase branch'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 2, head: view!.state.doc.length } })
    })

    const clipboard: Record<string, string> = {}
    const content = container.querySelector('.cm-content')!
    fireEvent.copy(content, {
      clipboardData: {
        setData: (type: string, value: string) => {
          clipboard[type] = value
        },
      },
    })

    expect(clipboard['text/plain']).toBe(value)
  })

  it('expands mouse selections to include inline markdown markers visually', async () => {
    let view: EditorView | null = null
    const value = '`ce-5028` already contains text\n- Merge main'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 2, head: view!.state.doc.length } })
    })

    fireEvent.mouseUp(container.querySelector('.cm-content')!)

    expect(view!.state.selection.main.from).toBe(0)
    expect(view!.state.selection.main.to).toBe(value.length)
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

  it('inserts [url](url) when a URL is pasted into an empty list item', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'- '}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 2 } })
    })

    const content = container.querySelector('.cm-content')!
    fireEvent.paste(content, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? 'https://example.com' : '',
      },
    })

    expect(view!.state.doc.toString()).toBe(
      '- [https://example.com](https://example.com)'
    )
  })

  it('opens markdown links on ctrl-click', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'[example](https://example.com)'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    try {
      await waitFor(() => expect(view).toBeTruthy())

      vi.spyOn(view!, 'posAtCoords').mockReturnValue(3)

      const content = container.querySelector('.cm-content')!
      fireEvent.click(content, { ctrlKey: true, clientX: 1, clientY: 1 })

      expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    } finally {
      open.mockRestore()
    }
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

  it('syncs table cell input immediately after editor undo', async () => {
    let view: EditorView | null = null
    const onChange = vi.fn()
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada | 42 |'}
        onChange={onChange}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    const widget = container.querySelector('.me-table-widget') as HTMLElement
    fireEvent.mouseDown(widget)

    await waitFor(() => {
      expect(container.querySelector('.me-table-input')).toBeTruthy()
    })

    const input = container.querySelector(
      '.me-table-input[data-row-index="1"][data-col-index="0"]',
    ) as HTMLInputElement

    fireEvent.input(input, { target: { value: 'Ada Lovelace' } })

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled()
      expect(view!.state.doc.toString()).toContain('| Ada Lovelace | 42 |')
      expect(input.value).toBe('Ada Lovelace')
    })

    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })

    await waitFor(() => {
      expect(view!.state.doc.toString()).toContain('| Ada | 42 |')
      expect(input.value).toBe('Ada')
    })
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

  it('does not hijack modified arrow keys for table structure edits in the main editor', async () => {
    let view: EditorView | null = null
    const value = '| Name | Age |\n| --- | --- |\n| Ada | 42 |'
    const { container } = render(
      <MarkdownEditor
        value={value}
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
    fireEvent.keyDown(content, { key: 'ArrowLeft', ctrlKey: true })
    fireEvent.keyDown(content, { key: 'ArrowDown', ctrlKey: true })
    fireEvent.keyDown(content, { key: 'ArrowUp', ctrlKey: true })

    expect(view!.state.doc.toString()).toBe(value)
  })

  it('routes table widget structure shortcuts through shared table commands', async () => {
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

    const widget = container.querySelector('.me-table-widget') as HTMLElement
    fireEvent.mouseDown(widget)

    const input = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="1"][data-col-index="0"]') as HTMLInputElement,
    )

    fireEvent.keyDown(input, { key: 'ArrowRight', metaKey: true, ctrlKey: true })

    await waitFor(() => {
      expect(view!.state.doc.toString()).toBe(
        '| Name |  | Age |\n| --- | --- | --- |\n| Ada |  | 42 |',
      )
    })
  })

  it('exits a table widget before the table with ArrowUp from the first row', async () => {
    let view: EditorView | null = null
    const value = '| Name | Age |\n| --- | --- |\n| Ada | 42 |'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    fireEvent.mouseDown(container.querySelector('.me-table-widget') as HTMLElement)
    const input = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="0"][data-col-index="0"]') as HTMLInputElement,
    )

    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(view!.state.selection.main.from).toBe(0)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('exits a table widget after the table with ArrowDown from the last row', async () => {
    let view: EditorView | null = null
    const value = '| Name | Age |\n| --- | --- |\n| Ada | 42 |'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    fireEvent.mouseDown(container.querySelector('.me-table-widget') as HTMLElement)
    const input = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="1"][data-col-index="1"]') as HTMLInputElement,
    )
    input.focus()

    fireEvent.keyDown(input, { key: 'ArrowDown' })

    expect(view!.state.doc.toString()).toBe(`${value}\n`)
    expect(view!.state.selection.main.from).toBe(value.length + 1)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('preserves table cell cursor offset when moving vertically', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'| Name | Age |\n| --- | --- |\n| Ada Lovelace | 42 |\n| Bob | 30 |'}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    fireEvent.mouseDown(container.querySelector('.me-table-widget') as HTMLElement)
    const adaInput = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="1"][data-col-index="0"]') as HTMLInputElement,
    )
    adaInput.focus()
    adaInput.setSelectionRange(3, 3)

    fireEvent.keyDown(adaInput, { key: 'ArrowDown' })

    const bobInput = container.querySelector(
      '.me-table-input[data-row-index="2"][data-col-index="0"]',
    ) as HTMLInputElement
    expect(document.activeElement).toBe(bobInput)
    expect(bobInput.selectionStart).toBe(3)
    expect(bobInput.selectionEnd).toBe(3)

    fireEvent.keyDown(bobInput, { key: 'ArrowUp' })

    expect(document.activeElement).toBe(adaInput)
    expect(adaInput.selectionStart).toBe(3)
    expect(adaInput.selectionEnd).toBe(3)
  })

  it('exits a table widget upward to the line above the table', async () => {
    let view: EditorView | null = null
    const value = 'top text\n| Name | Age |\n| --- | --- |\n| Ada | 42 |\nbottom text'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: value.length } })
    })
    fireEvent.keyDown(container.querySelector('.cm-content')!, { key: 'ArrowUp' })

    const bodyInput = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="1"][data-col-index="0"]') as HTMLInputElement,
    )
    fireEvent.keyDown(bodyInput, { key: 'ArrowUp' })

    const headerInput = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="0"][data-col-index="0"]') as HTMLInputElement,
    )
    fireEvent.keyDown(headerInput, { key: 'ArrowUp' })

    expect(view!.state.selection.main.from).toBe('top text'.length)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('exits a table widget downward to the line below the table', async () => {
    let view: EditorView | null = null
    const value = 'top text\n| Name | Age |\n| --- | --- |\n| Ada | 42 |\nbottom text'
    const bottomFrom = value.indexOf('bottom text')
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 4 } })
    })
    fireEvent.keyDown(container.querySelector('.cm-content')!, { key: 'ArrowDown' })

    const headerInput = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="0"][data-col-index="0"]') as HTMLInputElement,
    )
    fireEvent.keyDown(headerInput, { key: 'ArrowDown' })

    const bodyInput = await waitFor(() =>
      container.querySelector('.me-table-input[data-row-index="1"][data-col-index="0"]') as HTMLInputElement,
    )
    fireEvent.keyDown(bodyInput, { key: 'ArrowDown' })

    expect(view!.state.selection.main.from).toBe(bottomFrom)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('exits a code block widget before the block with ArrowUp from the language input', async () => {
    let view: EditorView | null = null
    const value = '```ts\nconst x = 1\n```'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    fireEvent.mouseDown(container.querySelector('.me-codeblock-widget') as HTMLElement)
    const langInput = await waitFor(() =>
      container.querySelector('.me-codeblock-lang-input') as HTMLInputElement,
    )
    langInput.focus()

    fireEvent.keyDown(langInput, { key: 'ArrowUp' })

    expect(view!.state.selection.main.from).toBe(0)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('exits a code block widget after the block with ArrowDown from the closing fence', async () => {
    let view: EditorView | null = null
    const value = '```ts\nconst x = 1\n```'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    fireEvent.mouseDown(container.querySelector('.me-codeblock-widget') as HTMLElement)
    const closeFence = await waitFor(() =>
      container.querySelector('.me-codeblock-fence--close') as HTMLElement,
    )
    closeFence.focus()

    fireEvent.keyDown(closeFence, { key: 'ArrowDown' })

    expect(view!.state.doc.toString()).toBe(`${value}\n`)
    expect(view!.state.selection.main.from).toBe(value.length + 1)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('exits a code block widget upward to the line above the block', async () => {
    let view: EditorView | null = null
    const value = 'top text\n```ts\nconst x = 1\n```\nbottom text'
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: value.length } })
    })
    fireEvent.keyDown(container.querySelector('.cm-content')!, { key: 'ArrowUp' })

    const langInput = await waitFor(() =>
      container.querySelector('.me-codeblock-lang-input') as HTMLInputElement,
    )
    langInput.focus()
    fireEvent.keyDown(langInput, { key: 'ArrowUp' })

    expect(view!.state.selection.main.from).toBe('top text'.length)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('exits a code block widget downward to the line below the block', async () => {
    let view: EditorView | null = null
    const value = 'top text\n```ts\nconst x = 1\n```\nbottom text'
    const bottomFrom = value.indexOf('bottom text')
    const { container } = render(
      <MarkdownEditor
        value={value}
        onChange={vi.fn()}
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    act(() => {
      view!.dispatch({ selection: { anchor: 4 } })
    })
    fireEvent.keyDown(container.querySelector('.cm-content')!, { key: 'ArrowDown' })

    const closeFence = await waitFor(() =>
      container.querySelector('.me-codeblock-fence--close') as HTMLElement,
    )
    closeFence.focus()
    fireEvent.keyDown(closeFence, { key: 'ArrowDown' })

    expect(view!.state.selection.main.from).toBe(bottomFrom)
    expect(document.activeElement).toBe(container.querySelector('.cm-content'))
  })

  it('syntax highlights the active nested code block editor', async () => {
    const codeLanguages = [
      LanguageDescription.of({
        name: 'TypeScript',
        alias: ['ts', 'typescript'],
        load: async () => javascript({ typescript: true }),
      }),
    ]

    const { container } = render(
      <MarkdownEditor
        value={'```ts\nconst x = 1\n```'}
        onChange={vi.fn()}
        codeLanguages={codeLanguages}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-codeblock-widget')!)

    await waitFor(() => {
      const nestedContent = container.querySelector('.me-codeblock-editor-host .cm-content')
      expect(nestedContent).toBeTruthy()
      expect(nestedContent?.querySelectorAll('span').length).toBeGreaterThan(0)
    })
  })

  it('accepts a custom highlight style for the active nested code block editor', async () => {
    const codeLanguages = [
      LanguageDescription.of({
        name: 'TypeScript',
        alias: ['ts', 'typescript'],
        load: async () => javascript({ typescript: true }),
      }),
    ]
    const codeHighlightStyle = HighlightStyle.define([
      { tag: tags.keyword, color: '#00ff00' },
    ])

    const { container } = render(
      <MarkdownEditor
        value={'```ts\nconst x = 1\n```'}
        onChange={vi.fn()}
        codeLanguages={codeLanguages}
        codeHighlightStyle={codeHighlightStyle}
      />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget')).toBeTruthy()
    })

    fireEvent.mouseDown(container.querySelector('.me-codeblock-widget')!)

    await waitFor(() => {
      const nestedContent = container.querySelector('.me-codeblock-editor-host .cm-content')
      expect(nestedContent?.querySelectorAll('span').length).toBeGreaterThan(0)
    })
  })

  it('keeps code language configuration isolated between editor instances', async () => {
    const loadA = vi.fn(async () => javascript())
    const loadB = vi.fn(async () => javascript())
    const langA = LanguageDescription.of({ name: 'LangA', alias: ['aaa'], load: loadA })
    const langB = LanguageDescription.of({ name: 'LangB', alias: ['bbb'], load: loadB })

    const { container } = render(
      <div>
        <MarkdownEditor value={'```aaa\na\n```'} onChange={vi.fn()} codeLanguages={[langA]} />
        <MarkdownEditor value={'```bbb\nb\n```'} onChange={vi.fn()} codeLanguages={[langB]} />
      </div>
    )

    await waitFor(() => {
      expect(container.querySelectorAll('.me-codeblock-widget').length).toBe(2)
    })

    fireEvent.mouseDown(container.querySelectorAll('.me-codeblock-widget')[1])
    await waitFor(() => expect(loadB).toHaveBeenCalled())

    fireEvent.mouseDown(container.querySelectorAll('.me-codeblock-widget')[0])
    await waitFor(() => expect(loadA).toHaveBeenCalled())
  })

  it('renders code blocks with the code block widget in read-only mode', async () => {
    const { container } = render(
      <MarkdownEditor
        value={'```ts\nconst x = 1\n```'}
        onChange={vi.fn()}
        readOnly
      />
    )

    await waitFor(() => {
      expect(container.querySelector('.me-codeblock-widget')).toBeTruthy()
      expect(container.querySelector('.me-codeblock-body')).toHaveTextContent('const x = 1')
    })

    fireEvent.mouseDown(container.querySelector('.me-codeblock-widget')!)

    expect(container.querySelector('.me-codeblock-widget--editing')).toBeNull()
    expect(container.querySelector('.me-codeblock-body')).toHaveTextContent('const x = 1')
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

  it('does not activate table editing in read-only mode', async () => {
    let view: EditorView | null = null
    const { container } = render(
      <MarkdownEditor
        value={'top\n| Name | Age |\n| --- | --- |\n| Ada | 42 |\nbottom'}
        onChange={vi.fn()}
        readOnly
        onViewReady={(nextView) => {
          view = nextView
        }}
      />
    )

    await waitFor(() => expect(view).toBeTruthy())

    fireEvent.mouseDown(container.querySelector('.me-table-widget')!)
    expect(container.querySelector('.me-table-widget--editing')).toBeNull()
    expect(container.querySelector('.me-table-input')).toBeNull()

    act(() => {
      view!.dispatch({ selection: { anchor: 4 } })
    })
    fireEvent.keyDown(container.querySelector('.cm-content')!, { key: 'ArrowDown' })

    expect(container.querySelector('.me-table-widget--editing')).toBeNull()
    expect(container.querySelector('.me-table-input')).toBeNull()
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
      expect(document.activeElement).toBe(
        container.querySelector('.me-table-input[data-row-index="1"][data-col-index="0"]'),
      )
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
      expect(document.activeElement).toBe(
        container.querySelector('.me-table-input[data-row-index="0"][data-col-index="0"]'),
      )
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
