import {
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  placeholder as cmPlaceholder,
  keymap,
} from '@codemirror/view'
import { defaultKeymap, historyKeymap, history, redo, redoDepth, undo, undoDepth } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { minueditorTheme } from './theme'
import { markdownDecorations } from './extensions/decorations'
import { documentAnnotationExtension } from './extensions/annotations'
import { checkboxDecorations } from './extensions/checkboxes'
import { autolinkPaste } from './extensions/autolink'
import { linkClickNavigation } from './extensions/link-click'
import { tableDecorations } from './extensions/tables'
import { codeBlockDecorations } from './extensions/codeblock'
import { imageDecorations, imagePasteHandler, imagePickerExtension, insertImagePicker } from './extensions/images'
import { markdownKeymap } from './extensions/keymap'
import { editorSlashCommands, slashCommandExtension } from './extensions/slash-commands'
import { FloatingToolbar } from './toolbar/FloatingToolbar'
import type { MarkdownEditorProps, MarkdownEditorState } from './types'
import { visualMarkdown } from './extensions/visual-markdown'
import {
  enterAfterHiddenInlineSuffix,
  enterInMarkdownList,
  enterInMarkdownTable,
  insertCodeBlock,
  insertTable,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  wrapLink,
} from './toolbar/commands'

export interface MarkdownEditorHandle {
  view: EditorView | null
  getState: () => MarkdownEditorState | null
  markClean: () => void
  getMarkdown: () => string | null
  getSelection: () => MarkdownEditorState['selection'] | null
  setSelection: (from: number, to?: number) => boolean
  focus: () => boolean
  blur: () => boolean
  undo: () => boolean
  redo: () => boolean
  insertMarkdown: (markdown: string) => boolean
  replaceSelection: (markdown: string) => boolean
  insertImage: (image: { src: string; alt?: string }) => boolean
  openImagePicker: () => boolean
  toggleBold: () => boolean
  toggleItalic: () => boolean
  toggleInlineCode: () => boolean
  wrapLink: () => boolean
  insertTable: () => boolean
  insertCodeBlock: () => boolean
}

function markdownImage(alt: string, src: string): string {
  return `![${alt}](${src})`
}

type SourceRange = { from: number; to: number }

type InlineMarkdownSpan = SourceRange & {
  contentFrom: number
  contentTo: number
}

