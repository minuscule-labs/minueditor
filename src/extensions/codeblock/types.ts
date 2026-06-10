import type { Compartment } from '@codemirror/state'
import type { LanguageDescription } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'

export type FencedBlockInfo = {
  blockFrom: number
  blockTo: number
  openingFenceFrom: number
  openingFenceTo: number
  contentFrom: number
  contentTo: number
  code: string
  lang: string
}

export type CodeBlockEditorMount = {
  view: EditorView
  langCompartment: Compartment
  currentCode: string
  currentLang: string
  blockFrom: number
  contentFrom: number
  contentTo: number
  syncingFromOuter: boolean
  isDestroyed: boolean
  languageLoadId: number
  pendingFocusTarget: 'language' | 'code-start' | 'code-end' | null
  codeLanguages: readonly LanguageDescription[]
}

export type CodeBlockElement = HTMLDivElement & {
  __meCodeBlockEditor?: CodeBlockEditorMount
}
