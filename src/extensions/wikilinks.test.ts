import type { CompletionContext } from '@codemirror/autocomplete'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wikiLinkCompletions, wikiLinksExtension, wikiLinkSpans } from './wikilinks'

let views: EditorView[] = []

function createView(doc: string, extensions: Extension[] = []): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions,
    }),
  })

  views.push(view)
  return view
}

afterEach(() => {
  for (const view of views) {
    const parent = view.dom.parentElement
    view.destroy()
    parent?.remove()
  }
  views = []
})

describe('wikiLinksExtension', () => {
  it('parses wikilinks with display labels', () => {
    const spans = wikiLinkSpans('See [[Note B|the note]] today', 10)

    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({
      target: 'Note B',
      label: 'the note',
      from: 14,
      to: 33,
    })
  })

  it('decorates inactive wikilinks and applies resolution classes', () => {
    const view = createView('See [[Note B|the note]] today', [
      wikiLinksExtension(
        {
          resolve: (target) => ({
            status: target === 'Note B' ? 'resolved' : 'unresolved',
          }),
        },
        { completion: false },
      ),
    ])

    expect(view.dom.querySelector('.me-wikilink--resolved')).toBeTruthy()
    expect(view.dom.querySelector('.me-wikilink-label')?.textContent).toBe('the note')
    expect(view.dom.querySelectorAll('.me-wikilink-marker').length).toBeGreaterThanOrEqual(2)
  })

  it('shows source markers while the cursor is inside the wikilink', () => {
    const view = createView('See [[Note B]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 8 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeFalsy()
    expect(view.dom.querySelector('.me-wikilink-marker')).toBeFalsy()
  })

  it('does not open wikilinks on plain click unless opted in', async () => {
    const onOpen = vi.fn()
    const view = createView('See [[Note B]] today', [
      wikiLinksExtension({ onOpen }, { completion: false }),
    ])
    const link = view.dom.querySelector('.me-wikilink')!

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens decorated wikilinks on plain click when configured', async () => {
    const onOpen = vi.fn()
    const view = createView('See [[Note B|the note]] today', [
      wikiLinksExtension({ openOnClick: true, onOpen }, { completion: false }),
    ])
    const link = view.dom.querySelector('.me-wikilink')!

    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await Promise.resolve()

    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith('Note B', { event: expect.any(MouseEvent) })
  })
})

describe('wikiLinkCompletions', () => {
  it('suggests notes after a wikilink opener and inserts a wikilink', async () => {
    const view = createView('[[No')
    const suggest = vi.fn(async (_query: string) => [
      { id: 'note-1', target: 'Note B', detail: 'Note' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('No')
    expect(result?.from).toBe(2)
    expect(result?.to).toBe(4)

    const option = result!.options[0]
    expect(option.label).toBe('Note B')
    expect(option.detail).toBe('Note')

    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('[[Note B]]')
    expect(view.state.selection.main.from).toBe(10)
  })

  it('does not trigger outside an open wikilink', async () => {
    const view = createView('No wikilink')
    const source = wikiLinkCompletions({ suggest: async () => [] })

    const result = await source({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: true,
    } as CompletionContext)

    expect(result).toBeNull()
  })
})
