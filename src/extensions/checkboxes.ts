import { EditorSelection, Prec, RangeSetBuilder } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

// ── Checkbox widget ───────────────────────────────────────────────────────────

type CheckboxState = 'empty' | 'partial' | 'checked'

class CheckboxWidget extends WidgetType {
  constructor(
    readonly state: CheckboxState,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  override eq(other: CheckboxWidget): boolean {
    return (
      this.state === other.state &&
      this.from === other.from &&
      this.to === other.to
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const marker = document.createElement('span')
    marker.className = 'me-list-marker-widget me-task-list-marker-widget'

    const checkbox = document.createElement('button')
    checkbox.type = 'button'
    checkbox.className = `me-checkbox me-checkbox--${this.state}`
    checkbox.setAttribute('role', 'checkbox')
    checkbox.setAttribute('aria-checked', this.state === 'partial' ? 'mixed' : String(this.state === 'checked'))
    checkbox.setAttribute(
      'aria-label',
      this.state === 'checked'
        ? 'Completed'
        : this.state === 'partial'
          ? 'In progress'
          : 'Incomplete'
    )

    checkbox.addEventListener('mousedown', (e) => {
      e.preventDefault() // prevent editor blur
    })

    checkbox.addEventListener('click', () => {
      if (!view.state.facet(EditorView.editable)) return

      const newMark =
        this.state === 'empty' ? '[/]' : this.state === 'partial' ? '[x]' : '[ ]'

      view.dispatch({
        changes: { from: this.from, to: this.to, insert: newMark },
      })
    })

    marker.appendChild(checkbox)
    return marker
  }

  override ignoreEvent(): boolean {
    return false
  }
}

// ── Live task-list keyboard boundaries ───────────────────────────────────────

function taskPrefixOnLine(view: EditorView, line: { from: number; text: string }) {
  const match = /^(\s*)([-*+]\s+)(\[[ xX/]\])(\s+|$)/.exec(line.text)
  if (!match) return null
  const markerFrom = line.from + match[1].length
  let node = syntaxTree(view.state).resolveInner(markerFrom, 1)
  while (node.name !== 'ListItem') {
    if (node.name === 'CodeBlock' || node.name === 'FencedCode' || !node.parent) return null
    node = node.parent
  }
  // An enclosing list item does not make task-looking text in its code block
  // (or other continuation lines) a new list item on this line.
  if (node.from < line.from || node.from > markerFrom) return null
  return {
    lineFrom: line.from,
    markerFrom,
    checkboxFrom: markerFrom + match[2].length,
    contentFrom: line.from + match[0].length,
    mark: match[3][1],
  }
}

function taskPrefixAtSelection(view: EditorView) {
  const selection = view.state.selection.main
  return selection.empty ? taskPrefixOnLine(view, view.state.doc.lineAt(selection.head)) : null
}

// Source mode can leave a selection inside raw syntax. Before the live widget
// replaces it, move a caret to the visible text and expand partial selections
// to cover the entire prefix so subsequent typing/deletion cannot split it.
export function normalizeTaskSelectionForLiveMode(view: EditorView): EditorSelection | null {
  let changed = false
  const ranges = view.state.selection.ranges.map((range) => {
    const boundary = (pos: number, side: 'start' | 'end') => {
      const task = taskPrefixOnLine(view, view.state.doc.lineAt(pos))
      if (!task || pos <= task.lineFrom || pos >= task.contentFrom) return pos
      changed = true
      return side === 'start' ? task.lineFrom : task.contentFrom
    }
    if (range.empty) {
      const pos = boundary(range.head, 'end')
      return EditorSelection.cursor(pos)
    }
    const from = boundary(range.from, 'start')
    const to = boundary(range.to, 'end')
    return EditorSelection.range(range.anchor <= range.head ? from : to, range.anchor <= range.head ? to : from)
  })
  return changed ? EditorSelection.create(ranges, view.state.selection.mainIndex) : null
}

function moveTaskCursor(view: EditorView, pos: number): boolean {
  view.dispatch({ selection: { anchor: pos }, scrollIntoView: true })
  return true
}

function selectTaskBoundary(view: EditorView, pos: number): boolean {
  const selection = view.state.selection.main
  view.dispatch({ selection: EditorSelection.range(selection.anchor, pos), scrollIntoView: true })
  return true
}

function unwrapTaskMarker(view: EditorView, markerFrom: number, contentFrom: number, direction: 'backward' | 'forward'): boolean {
  view.dispatch(view.state.update({
    changes: { from: markerFrom, to: contentFrom },
    selection: { anchor: markerFrom },
  }, { scrollIntoView: true, userEvent: `delete.${direction}` }))
  return true
}

// Only installed in live mode. A checkbox replaces three source characters,
// so native navigation/deletion must not land or operate inside its raw syntax.
export const taskListKeymap = Prec.highest(keymap.of([
  {
    key: 'Home',
    run(view) {
      const task = taskPrefixAtSelection(view)
      return task ? moveTaskCursor(view, task.contentFrom) : false
    },
  },
  {
    key: 'Shift+Home',
    run(view) {
      const selection = view.state.selection.main
      const task = taskPrefixOnLine(view, view.state.doc.lineAt(selection.head))
      if (!task) return false
      return selectTaskBoundary(view, selection.head <= task.contentFrom ? task.lineFrom : task.contentFrom)
    },
  },
  {
    key: 'Shift+ArrowLeft',
    run(view) {
      const selection = view.state.selection.main
      const task = taskPrefixOnLine(view, view.state.doc.lineAt(selection.head))
      return task && selection.head === task.contentFrom
        ? selectTaskBoundary(view, task.lineFrom)
        : false
    },
  },
  {
    key: 'Shift+ArrowRight',
    run(view) {
      const selection = view.state.selection.main
      const task = taskPrefixOnLine(view, view.state.doc.lineAt(selection.head))
      return task && selection.head === task.lineFrom
        ? selectTaskBoundary(view, task.contentFrom)
        : false
    },
  },
  {
    key: 'ArrowLeft',
    run(view) {
      const task = taskPrefixAtSelection(view)
      const pos = view.state.selection.main.head
      return task && pos > task.lineFrom && pos <= task.contentFrom
        ? moveTaskCursor(view, task.lineFrom)
        : false
    },
  },
  {
    key: 'ArrowRight',
    run(view) {
      const task = taskPrefixAtSelection(view)
      const pos = view.state.selection.main.head
      return task && pos >= task.lineFrom && pos < task.contentFrom
        ? moveTaskCursor(view, task.contentFrom)
        : false
    },
  },
  {
    key: 'Backspace',
    run(view) {
      const task = taskPrefixAtSelection(view)
      const pos = view.state.selection.main.head
      if (!task || pos <= task.markerFrom || pos > task.contentFrom) return false
      return view.state.facet(EditorView.editable)
        ? unwrapTaskMarker(view, task.markerFrom, task.contentFrom, 'backward')
        : true
    },
  },
  {
    key: 'Delete',
    run(view) {
      const task = taskPrefixAtSelection(view)
      const pos = view.state.selection.main.head
      if (!task || pos < task.lineFrom || pos >= task.contentFrom) return false
      return view.state.facet(EditorView.editable)
        ? unwrapTaskMarker(view, task.markerFrom, task.contentFrom, 'forward')
        : true
    },
  },
]))

// ── Decoration builder ────────────────────────────────────────────────────────

function buildCheckboxDecorations(view: EditorView): { decorations: DecorationSet; atomicRanges: DecorationSet } {
  const builder = new RangeSetBuilder<Decoration>()
  const atomicBuilder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  // Only walk visible ranges
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      const task = taskPrefixOnLine(view, line)
      if (task) {
        const state: CheckboxState = /[xX]/.test(task.mark)
          ? 'checked'
          : task.mark === '/'
            ? 'partial'
            : 'empty'

        builder.add(
          task.checkboxFrom,
          task.checkboxFrom + 3,
          Decoration.replace({
            widget: new CheckboxWidget(state, task.checkboxFrom, task.checkboxFrom + 3),
          })
        )
        atomicBuilder.add(task.lineFrom, task.contentFrom, Decoration.mark({}))
      }
      pos = line.to + 1
    }
  }

  return { decorations: builder.finish(), atomicRanges: atomicBuilder.finish() }
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

export const checkboxDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    atomicRanges: DecorationSet

    constructor(view: EditorView) {
      const result = buildCheckboxDecorations(view)
      this.decorations = result.decorations
      this.atomicRanges = result.atomicRanges
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)) {
        const result = buildCheckboxDecorations(update.view)
        this.decorations = result.decorations
        this.atomicRanges = result.atomicRanges
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)

export const taskListAtomicRanges = EditorView.atomicRanges.of(
  (view) => view.plugin(checkboxDecorations)?.atomicRanges ?? Decoration.none,
)
