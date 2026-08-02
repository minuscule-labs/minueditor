import { EditorSelection, type StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'

export type WidgetNavigationTarget = 'before' | 'inside-start' | 'inside-end' | 'after'

export function focusElementWithoutScroll(element: HTMLElement): void {
  element.focus({ preventScroll: true })
}

export type WidgetSourceRange = {
  from: number
  to: number
}

export function widgetBoundaryPosition(
  range: WidgetSourceRange,
  target: Extract<WidgetNavigationTarget, 'before' | 'after'>,
): number {
  return target === 'before' ? range.from : range.to
}

export function placeCursorAtWidgetBoundary(
  view: EditorView,
  range: WidgetSourceRange,
  target: Extract<WidgetNavigationTarget, 'before' | 'after'>,
  effects?: StateEffect<unknown> | readonly StateEffect<unknown>[],
): boolean {
  const position = widgetBoundaryPosition(range, target)

  if (target === 'after' && position >= view.state.doc.length) {
    view.dispatch({
      ...(effects ? { effects } : {}),
      changes: { from: view.state.doc.length, insert: '\n' },
      selection: EditorSelection.cursor(view.state.doc.length + 1),
      scrollIntoView: true,
    })
    view.focus()
    return true
  }

  view.dispatch({
    ...(effects ? { effects } : {}),
    selection: EditorSelection.cursor(position),
    scrollIntoView: true,
  })
  view.focus()
  return true
}

export function exitWidgetWithArrowKey(
  view: EditorView,
  range: WidgetSourceRange,
  target: Extract<WidgetNavigationTarget, 'before' | 'after'>,
  effects?: StateEffect<unknown> | readonly StateEffect<unknown>[],
): boolean {
  if (target === 'after') {
    if (range.to >= view.state.doc.length) {
      return placeCursorAtWidgetBoundary(view, range, target, effects)
    }

    const position = view.state.doc.lineAt(range.to + 1).from
    view.dispatch({
      ...(effects ? { effects } : {}),
      selection: EditorSelection.cursor(position),
      scrollIntoView: true,
    })
    view.focus()
    return true
  }

  const position = range.from <= 0
    ? 0
    : view.state.doc.lineAt(range.from - 1).to

  view.dispatch({
    ...(effects ? { effects } : {}),
    selection: EditorSelection.cursor(position),
    scrollIntoView: true,
  })
  view.focus()
  return true
}

export function handleWidgetBoundaryMouseDown(
  event: MouseEvent,
  view: EditorView,
  range: WidgetSourceRange,
  target: Extract<WidgetNavigationTarget, 'before' | 'after'>,
  effects?: StateEffect<unknown> | readonly StateEffect<unknown>[],
): boolean {
  event.preventDefault()
  event.stopPropagation()
  return placeCursorAtWidgetBoundary(view, range, target, effects)
}
