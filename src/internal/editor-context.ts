import type { EditorView } from '@codemirror/view'
import type { MinuEditorCommands } from './editor-commands'

export interface MinuWidgetContext {
  view: EditorView
  readOnly: boolean
  getMarkdown(): string
  getSelection(): { from: number; to: number; empty: boolean }
  setSelection(from: number, to?: number): boolean
  focus(): boolean
  commands: MinuEditorCommands
}

export function createWidgetContext(
  view: EditorView,
  commands: MinuEditorCommands,
  readOnly: boolean,
): MinuWidgetContext {
  return {
    view,
    readOnly,
    getMarkdown: () => view.state.doc.toString(),
    getSelection: () => {
      const selection = view.state.selection.main
      return {
        from: selection.from,
        to: selection.to,
        empty: selection.empty,
      }
    },
    setSelection(from, to = from) {
      const docLength = view.state.doc.length
      const anchor = Math.max(0, Math.min(from, docLength))
      const head = Math.max(0, Math.min(to, docLength))
      view.dispatch({ selection: { anchor, head }, scrollIntoView: true })
      view.focus()
      return true
    },
    focus() {
      view.focus()
      return true
    },
    commands,
  }
}
