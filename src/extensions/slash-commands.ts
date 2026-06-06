import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import { EditorSelection, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { SlashCommand } from '../types'
import {
  insertHR,
  insertImage,
  setHeading,
  toggleCheckboxList,
  toggleOrderedList,
  toggleUnorderedList,
} from '../toolbar/commands'
import { insertImagePicker } from './images'
import { setActiveCodeBlock } from './codeblock/state'
import { createEmptyTableMarkdown } from './tables/model'
import { setActiveTable } from './tables/state'

function moveCursorAfterLineMarker(view: EditorView, markerPattern: RegExp): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  const match = markerPattern.exec(line.text)
  if (!match) return false

  view.dispatch({
    selection: { anchor: line.from + match[0].length },
    scrollIntoView: true,
  })

  return true
}

function setSlashHeading(view: EditorView, level: 1 | 2 | 3): boolean {
  if (!setHeading(view, level)) return false
  return moveCursorAfterLineMarker(view, /^#{1,6}\s+/) || true
}

function setSlashUnorderedList(view: EditorView): boolean {
  if (!toggleUnorderedList(view)) return false
  return moveCursorAfterLineMarker(view, /^\s*[-*+]\s+/) || true
}

function setSlashOrderedList(view: EditorView): boolean {
  if (!toggleOrderedList(view)) return false
  return moveCursorAfterLineMarker(view, /^\s*\d+\.\s+/) || true
}

function setSlashCheckboxList(view: EditorView): boolean {
  if (!toggleCheckboxList(view)) return false
  return moveCursorAfterLineMarker(view, /^\s*[-*+]\s+\[[ xX/]\]\s+/) || true
}

function setBlockquote(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  const next = /^\s*>\s?/.test(line.text)
    ? line.text.replace(/^(\s*)>\s?/, '$1')
    : `> ${line.text}`

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: next },
    selection: { anchor: line.from + next.length },
    scrollIntoView: true,
  })

  return true
}

function setSlashBlockquote(view: EditorView): boolean {
  if (!setBlockquote(view)) return false
  return moveCursorAfterLineMarker(view, /^\s*>\s?/) || true
}

function insertSlashTable(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  const table = createEmptyTableMarkdown(2, 1)
  const blockFrom = line.from + 1

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: `\n${table}\n` },
    effects: setActiveTable.of(blockFrom),
    selection: { anchor: blockFrom },
    scrollIntoView: true,
  })

  requestAnimationFrame(() => {
    const input = view.dom.querySelector(
      `.me-table-widget[data-table-from="${blockFrom}"] .me-table-input[data-row-index="0"][data-col-index="0"]`,
    ) as HTMLInputElement | null
    input?.focus()
    input?.select()
  })

  return true
}

function insertSlashCodeBlock(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  const block = '```\n\n```'
  const blockFrom = line.from + 1
  const contentFrom = blockFrom + 4

  view.dispatch({
    changes: { from: line.from, to: line.to, insert: `\n${block}\n` },
    effects: setActiveCodeBlock.of(blockFrom),
    selection: EditorSelection.cursor(contentFrom),
    scrollIntoView: true,
  })

  return true
}

interface DefaultSlashCommandOptions {
  imageCommand?: (view: EditorView) => boolean
}

export function createDefaultSlashCommands(
  options: DefaultSlashCommandOptions = {},
): readonly SlashCommand[] {
  const imageCommand = options.imageCommand ?? insertImage

  return [
  {
    label: 'Heading 1',
    keywords: ['h1', 'title'],
    run: (view) => setSlashHeading(view, 1),
  },
  {
    label: 'Heading 2',
    keywords: ['h2', 'subtitle'],
    run: (view) => setSlashHeading(view, 2),
  },
  {
    label: 'Heading 3',
    keywords: ['h3'],
    run: (view) => setSlashHeading(view, 3),
  },
  {
    label: 'Bulleted List',
    keywords: ['bullet', 'ul', 'list'],
    run: setSlashUnorderedList,
  },
  {
    label: 'Numbered List',
    keywords: ['ordered', 'ol', 'list'],
    run: setSlashOrderedList,
  },
  {
    label: 'Task List',
    keywords: ['todo', 'checkbox', 'checklist'],
    run: setSlashCheckboxList,
  },
  {
    label: 'Quote',
    keywords: ['blockquote'],
    run: setSlashBlockquote,
  },
  {
    label: 'Code Block',
    keywords: ['code', 'pre'],
    run: insertSlashCodeBlock,
  },
  {
    label: 'Table',
    keywords: ['grid'],
    run: insertSlashTable,
  },
  {
    label: 'Divider',
    keywords: ['hr', 'horizontal rule', 'separator'],
    run: insertHR,
  },
  {
    label: 'Image',
    keywords: ['photo', 'media'],
    run: imageCommand,
  },
]
}

export const defaultSlashCommands: readonly SlashCommand[] = createDefaultSlashCommands()
export const editorSlashCommands: readonly SlashCommand[] = createDefaultSlashCommands({
  imageCommand: insertImagePicker,
})

function slashCommandRange(context: CompletionContext): { from: number; to: number } | null {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const match = /(^|\s)\/([\w-]*)$/.exec(before)

  if (!match) return null

  const slashOffset = before.lastIndexOf('/')
  const prefix = before.slice(0, slashOffset)
  if (prefix.trim().length > 0) return null

  return {
    from: line.from + slashOffset,
    to: context.pos,
  }
}

function toCompletion(command: SlashCommand): Completion {
  const completion: Completion = {
    label: command.label,
    type: 'keyword',
    apply(view, _completion, from, to) {
      view.dispatch({
        changes: { from: from - 1, to, insert: '' },
        selection: { anchor: from - 1 },
      })
      command.run(view)
    },
  }

  if (command.detail) completion.detail = command.detail

  return completion
}

export function slashCommandCompletions(
  context: CompletionContext,
  commands: readonly SlashCommand[] = defaultSlashCommands,
): CompletionResult | null {
  const range = slashCommandRange(context)
  if (!range) return null

  return {
    from: range.from + 1,
    to: range.to,
    options: commands.map(toCompletion),
    validFor: /^[\w-]*$/,
  }
}

export function slashCommandExtension(
  commands: readonly SlashCommand[] = defaultSlashCommands,
): Extension {
  return autocompletion({
    override: [
      (context) => slashCommandCompletions(context, commands),
    ],
  })
}
