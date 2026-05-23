import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { SlashCommand } from '../types'
import {
  insertCodeBlock,
  insertHR,
  insertImage,
  insertTable,
  setHeading,
  toggleCheckboxList,
  toggleOrderedList,
  toggleUnorderedList,
} from '../toolbar/commands'

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

export const defaultSlashCommands: readonly SlashCommand[] = [
  {
    label: 'Heading 1',
    detail: '# Heading',
    keywords: ['h1', 'title'],
    run: (view) => setHeading(view, 1),
  },
  {
    label: 'Heading 2',
    detail: '## Heading',
    keywords: ['h2', 'subtitle'],
    run: (view) => setHeading(view, 2),
  },
  {
    label: 'Heading 3',
    detail: '### Heading',
    keywords: ['h3'],
    run: (view) => setHeading(view, 3),
  },
  {
    label: 'Bulleted List',
    detail: '- List item',
    keywords: ['bullet', 'ul', 'list'],
    run: toggleUnorderedList,
  },
  {
    label: 'Numbered List',
    detail: '1. List item',
    keywords: ['ordered', 'ol', 'list'],
    run: toggleOrderedList,
  },
  {
    label: 'Task List',
    detail: '- [ ] Task',
    keywords: ['todo', 'checkbox', 'checklist'],
    run: toggleCheckboxList,
  },
  {
    label: 'Quote',
    detail: '> Quote',
    keywords: ['blockquote'],
    run: setBlockquote,
  },
  {
    label: 'Code Block',
    detail: '```',
    keywords: ['code', 'pre'],
    run: insertCodeBlock,
  },
  {
    label: 'Table',
    detail: '2 columns',
    keywords: ['grid'],
    run: insertTable,
  },
  {
    label: 'Divider',
    detail: '---',
    keywords: ['hr', 'horizontal rule', 'separator'],
    run: insertHR,
  },
  {
    label: 'Image',
    detail: '![]()',
    keywords: ['photo', 'media'],
    run: insertImage,
  },
]

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
        changes: { from, to, insert: '' },
        selection: { anchor: from },
      })
      command.run(view)
    },
  }

  if (command.detail) completion.detail = command.detail
  if (command.keywords?.length) completion.info = command.keywords.join(', ')

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
): Extension {
  return autocompletion({
    override: [
      (context) => slashCommandCompletions(context, commands),
    ],
  })
}
