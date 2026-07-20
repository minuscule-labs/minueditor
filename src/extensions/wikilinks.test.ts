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

function tick(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 80))
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

  it('reveals wikilink source while editing the target', () => {
    const view = createView('See [[Note B]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 8 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeFalsy()
    expect(view.dom.querySelector('.me-wikilink-marker')).toBeFalsy()
    expect(view.dom.textContent).toContain('[[Note B]]')
  })

  it('reveals wikilink source while editing an aliased target', () => {
    const view = createView('See [[Note B|the note]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 8 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeFalsy()
    expect(view.dom.querySelector('.me-wikilink-marker')).toBeFalsy()
    expect(view.dom.textContent).toContain('[[Note B|the note]]')
  })

  it('reveals wikilink source while editing an alias', () => {
    const view = createView('See [[Note B|the note]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 15 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeFalsy()
    expect(view.dom.querySelector('.me-wikilink-marker')).toBeFalsy()
    expect(view.dom.textContent).toContain('[[Note B|the note]]')
  })

  it('keeps wikilinks rendered at outer cursor boundaries', () => {
    const view = createView('See [[Note B]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 4 } })
    expect(view.dom.querySelector('.me-wikilink')).toBeTruthy()

    view.dispatch({ selection: { anchor: 14 } })
    expect(view.dom.querySelector('.me-wikilink')).toBeTruthy()
  })

  it('reveals wikilink source when a selection partially overlaps it', () => {
    const view = createView('See [[Note B]] today', [wikiLinksExtension(true, { completion: false })])

    view.dispatch({ selection: { anchor: 2, head: 8 } })

    expect(view.dom.querySelector('.me-wikilink')).toBeFalsy()
    expect(view.dom.textContent).toContain('[[Note B]]')
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

  it('starts note suggestions when the cursor enters an existing wikilink target', async () => {
    const suggest = vi.fn(async (_query: string, _context?: unknown) => [
      { id: 'note-1', target: 'Note B' },
    ])
    const view = createView('See [[Nope|label]] today', [wikiLinksExtension({ suggest })])

    view.focus()
    view.dispatch({ selection: { anchor: 8 } })
    await tick()

    expect(suggest).toHaveBeenCalledWith('Nope', expect.objectContaining({
      query: 'Nope',
      from: 6,
      to: 10,
      part: 'target',
      link: { from: 4, to: 18, target: 'Nope', label: 'label' },
    }))
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
    const suggest = vi.fn(async (_query: string, _context?: unknown) => [
      { id: 'note-1', target: 'Note B', detail: 'Note' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('No', expect.objectContaining({
      query: 'No',
      from: 2,
      to: 4,
      part: 'target',
      explicit: false,
    }))
    const context = suggest.mock.calls[0]?.[1] as Record<string, unknown>
    expect('link' in context).toBe(false)
    expect(result?.from).toBe(2)
    expect(result?.to).toBe(4)
    expect(result?.validFor).toBeUndefined()

    const option = result!.options[0]
    expect(option.label).toBe('Note B')
    expect(option.detail).toBe('Note')

    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('[[Note B]]')
    expect(view.state.selection.main.from).toBe(8)
  })

  it('supports legacy one-argument suggest callbacks', async () => {
    const view = createView('[[No')
    const suggest = vi.fn(async (query: string) => [
      { id: 'note-1', target: query === 'No' ? 'Note B' : 'Other' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledOnce()
    expect(suggest.mock.calls[0]?.[0]).toBe('No')

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('[[Note B]]')
  })

  it('reopens suggestions while editing an existing wikilink target', async () => {
    const view = createView('See [[Nope]] today')
    const suggest = vi.fn(async (_query: string, _context?: unknown) => [
      { id: 'note-1', target: 'Note B', detail: 'Note' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: 8,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('Nope', expect.objectContaining({
      query: 'Nope',
      part: 'target',
      link: { from: 4, to: 12, target: 'Nope' },
    }))
    expect(result?.from).toBe(6)
    expect(result?.to).toBe(10)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[Note B]] today')
    expect(view.state.selection.main.from).toBe(12)
  })

  it('inserts suggestion labels as wikilink aliases for ID-backed completions', async () => {
    const view = createView('[[No')
    const source = wikiLinkCompletions({
      suggest: async () => [{ id: 'note-1', target: 'note_1', label: 'Note B' }],
    })

    const result = await source({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: false,
    } as CompletionContext)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('[[note_1|Note B]]')
    expect(view.state.selection.main.from).toBe(15)
  })

  it('replaces only the target when completing an aliased wikilink', async () => {
    const view = createView('See [[No|label]] today')
    const suggest = vi.fn(async (_query: string, _context?: unknown) => [
      { id: 'note-1', target: 'Note B' },
    ])
    const source = wikiLinkCompletions({ suggest })

    const result = await source({
      state: view.state,
      pos: 7,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('No', expect.objectContaining({
      query: 'No',
      part: 'target',
      link: { from: 4, to: 16, target: 'No', label: 'label' },
    }))
    expect(result?.from).toBe(6)
    expect(result?.to).toBe(8)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[Note B|label]] today')
  })

  it('does not trigger while editing a wikilink label by default', async () => {
    const view = createView('See [[Note B|label]] today')
    const source = wikiLinkCompletions({ suggest: async () => [] })

    const result = await source({
      state: view.state,
      pos: 15,
      explicit: false,
    } as CompletionContext)

    expect(result).toBeNull()
  })

  it('can complete from labels and replace the full wikilink in title mode', async () => {
    const view = createView('See [[old_id|Old Title]] today')
    const suggest = vi.fn(async (_query: string, _context?: unknown) => [
      { id: 'note-1', target: 'new_id', label: 'New Title' },
    ])
    const source = wikiLinkCompletions({ labelBehavior: 'title', suggest })

    const result = await source({
      state: view.state,
      pos: 17,
      explicit: false,
    } as CompletionContext)

    expect(suggest).toHaveBeenCalledWith('Old Title', expect.objectContaining({
      query: 'Old Title',
      from: 13,
      to: 22,
      part: 'label',
      link: { from: 4, to: 24, target: 'old_id', label: 'Old Title' },
    }))
    expect(result?.from).toBe(13)
    expect(result?.to).toBe(22)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[new_id|New Title]] today')
    expect(view.state.selection.main.from).toBe(22)
  })

  it('can replace the full wikilink when completing from a target in title mode', async () => {
    const view = createView('See [[old_id|Old Title]] today')
    const source = wikiLinkCompletions({
      labelBehavior: 'title',
      suggest: async () => [{ id: 'note-1', target: 'new_id', label: 'New Title' }],
    })

    const result = await source({
      state: view.state,
      pos: 8,
      explicit: false,
    } as CompletionContext)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[new_id|New Title]] today')
    expect(view.state.selection.main.from).toBe(22)
  })

  it('can complete from labels while preserving the label with replace-target policy', async () => {
    const view = createView('See [[old_id|Old Title]] today')
    const source = wikiLinkCompletions({
      completeFrom: ['label'],
      completionApply: 'replace-target',
      suggest: async () => [{ id: 'note-1', target: 'new_id', label: 'New Title' }],
    })

    const result = await source({
      state: view.state,
      pos: 17,
      explicit: false,
    } as CompletionContext)

    const option = result!.options[0]
    const apply = option.apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)

    expect(view.state.doc.toString()).toBe('See [[new_id|Old Title]] today')
    expect(view.state.selection.main.from).toBe(12)
  })

  it('signals suggestion context when querying candidates', async () => {
    const view = createView('See [[Nope]] today')
    const suggest = vi.fn(async () => [])
    const onSuggestionContext = vi.fn()
    const source = wikiLinkCompletions({ suggest, onSuggestionContext })

    await source({
      state: view.state,
      pos: 8,
      explicit: false,
    } as CompletionContext)

    expect(onSuggestionContext).toHaveBeenCalledWith(expect.objectContaining({
      query: 'Nope',
      from: 6,
      to: 10,
      part: 'target',
      explicit: false,
      link: { from: 4, to: 12, target: 'Nope' },
    }))
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
