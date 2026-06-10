import type { Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { inlineMarkdownSpans, type InlineMarkdownKind } from '../internal/inline-markdown'

type PendingPairRule = {
  marker: string
  openLen: number
  closeLen: number
}

const pendingPairRules: PendingPairRule[] = [
  { marker: '**', openLen: 2, closeLen: 2 },
  { marker: '*', openLen: 1, closeLen: 1 },
  { marker: '~~', openLen: 2, closeLen: 2 },
  { marker: '`', openLen: 1, closeLen: 1 },
]

const inlineClassByKind: Record<InlineMarkdownKind, string> = {
  bold: 'me-bold',
  italic: 'me-italic',
  strike: 'me-strikethrough',
  code: 'me-inline-code',
  link: 'me-link',
}

function selectionTouchesRange(view: EditorView, from: number, to: number, revealMarkers = true): boolean {
  if (!revealMarkers) return false

  for (const range of view.state.selection.ranges) {
    if (range.empty) {
      if (range.from > from && range.from < to) return true
      continue
    }

    if (range.from < to && range.to > from) return true
  }

  return false
}

function selectionOverlapsRange(view: EditorView, from: number, to: number, revealMarkers = true): boolean {
  if (!revealMarkers) return false
  return view.state.selection.ranges.some((range) => !range.empty && range.from < to && range.to > from)
}

function isEmptyPairAtCursor(view: EditorView, rule: PendingPairRule, cursor: number): boolean {
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

    for (const rule of pendingPairRules) {
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

function buildDecorations(view: EditorView, revealMarkers = true): DecorationSet {
  const all: Range<Decoration>[] = buildPendingPairDecorations(view)
  const doc = view.state.doc

  for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber += 1) {
    const line = doc.line(lineNumber)

    for (const span of inlineMarkdownSpans(line.text, line.from)) {
      if (
        selectionOverlapsRange(view, span.from, span.to, revealMarkers) ||
        selectionTouchesRange(view, span.openFrom, span.openTo, revealMarkers) ||
        selectionTouchesRange(view, span.closeFrom, span.closeTo, revealMarkers)
      ) {
        continue
      }

      all.push(
        Decoration.mark({ class: 'me-token me-token--inline' }).range(
          span.openFrom,
          span.openTo,
        ),
      )
      if (span.contentFrom < span.contentTo) {
        all.push(
          Decoration.mark({ class: inlineClassByKind[span.kind] }).range(
            span.contentFrom,
            span.contentTo,
          ),
        )
      }
      all.push(
        Decoration.mark({ class: 'me-token me-token--inline' }).range(
          span.closeFrom,
          span.closeTo,
        ),
      )
    }
  }

  return Decoration.set(all, true)
}

export const visualMarkdown = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    pointerSelecting = false
    removePointerListeners: (() => void) | null = null

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)

      const startPointerSelection = () => {
        this.pointerSelecting = true
      }
      const endPointerSelection = () => {
        if (!this.pointerSelecting) return
        this.pointerSelecting = false
        this.decorations = buildDecorations(view, true)
        view.dispatch({})
      }

      view.dom.addEventListener('mousedown', startPointerSelection)
      window.addEventListener('mouseup', endPointerSelection)
      window.addEventListener('blur', endPointerSelection)
      this.removePointerListeners = () => {
        view.dom.removeEventListener('mousedown', startPointerSelection)
        window.removeEventListener('mouseup', endPointerSelection)
        window.removeEventListener('blur', endPointerSelection)
      }
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view)
        return
      }

      if (update.selectionSet) {
        this.decorations = buildDecorations(update.view, !this.pointerSelecting)
      }
    }

    destroy() {
      this.removePointerListeners?.()
    }
  },
  {
    decorations: (v) => v.decorations,
  },
)
