import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// ── Checkbox widget ───────────────────────────────────────────────────────────

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number
  ) {
    super()
  }

  override eq(other: CheckboxWidget): boolean {
    return (
      this.checked === other.checked &&
      this.from === other.from &&
      this.to === other.to
    )
  }

    override toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = this.checked
    checkbox.className = 'me-checkbox'
    checkbox.setAttribute('aria-label', this.checked ? 'Completed' : 'Incomplete')

    checkbox.addEventListener('mousedown', (e) => {
      e.preventDefault() // prevent editor blur
    })

    checkbox.addEventListener('change', () => {
      if (!view.state.facet(EditorView.editable)) return

      const newMark = checkbox.checked ? '[x]' : '[ ]'
      const from = this.from
      const to = this.to

      // Replace `[ ]` or `[x]` at the stored position
      view.dispatch({
        changes: { from, to, insert: newMark },
      })
    })

    return checkbox
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
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        // The Lezer markdown tree uses "Task" for `- [ ]` / `- [x]` items
        if (node.name !== 'Task') return

        const lineText = doc.lineAt(node.from).text
        // Find `[ ]` or `[x]` within the task node text
        const checkMatch = lineText.match(/^(\s*[-*+]\s+)(\[[ xX]\])/)
        if (!checkMatch) return

        const lineFrom = doc.lineAt(node.from).from
        const markerOffset = checkMatch[1].length
        const markerFrom = lineFrom + markerOffset
        const markerTo = markerFrom + 3 // `[ ]` or `[x]` is 3 chars

        const checked = /[xX]/.test(lineText[markerOffset + 1])

        builder.add(
          markerFrom,
          markerTo,
          Decoration.replace({
            widget: new CheckboxWidget(checked, markerFrom, markerTo),
          })
        )
      },
    })
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
