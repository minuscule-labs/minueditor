import { StateField, type EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { DecorationSet } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { buildTableDecorations, tableArrowNavigation, tableClickHandlers } from './widget'
import {
  activeTableField,
  setActiveTable,
  tableConfiguration,
  tableInteractionField,
} from './state'

const tableDecorationField = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildTableDecorations(state)
  },
  update(value, tr) {
    const syntaxTreeChanged = syntaxTree(tr.startState) !== syntaxTree(tr.state)
    const configurationChanged =
      tr.startState.facet(tableConfiguration).actions !== tr.state.facet(tableConfiguration).actions
    if (
      !tr.docChanged &&
      !syntaxTreeChanged &&
      !configurationChanged &&
      !tr.effects.some((effect) => effect.is(setActiveTable))
    ) return value
    return buildTableDecorations(tr.state)
  },
  provide: (field) => EditorView.decorations.from(field),
})

export const tableDecorations = [
  activeTableField,
  tableInteractionField,
  tableDecorationField,
  tableClickHandlers,
  tableArrowNavigation,
]
