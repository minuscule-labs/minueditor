import { StateField, type EditorState } from '@codemirror/state'
import type { DecorationSet } from '@codemirror/view'
import { EditorView } from '@codemirror/view'
import { activeCodeBlockField, setActiveCodeBlock } from './state'
import {
  autoCloseCodeFence,
  buildCodeBlockDecorations,
  codeBlockArrowNavigation,
  codeBlockClickToEdit,
} from './widget'

const codeBlockDecorationField = StateField.define<DecorationSet>({
  create(state: EditorState) {
    return buildCodeBlockDecorations(state)
  },
  update(value, tr) {
    if (!tr.docChanged && !tr.effects.some((effect) => effect.is(setActiveCodeBlock))) {
      return value
    }
    return buildCodeBlockDecorations(tr.state)
  },
  provide: (field) => EditorView.decorations.from(field),
})

export const codeBlockDecorations = [
  activeCodeBlockField,
  codeBlockDecorationField,
  codeBlockClickToEdit,
  codeBlockArrowNavigation,
  autoCloseCodeFence,
]
