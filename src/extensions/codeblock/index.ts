import { StateField, type EditorState } from '@codemirror/state'
import type { HighlightStyle, LanguageDescription } from '@codemirror/language'
import type { DecorationSet } from '@codemirror/view'
import type { CodeHighlighter } from '../../types'
import { EditorView } from '@codemirror/view'
import { activeCodeBlockField, setActiveCodeBlock } from './state'
import type { CodeBlockOptions } from './model'
import {
  autoCloseCodeFence,
  buildCodeBlockDecorations,
  codeBlockArrowNavigation,
  codeBlockClickToEdit,
} from './widget'

function codeBlockDecorationField(options: CodeBlockOptions) {
  return StateField.define<DecorationSet>({
    create(state: EditorState) {
      return buildCodeBlockDecorations(state, options)
    },
    update(value, tr) {
      if (!tr.docChanged && !tr.effects.some((effect) => effect.is(setActiveCodeBlock))) {
        return value
      }
      return buildCodeBlockDecorations(tr.state, options)
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

export function codeBlockDecorations(
  codeLanguages: readonly LanguageDescription[] = [],
  codeHighlighter?: CodeHighlighter,
  codeHighlightStyle?: HighlightStyle,
) {
  const options: CodeBlockOptions = { codeLanguages, codeHighlighter, codeHighlightStyle }
  return [
    activeCodeBlockField,
    codeBlockDecorationField(options),
    codeBlockClickToEdit,
    codeBlockArrowNavigation,
    autoCloseCodeFence,
  ]
}
