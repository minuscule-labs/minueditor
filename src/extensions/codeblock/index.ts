import { StateField, type EditorState } from '@codemirror/state'
import type { HighlightStyle, LanguageDescription } from '@codemirror/language'
import type { DecorationSet } from '@codemirror/view'
import type { CodeHighlighter } from '../../types'
import { EditorView } from '@codemirror/view'
import { activeCodeBlockField, setActiveCodeBlock } from './state'
import { setCodeBlockOptions } from './model'
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

export function codeBlockDecorations(
  codeLanguages: readonly LanguageDescription[] = [],
  codeHighlighter?: CodeHighlighter,
  codeHighlightStyle?: HighlightStyle,
) {
  setCodeBlockOptions({ codeLanguages, codeHighlighter, codeHighlightStyle })
  return [
    activeCodeBlockField,
    codeBlockDecorationField,
    codeBlockClickToEdit,
    codeBlockArrowNavigation,
    autoCloseCodeFence,
  ]
}
