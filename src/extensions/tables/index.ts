import { StateField, type EditorState } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { buildTableDecorations, tableArrowNavigation, tableClickHandlers } from './widget'
import { activeTableField, setActiveTable } from './state'

const tableDecorationField = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildTableDecorations(state)
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.effects.some((effect) => effect.is(setActiveTable))) {
      return value
    }
    return buildTableDecorations(tr.state)
  },
  provide: (field) => EditorView.decorations.from(field),
})

export const tableDecorations = [
  activeTableField,
  tableDecorationField,
  tableClickHandlers,
  tableArrowNavigation,
]
