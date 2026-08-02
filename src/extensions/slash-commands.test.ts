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

function applySlashCommand(view: EditorView, label: string) {
  const result = slashCommandCompletions({
    state: view.state,
    pos: view.state.selection.main.from,
    explicit: true,
  } as CompletionContext)
  const option = result!.options.find((completion) => completion.label === label)!
  const apply = option.apply
  expect(typeof apply).toBe('function')
  if (typeof apply === 'function') apply(view, option, result!.from, result!.to!)
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

    expect(result?.from).toBe(1)
    expect(result?.to).toBe(3)
    const from = result!.from
    const to = result!.to
    expect(to).toBeDefined()

    const apply = result!.options[0].apply
    expect(typeof apply).toBe('function')
    if (typeof apply === 'function') apply(view, result!.options[0], from, to!)
    expect(view.state.doc.toString()).toBe('# ')
  })

  it('uses the text after slash as the filtered query', () => {
    const view = createView('/h1')
    const result = slashCommandCompletions({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: true,
    } as CompletionContext)

    expect(view.state.doc.sliceString(result!.from, result!.to)).toBe('h1')
    expect(result!.validFor).toEqual(/^[\w-]*$/)
  })

  it('places the cursor after a task list marker', () => {
    const view = createView('/task')

    applySlashCommand(view, 'Task List')

    expect(view.state.doc.toString()).toBe('- [ ] ')
    expect(view.state.selection.main.from).toBe(6)
  })

  it('places the cursor after a heading marker', () => {
    const view = createView('/h2')

    applySlashCommand(view, 'Heading 2')

    expect(view.state.doc.toString()).toBe('## ')
    expect(view.state.selection.main.from).toBe(3)
  })

  it('inserts a GitHub-style callout and places the cursor in its body', () => {
    const view = createView('/warning')

    applySlashCommand(view, 'Warning Callout')

    expect(view.state.doc.toString()).toBe('> [!WARNING]\n> ')
    expect(view.state.selection.main.from).toBe(15)
  })

  it('offers every portable GitHub alert type', () => {
    const view = createView('/callout')
    const result = slashCommandCompletions({
      state: view.state,
      pos: view.state.selection.main.from,
      explicit: true,
    } as CompletionContext)

    expect(result?.options.map((option) => option.label)).toEqual(expect.arrayContaining([
      'Note Callout',
      'Tip Callout',
      'Important Callout',
      'Warning Callout',
      'Caution Callout',
    ]))
  })

  it('inserts a table at the slash command line', () => {
    const view = createView('/table')

    applySlashCommand(view, 'Table')

    expect(view.state.doc.toString()).toBe('\n|  |  |\n| --- | --- |\n|  |  |\n')
    expect(view.state.selection.main.from).toBe(1)
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