function inlineMarkdownSpans(lineText: string, lineFrom: number): InlineMarkdownSpan[] {
  const spans: InlineMarkdownSpan[] = []
  const patterns = [
    { regexp: /\*\*([^*]+)\*\*/g, openLen: 2, closeLen: 2 },
    { regexp: /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, openLen: 1, closeLen: 1 },
    { regexp: /~~([^~]+)~~/g, openLen: 2, closeLen: 2 },
    { regexp: /(?<!`)`([^`\n]+)`(?!`)/g, openLen: 1, closeLen: 1 },
    { regexp: /(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, openLen: 1, closeLen: 0 },
  ]

  for (const { regexp, openLen, closeLen } of patterns) {
    regexp.lastIndex = 0
    for (const match of lineText.matchAll(regexp)) {
      if (match.index == null || !match[1]) continue
      const from = lineFrom + match.index
      const to = from + match[0].length
      const contentFrom = from + openLen
      const contentTo = closeLen > 0 ? to - closeLen : contentFrom + match[1].length
      spans.push({ from, to, contentFrom, contentTo })
    }
  }

  return spans.sort((a, b) => a.from - b.from)
}

function expandInlineMarkdownRange(state: EditorState, range: SourceRange): SourceRange {
  if (range.from === range.to) return range

  const fromLine = state.doc.lineAt(range.from)
  const toLine = state.doc.lineAt(range.to)
  let expanded = range

  for (const span of inlineMarkdownSpans(fromLine.text, fromLine.from)) {
    if (expanded.from >= span.contentFrom && expanded.from <= span.contentTo) {
      expanded = { ...expanded, from: span.from }
      break
    }
  }

  for (const span of inlineMarkdownSpans(toLine.text, toLine.from)) {
    if (expanded.to >= span.contentFrom && expanded.to <= span.contentTo) {
      expanded = { ...expanded, to: span.to }
      break
    }
  }

  return expanded
}

function selectedMarkdownText(state: EditorState): { text: string; ranges: SourceRange[] } {
  const ranges = state.selection.ranges
    .filter((range) => !range.empty)
    .map((range) => expandInlineMarkdownRange(state, { from: range.from, to: range.to }))

  return {
    ranges,
    text: ranges.map((range) => state.doc.sliceString(range.from, range.to)).join('\n'),
  }
}

function getActiveMarks(lineText: string): MarkdownEditorState['activeMarks'] {
  const heading = /^(#{1,6})\s+/.exec(lineText)
  const list = /^\s*[-*+]\s+\[[ xX/]\]\s+/.test(lineText)
    ? 'task'
    : /^\s*[-*+]\s+/.test(lineText)
      ? 'bullet'
      : /^\s*\d+\.\s+/.test(lineText)
        ? 'ordered'
        : null

  return {
    bold: /\*\*[^*]+\*\*|__[^_]+__/.test(lineText),
    italic: /(^|[^*])\*[^*\s][^*]*\*|(^|[^_])_[^_\s][^_]*_/.test(lineText),
    code: /`[^`]+`/.test(lineText),
    link: /\[[^\]]+\]\([^)]+\)/.test(lineText),
    headingLevel: heading ? (heading[1].length as 1 | 2 | 3 | 4 | 5 | 6) : null,
    list,
    quote: /^\s*>\s?/.test(lineText),
  }
}

function buildEditorState(
  view: EditorView,
  baselineValue: string,
  readOnly: boolean,
): MarkdownEditorState {
  const value = view.state.doc.toString()
  const selection = view.state.selection.main
  const activeLine = view.state.doc.lineAt(selection.from)

  return {
    value,
    isDirty: value !== baselineValue,
    isFocused: view.hasFocus,
    isEmpty: value.trim().length === 0,
    canUndo: undoDepth(view.state) > 0,
    canRedo: redoDepth(view.state) > 0,
    readOnly,
    selection: {
      from: selection.from,
      to: selection.to,
      empty: selection.empty,
    },
    activeLine: {
      number: activeLine.number,
      from: activeLine.from,
      to: activeLine.to,
      text: activeLine.text,
    },
    activeMarks: getActiveMarks(activeLine.text),
  }
}

/**
 * MarkdownEditor — CM6-backed markdown editor.
 *
 * Fully controlled: consumer owns `value` and `onChange`.
 * The underlying document is always plain markdown.
 * When `floatingToolbar` is set, a FloatingToolbar appears above
 * text selections inside the editor.
 *
 * When `onViewReady` is set, it is called with the EditorView instance
 * after CM6 mounts. Useful for wiring an external toolbar.
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    value,
    onChange,
    baselineValue,
    slashCommands = true,
    placeholder,
    readOnly = false,
    mode = 'live',
    floatingToolbar = false,
    autoFocus = false,
    minHeight,
    maxHeight,
    onSubmit,
    onImageUpload,
    codeLanguages,
    codeHighlighter,
    codeHighlightStyle,
    onStateChange,
    annotations,
    onAnnotationClick,
    onViewReady,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const baselineValueRef = useRef(baselineValue ?? value)
  const readOnlyRef = useRef(readOnly)
  const readOnlyCompartment = useRef(new Compartment());
  const modeCompartment = useRef(new Compartment())
  const annotationsCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onImageUploadRef = useRef(onImageUpload)
  const onStateChangeRef = useRef(onStateChange)
  const onAnnotationClickRef = useRef(onAnnotationClick)
  const editorStateRef = useRef<MarkdownEditorState | null>(null)
  const handleAnnotationClick = useCallback(
    (annotation: NonNullable<MarkdownEditorProps['annotations']>[number], view: EditorView) => {
      onAnnotationClickRef.current?.(annotation, view)
    },
    [],
  )

  // Store the view in state so consumers of cmView (FloatingToolbar, onViewReady)
  // see it after CM6 mounts — viewRef alone wouldn't trigger a re-render.
  const [cmView, setCmView] = useState<EditorView | null>(null);

  const emitState = useCallback((view: EditorView) => {
    const nextState = buildEditorState(
      view,
      baselineValueRef.current,
      readOnlyRef.current,
    )
    editorStateRef.current = nextState
    onStateChangeRef.current?.(nextState)
  }, [])

  // Expose the EditorView and common editor actions via ref.
  useImperativeHandle(ref, () => {
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
      view: viewRef.current,
      getState: () => editorStateRef.current,
      markClean: () => {
        const view = viewRef.current
        if (!view) return
        baselineValueRef.current = view.state.doc.toString()
        emitState(view)
      },
      getMarkdown: () => viewRef.current?.state.doc.toString() ?? null,
      getSelection: () => editorStateRef.current?.selection ?? null,
      setSelection: (from: number, to = from) => withView((view) => {
        const docLength = view.state.doc.length
        const anchor = Math.max(0, Math.min(from, docLength))
        const head = Math.max(0, Math.min(to, docLength))
        view.dispatch({ selection: { anchor, head }, scrollIntoView: true })
        view.focus()
        return true
      }),
      focus: () => withView((view) => {
        view.focus()
        return true
      }),
      blur: () => withView((view) => {
        view.contentDOM.blur()
        return true
      }),
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
  }, [cmView, emitState])

  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter') return

      const target = event.target as HTMLElement | null
      if (!target?.closest('.cm-editor')) return

      const view = viewRef.current
      if (!view) return

      const handled = enterInMarkdownTable(view) || enterInMarkdownList(view) || enterAfterHiddenInlineSuffix(view)
      if (!handled) return

      event.preventDefault()
      event.stopPropagation()
    },
    [],
  )

  // Keep onViewReady fresh without re-init
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])
  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])
  useEffect(() => {
    onImageUploadRef.current = onImageUpload
  }, [onImageUpload])
  useEffect(() => {
    onStateChangeRef.current = onStateChange
  }, [onStateChange])
  useEffect(() => {
    onAnnotationClickRef.current = onAnnotationClick
  }, [onAnnotationClick])

  useEffect(() => {
    if (baselineValue === undefined) return
    baselineValueRef.current = baselineValue
    const view = viewRef.current
    if (view) emitState(view)
  }, [baselineValue, emitState])

  const onViewReadyRef = useRef(onViewReady)
  useEffect(() => {
    onViewReadyRef.current = onViewReady
  }, [onViewReady])

  const buildModeExtensions = useCallback((): Extension[] => {
    if (mode === 'source') return []
    return [
      visualMarkdown,
      tableDecorations,
      codeBlockDecorations(codeLanguages, codeHighlighter, codeHighlightStyle),
      markdownDecorations,
      checkboxDecorations,
      imageDecorations,
    ]
  }, [codeHighlighter, codeHighlightStyle, codeLanguages, mode])

  // ── Init CM6 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newValue = update.state.doc.toString()
        valueRef.current = newValue
        onChangeRef.current(newValue)
      }
      if (update.docChanged || update.selectionSet || update.focusChanged) {
        emitState(update.view)
      }
    })

    const shortcutGuard = EditorView.domEventHandlers({
      keydown(event, view) {
        if (!event.metaKey && !event.ctrlKey) return false
        if (event.altKey) return false

        const key = event.key.toLowerCase()
        if (key === 'b') {
          event.preventDefault()
          return toggleBold(view)
        }
        if (key === 'i') {
          event.preventDefault()
          return toggleItalic(view)
        }
        if (key === 'k') {
          event.preventDefault()
          return wrapLink(view)
        }
        if (key === '`') {
          event.preventDefault()
          return toggleInlineCode(view)
        }

        return false
      },
      mouseup(_event, view) {
        const selection = view.state.selection.main
        if (selection.empty) return false

        const expanded = expandInlineMarkdownRange(view.state, {
          from: selection.from,
          to: selection.to,
        })
        if (expanded.from === selection.from && expanded.to === selection.to) return false

        view.dispatch({
          selection: selection.anchor <= selection.head
            ? { anchor: expanded.from, head: expanded.to }
            : { anchor: expanded.to, head: expanded.from },
        })
        return false
      },
      copy(event, view) {
        const { text } = selectedMarkdownText(view.state)
        if (!text) return false

        event.preventDefault()
        event.clipboardData?.setData('text/plain', text)
        return true
      },
      cut(event, view) {
        if (!view.state.facet(EditorView.editable)) return false
        const { text, ranges } = selectedMarkdownText(view.state)
        if (!text) return false

        event.preventDefault()
        event.clipboardData?.setData('text/plain', text)
        view.dispatch({
          changes: ranges.map((range) => ({ from: range.from, to: range.to, insert: '' })),
        })
        return true
      },
      beforeinput(event) {
        if (
          event.inputType === 'formatBold' ||
          event.inputType === 'formatItalic' ||
          event.inputType === 'formatStrikeThrough' ||
          event.inputType === 'insertLink'
        ) {
          event.preventDefault()
          return true
        }

        return false
      },
    })

    const submitKeymap = onSubmit
      ? keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onSubmitRef.current?.()
              return true
            },
          },
        ])
      : []

    const extensions = [
      EditorState.tabSize.of(4),
      EditorView.contentAttributes.of({
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        'data-form-type': 'other',
        'data-lpignore': 'true',
        'data-1p-ignore': 'true',
      }),
      history(),
      markdownKeymap,
      keymap.of([
        {
          key: 'Enter',
          run: (view) => enterInMarkdownTable(view) || enterInMarkdownList(view) || enterAfterHiddenInlineSuffix(view),
        },
      ]),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      submitKeymap,
      markdown({
        base: markdownLanguage,
        codeLanguages: codeLanguages ? [...codeLanguages] : [],
      }),
      minueditorTheme,
      modeCompartment.current.of(buildModeExtensions()),
      imagePickerExtension(() => onImageUploadRef.current),
      annotationsCompartment.current.of(documentAnnotationExtension(annotations, handleAnnotationClick)),
      EditorView.lineWrapping,
      updateListener,
      EditorView.clipboardOutputFilter.of((text, state) => selectedMarkdownText(state).text || text),
      shortcutGuard,
      autolinkPaste,
      linkClickNavigation,
      imagePasteHandler(() => onImageUploadRef.current),
      ...(slashCommands !== false
        ? [slashCommandExtension(Array.isArray(slashCommands) ? slashCommands : editorSlashCommands)]
        : []),
      readOnlyCompartment.current.of(EditorView.editable.of(!readOnly)),
      ...(placeholder ? [cmPlaceholder(placeholder)] : []),
      ...(minHeight !== undefined
        ? [
            EditorView.theme({
              '&': { minHeight: `${minHeight}px` },
              '.cm-scroller': { minHeight: `${minHeight}px` },
            }),
          ]
        : []),
      ...(maxHeight !== undefined
        ? [
            EditorView.theme({
              '&': { maxHeight: `${maxHeight}px` },
              '.cm-scroller': {
                maxHeight: `${maxHeight}px`,
                overflowY: 'auto',
              },
            }),
          ]
        : []),
    ]

    const state = EditorState.create({
      doc: valueRef.current,
      extensions,
    })

    const view = new EditorView({ state, parent: container })
    viewRef.current = view
    setCmView(view)
    onViewReadyRef.current?.(view)
    emitState(view)

    if (autoFocus) view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
      setCmView(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Sync external value changes into CM6 ─────────────────────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (value === view.state.doc.toString()) return
    valueRef.current = value
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    })
  }, [value])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: modeCompartment.current.reconfigure(buildModeExtensions()),
    })
  }, [buildModeExtensions])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    view.dispatch({
      effects: annotationsCompartment.current.reconfigure(
        documentAnnotationExtension(annotations, handleAnnotationClick),
      ),
    })
  }, [annotations, handleAnnotationClick])

  // ── Sync readOnly prop changes via Compartment ────────────────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    readOnlyRef.current = readOnly
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorView.editable.of(!readOnly),
      ),
    })
    emitState(view)
  }, [readOnly, emitState])

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      className={`minueditor-wrap${className ? ` ${className}` : ''}`}
      onKeyDownCapture={handleKeyDownCapture}
    >
      <div ref={containerRef} className="minueditor" data-minueditor />
      {floatingToolbar && <FloatingToolbar view={cmView} />}
    </div>
  )
})
