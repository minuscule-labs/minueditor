import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
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
import { calloutLabels, type CalloutType } from './callouts'

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

function insertCallout(view: EditorView, type: CalloutType): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.from)
  const body = line.text ? line.text : ''
  const marker = `> [!${type.toUpperCase()}]\n> `
  const insert = `${marker}${body}`

  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: { anchor: line.from + marker.length },
    scrollIntoView: true,
  })

  return true
}

const calloutSlashCommands: readonly SlashCommand[] = (
  ['note', 'tip', 'important', 'warning', 'caution'] as const
).map((type) => ({
  label: `${calloutLabels[type]} Callout`,
  detail: `GitHub-style ${calloutLabels[type].toLowerCase()} alert`,
  keywords: ['alert', 'callout', type],
  run: (view) => insertCallout(view, type),
}))

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
  ...calloutSlashCommands,
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
  const searchTerms = [command.label, ...(command.keywords ?? [])].join(' ')
  const completion: Completion = {
    // Keep the slash in the matched text so CodeMirror can anchor the tooltip
    // before line-end widgets. displayLabel keeps the menu text unchanged.
    label: `/${searchTerms}`,
    displayLabel: command.label,
    sortText: command.label,
    type: 'keyword',
    apply(view, _completion, from, to) {
      view.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
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
    from: range.from,
    to: range.to,
    options: commands.map(toCompletion),
    validFor: /^\/[\w-]*$/,
  }
}

export function slashCommandExtension(
  commands: readonly SlashCommand[] = defaultSlashCommands,
  extraSources: readonly CompletionSource[] = [],
): Extension {
  return autocompletion({
    override: [
      (context) => slashCommandCompletions(context, commands),
      ...extraSources,
    ],
  })
}
