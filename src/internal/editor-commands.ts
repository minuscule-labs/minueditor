import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { insertImagePicker } from '../extensions/images'
import {
  insertCodeBlock,
  insertTable,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  wrapLink,
} from '../toolbar/commands'

type RefLike<T> = { current: T }

export interface MinuEditorCommands {
  undo(): boolean
  redo(): boolean
  insertMarkdown(markdown: string): boolean
  replaceSelection(markdown: string): boolean
  insertImage(image: { src: string; alt?: string }): boolean
  openImagePicker(): boolean
  toggleBold(): boolean
  toggleItalic(): boolean
  toggleInlineCode(): boolean
  wrapLink(): boolean
  insertTable(): boolean
  insertCodeBlock(): boolean
}

function markdownImage(alt: string, src: string): string {
  return `![${alt}](${src})`
}

export function createEditorCommands(
  viewRef: RefLike<EditorView | null>,
  readOnlyRef: RefLike<boolean>,
): MinuEditorCommands {
  const withView = (run: (view: EditorView) => boolean): boolean => {
    const view = viewRef.current
    if (!view) return false
    return run(view)
  }

  const writeWithView = (run: (view: EditorView) => boolean): boolean => {
    if (readOnlyRef.current) return false
    return withView(run)
  }

  const replaceSelectionWith = (markdown: string): boolean => writeWithView((view) => {
    const range = view.state.selection.main
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: markdown },
      selection: { anchor: range.from + markdown.length },
      scrollIntoView: true,
    })
    view.focus()
    return true
  })

  return {
    undo: () => writeWithView(undo),
    redo: () => writeWithView(redo),
    insertMarkdown: replaceSelectionWith,
    replaceSelection: replaceSelectionWith,
    insertImage: ({ src, alt = '' }) => replaceSelectionWith(markdownImage(alt, src)),
    openImagePicker: () => writeWithView(insertImagePicker),
    toggleBold: () => writeWithView(toggleBold),
    toggleItalic: () => writeWithView(toggleItalic),
    toggleInlineCode: () => writeWithView(toggleInlineCode),
    wrapLink: () => writeWithView(wrapLink),
    insertTable: () => writeWithView(insertTable),
    insertCodeBlock: () => writeWithView(insertCodeBlock),
  }
}
