import { RangeSet, StateEffect } from '@codemirror/state'
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

  // Walk the visible ranges for performance (CM6 viewport).
  // Fallback to the full document on initial mount when the viewport
  // hasn't been computed yet.
  const rangesToScan =
    view.visibleRanges.length > 0
      ? view.visibleRanges
      : [{ from: 0, to: doc.length }]

  for (const { from, to } of rangesToScan) {
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
          const isTaskLine = /^\s*[-*+]\s+\[[ xX/]\]\s/.test(line.text)
          ranges.push(
            Decoration.line({ class: `me-list-line me-list-line--indent-${indentLevel}` }).range(
              line.from
            )
          )

          const marker = doc.sliceString(node.from, node.to)
          const markerTo = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to

          if (isTaskLine && /^[-*+]$/.test(marker)) {
            ranges.push(
              Decoration.mark({ class: 'me-token me-token--block' }).range(
                node.from,
                markerTo
              )
            )
          } else if (/^[-*+]$/.test(marker)) {
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
          const line = doc.lineAt(node.from)
          ranges.push(
            Decoration.line({ class: 'me-hr-line' }).range(line.from)
          )
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

const forceDecorationsRefresh = StateEffect.define<void>()

export const markdownDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    needsInitialRefresh: boolean
    destroyed: boolean
    refreshScheduled: boolean

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
      this.needsInitialRefresh = true
      this.destroyed = false
      this.refreshScheduled = false

      this.scheduleRefresh(view)
    }

    scheduleRefresh(view: EditorView) {
      if (this.refreshScheduled) return
      this.refreshScheduled = true
      requestAnimationFrame(() => {
        this.refreshScheduled = false
        if (this.destroyed) return
        // Force a plugin update cycle so decorations rebuild with the
        // post-layout viewport and fully parsed syntax tree.
        view.dispatch({ effects: forceDecorationsRefresh.of() })
      })
    }

    update(update: ViewUpdate) {
      const forceRefresh = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(forceDecorationsRefresh))
      )

      if (
        this.needsInitialRefresh ||
        forceRefresh ||
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildDecorations(update.view)
        this.needsInitialRefresh = false
      }

      if (update.docChanged) {
        this.scheduleRefresh(update.view)
      }
    }

    destroy() {
      this.destroyed = true
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)
