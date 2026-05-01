import type { Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'

type MarkdownRule = {
  marker: string
  regexp: RegExp
  openLen: number
  closeLen: number
  className: string
}

const rules: MarkdownRule[] = [
  {
    marker: '**',
    regexp: /\*\*([^*]+)\*\*/g,
    openLen: 2,
    closeLen: 2,
    className: 'me-bold',
  },
  {
    marker: '*',
    regexp: /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g,
    openLen: 1,
    closeLen: 1,
    className: 'me-italic',
  },
  {
    marker: '~~',
    regexp: /~~([^~]+)~~/g,
    openLen: 2,
    closeLen: 2,
    className: 'me-strikethrough',
  },
  {
    marker: '`',
    regexp: /(?<!`)`([^`\n]+)`(?!`)/g,
    openLen: 1,
    closeLen: 1,
    className: 'me-inline-code',
  },
]

const linkDecorator = new MatchDecorator({
  regexp: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,

  decorate(add, from, to, match, view) {
    const label = match[1]
    if (!label) return

    const contentStart = from + 1
    const contentEnd = contentStart + label.length

    if (
      selectionTouchesRange(view, from, contentStart) ||
      selectionTouchesRange(view, contentEnd, to)
    ) {
      return
    }

    add(
      from,
      contentStart,
      Decoration.mark({ class: 'me-token me-token--inline' })
    )
    add(
      contentStart,
      contentEnd,
      Decoration.mark({ class: 'me-link' })
    )
    add(
      contentEnd,
      to,
      Decoration.mark({ class: 'me-token me-token--inline' })
    )
  },
})

function selectionTouchesRange(view: EditorView, from: number, to: number): boolean {
  for (const range of view.state.selection.ranges) {
    if (range.empty) {
      if (range.from > from && range.from < to) return true
      continue
    }

    if (range.from < to && range.to > from) return true
  }

  return false
}

function isEmptyPairAtCursor(view: EditorView, rule: MarkdownRule, cursor: number): boolean {
  const { marker } = rule
  const beforeFrom = cursor - rule.openLen
  const afterTo = cursor + rule.closeLen
  if (beforeFrom < 0 || afterTo > view.state.doc.length) return false

  if (view.state.doc.sliceString(beforeFrom, cursor) !== marker) return false
  if (view.state.doc.sliceString(cursor, afterTo) !== marker) return false

  // Prevent `*|*` detection inside `**|**`.
  if (rule.openLen === 1) {
    if (beforeFrom > 0 && view.state.doc.sliceString(beforeFrom - 1, beforeFrom) === marker) {
      return false
    }
    if (afterTo < view.state.doc.length && view.state.doc.sliceString(afterTo, afterTo + 1) === marker) {
      return false
    }
  }

  return true
}

function buildPendingPairDecorations(view: EditorView): Range<Decoration>[] {
  const ranges: Range<Decoration>[] = []

  for (const range of view.state.selection.ranges) {
    if (!range.empty) continue

    for (const rule of rules) {
      if (!isEmptyPairAtCursor(view, rule, range.from)) continue

      ranges.push(
        Decoration.mark({ class: 'me-token me-token--inline' }).range(
          range.from - rule.openLen,
          range.from,
        ),
      )
      ranges.push(
        Decoration.mark({ class: 'me-token me-token--inline' }).range(
          range.from,
          range.from + rule.closeLen,
        ),
      )
    }
  }

  return ranges
}

function createDecorator(rule: MarkdownRule) {
  return new MatchDecorator({
    regexp: rule.regexp,

    decorate(add, from, to, _match, view) {
      const contentStart = from + rule.openLen
      const contentEnd = to - rule.closeLen

      if (
        selectionTouchesRange(view, from, contentStart) ||
        selectionTouchesRange(view, contentEnd, to)
      ) {
        return
      }

      add(
        from,
        contentStart,
        Decoration.mark({ class: 'me-token me-token--inline' })
      )
      if (contentStart < contentEnd) {
        add(
          contentStart,
          contentEnd,
          Decoration.mark({ class: rule.className }),
        )
      }
      add(
        contentEnd,
        to,
        Decoration.mark({ class: 'me-token me-token--inline' })
      )
    },
  })
}

const decorators = [...rules.map(createDecorator), linkDecorator]

function buildDecorations(view: EditorView): DecorationSet {
  const all: Range<Decoration>[] = buildPendingPairDecorations(view)

  for (const decorator of decorators) {
    const set = decorator.createDeco(view)
    set.between(0, view.state.doc.length, (from, to, value) => {
      all.push(value.range(from, to))
    })
  }

  return Decoration.set(all, true)
}

export const visualMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
