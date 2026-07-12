import type { CompletionContext } from '@codemirror/autocomplete'
import { EditorState, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { wikiLinkCompletions, wikiLinkSlashCommand, wikiLinksExtension, wikiLinkSpans } from './wikilinks'

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

  it('keeps wikilink source hidden while editing the visible target', () => {
    const view = createView('See [[Note B]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 8 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeTruthy()
    expect(view.dom.querySelectorAll('.me-wikilink-marker').length).toBeGreaterThanOrEqual(2)
  })

  it('keeps wikilink source hidden while editing an aliased target', () => {
    const view = createView('See [[Note B|the note]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 8 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeTruthy()
    expect(view.dom.querySelectorAll('.me-wikilink-marker').length).toBeGreaterThanOrEqual(2)
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

  it('opens decorated wikilinks on plain mousedown before selection changes', async () => {
    const onOpen = vi.fn()
    const view = createView('See [[Note B|the note]] today', [
      wikiLinksExtension({ openOnClick: true, onOpen }, { completion: false }),
    ])
    const link = view.dom.querySelector('.me-wikilink')!

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    const notPrevented = link.dispatchEvent(event)
    await Promise.resolve()

    expect(notPrevented).toBe(false)
    expect(event.defaultPrevented).toBe(true)
    expect(onOpen).toHaveBeenCalledOnce()
    expect(onOpen).toHaveBeenCalledWith('Note B', { event: expect.any(MouseEvent) })
  })
})

describe('wikiLinkSlashCommand', () => {
  it('inserts empty wikilink markers and places the cursor between them', () => {
    const view = createView('')

    expect(wikiLinkSlashCommand.run(view)).toBe(true)

    expect(view.state.doc.toString()).toBe('[[]]')
    expect(view.state.selection.main.from).toBe(2)
  })

  it('wraps selected text as a wikilink', () => {
    const view = createView('Note B')
    view.dispatch({ selection: { anchor: 0, head: 6 } })

    expect(wikiLinkSlashCommand.run(view)).toBe(true)

    expect(view.state.doc.toString()).toBe('[[Note B]]')
    expect(view.state.selection.main.from).toBe(8)
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
    expect(view.state.selection.main.from).toBe(8)
  })

  it('reopens suggestions while editing an existing wikilink target', async () => {
    const view = createView('See [[Nope]] today')
    const suggest = vi.fn(async (_query: string) => [
      { id: 'note-1', target: 'Note B', detail: 'Note' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: 8,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('Nope')
    expect(result?.from).toBe(6)
    expect(result?.to).toBe(10)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[Note B]] today')
    expect(view.state.selection.main.from).toBe(12)
  })

  it('replaces only the target when completing an aliased wikilink', async () => {
    const view = createView('See [[No|label]] today')
    const suggest = vi.fn(async (_query: string) => [
      { id: 'note-1', target: 'Note B' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: 7,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('No')
    expect(result?.from).toBe(6)
    expect(result?.to).toBe(8)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[Note B|label]] today')
  })

  it('does not trigger while editing a wikilink alias', async () => {
    const view = createView('See [[Note B|label]] today')
    const source = wikiLinkCompletions({ suggest: async () => [] })

    const result = await source({
      state: view.state,
      pos: 15,
      explicit: false,
    } as CompletionContext)

    expect(result).toBeNull()
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
