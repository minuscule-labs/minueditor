import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
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

// ── Decoration builder ────────────────────────────────────────────────────────

function buildCheckboxDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc

  // Only walk visible ranges
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos)
      const checkMatch = line.text.match(/^(\s*[-*+]\s+)(\[[ xX/]\])/)
      if (checkMatch) {
        const markerOffset = checkMatch[1].length
        const markerFrom = line.from + markerOffset
        const markerTo = markerFrom + 3 // `[ ]`, `[/]`, or `[x]` is 3 chars
        const mark = line.text[markerOffset + 1]
        const state: CheckboxState = /[xX]/.test(mark)
          ? 'checked'
          : mark === '/'
            ? 'partial'
            : 'empty'

        builder.add(
          markerFrom,
          markerTo,
          Decoration.replace({
            widget: new CheckboxWidget(state, markerFrom, markerTo),
          })
        )
      }
      pos = line.to + 1
    }
  }

  return builder.finish()
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

export const checkboxDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCheckboxDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildCheckboxDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)
