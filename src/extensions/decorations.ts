import { RangeSet } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// ── Helpers ───────────────────────────────────────────────────────────────────

function activeLinesSet(view: EditorView): Set<number> {
  const active = new Set<number>()
  for (const range of view.state.selection.ranges) {
    const fromLine = view.state.doc.lineAt(range.from).number
    const toLine = view.state.doc.lineAt(range.to).number
    for (let n = fromLine; n <= toLine; n++) active.add(n)
  }
  return active
}

function listIndentLevel(line: string): number {
  let width = 0
  for (const ch of line) {
    if (ch === ' ') width += 1
    else if (ch === '\t') width += 4
    else break
  }
  return Math.floor(width / 4)
}

// ── Main decoration builder ───────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = view.state.doc
  const activeLines = activeLinesSet(view)

  // Walk the visible ranges for performance (CM6 viewport)
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        const lineNum = doc.lineAt(node.from).number
        const onActiveLine = activeLines.has(lineNum)

        // Apply heading styling to the full heading span.
        if (
          node.name === 'ATXHeading1' ||
          node.name === 'ATXHeading2' ||
          node.name === 'ATXHeading3' ||
          node.name === 'ATXHeading4' ||
          node.name === 'ATXHeading5' ||
          node.name === 'ATXHeading6'
        ) {
          const level = node.name.slice(-1) // '1'–'6'
          ranges.push(
            Decoration.mark({ class: `me-h${level}` }).range(node.from, node.to)
          )
        }

        if (node.name === 'HeaderMark' && !onActiveLine) {
          ranges.push(
            Decoration.mark({ class: 'me-token me-token--block' }).range(
              node.from,
              node.to + 1
            )
          )
          return
        }

        if (node.name === 'Blockquote') {
          ranges.push(
            Decoration.mark({ class: 'me-blockquote' }).range(node.from, node.to)
          )
        }
        if (node.name === 'QuoteMark' && !onActiveLine) {
          ranges.push(
            Decoration.mark({ class: 'me-token me-token--block' }).range(
              node.from,
              node.to + 1
            )
          )
          return
        }

        if (node.name === 'ListMark') {
          const line = doc.lineAt(node.from)
          const indentLevel = Math.min(listIndentLevel(line.text), 6)
          ranges.push(
            Decoration.line({ class: `me-list-line me-list-line--indent-${indentLevel}` }).range(
              line.from
            )
          )

          const marker = doc.sliceString(node.from, node.to)
          if (/^[-*+]$/.test(marker)) {
            const markerTo = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to
            ranges.push(
              Decoration.mark({ class: 'me-unordered-list-marker' }).range(
                node.from,
                markerTo
              )
            )
          } else if (/^\d+\.$/.test(marker)) {
            ranges.push(
              Decoration.mark({ class: 'me-ordered-list-marker' }).range(
                node.from,
                node.to
              )
            )
          }
          return
        }

        if (node.name === 'HorizontalRule' && !onActiveLine) {
          ranges.push(
            Decoration.mark({ class: 'me-hr-text' }).range(node.from, node.to)
          )
        }
      },
    })
  }

  return RangeSet.of(ranges, true)
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

export const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)
