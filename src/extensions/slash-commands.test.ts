import type { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { slashCommandCompletions, slashCommandExtension } from './slash-commands'

let views: EditorView[] = []

function createView(doc: string, extensions = [slashCommandExtension()]): EditorView {
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

describe('slashCommandExtension', () => {
  it('applies a built-in slash command after removing the slash query', async () => {
    const view = createView('/h1')
    const result = slashCommandCompletions({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: true,
    } as CompletionContext)

    expect(result?.from).toBe(0)
    expect(result?.to).toBe(3)
    const from = result!.from
    const to = result!.to
    expect(to).toBeDefined()

    const apply = result!.options[0].apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, result!.options[0], from, to!)
    expect(view.state.doc.toString()).toBe('# ')
  })

  it('uses custom slash commands when provided', async () => {
    const view = createView('/callout')
    const result = slashCommandCompletions({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: true,
    } as CompletionContext, [
      {
        label: 'Callout',
        run(nextView) {
          nextView.dispatch({ changes: { from: 0, insert: '> [!NOTE] ' } })
          return true
        },
      },
    ])

    const from = result!.from
    const to = result!.to
    expect(to).toBeDefined()

    const apply = result!.options[0].apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, result!.options[0], from, to!)
    expect(view.state.doc.toString()).toBe('> [!NOTE] ')
  })

  it('does not open after non-whitespace text on the line', async () => {
    const view = createView('text /h1')
    const result = slashCommandCompletions({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: true,
    } as CompletionContext)

    expect(result).toBeNull()
  })
})
