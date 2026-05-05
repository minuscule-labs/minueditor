import {
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  placeholder as cmPlaceholder,
  keymap,
} from '@codemirror/view'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { minueditorTheme } from './theme'
import { markdownDecorations } from './extensions/decorations'
import { checkboxDecorations } from './extensions/checkboxes'
import { autolinkPaste } from './extensions/autolink'
import { tableDecorations } from './extensions/tables'
import { codeBlockDecorations } from './extensions/codeblock'
import { imageDecorations, imagePasteHandler } from './extensions/images'
import { markdownKeymap } from './extensions/keymap'
import { FloatingToolbar } from './toolbar/FloatingToolbar'
import type { MarkdownEditorProps } from './types'
import { visualMarkdown } from './extensions/visual-markdown'
import {
  enterAfterHiddenInlineSuffix,
  enterInMarkdownTable,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  wrapLink,
} from './toolbar/commands'

export interface MarkdownEditorHandle {
  view: EditorView | null
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
    placeholder,
    readOnly = false,
    floatingToolbar = false,
    autoFocus = false,
    minHeight,
    maxHeight,
    onSubmit,
    onImageUpload,
    onViewReady,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const readOnlyCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  const onImageUploadRef = useRef(onImageUpload)

  // Store the view in state so consumers of cmView (FloatingToolbar, onViewReady)
  // see it after CM6 mounts — viewRef alone wouldn't trigger a re-render.
  const [cmView, setCmView] = useState<EditorView | null>(null);

  // Expose the EditorView via ref
  useImperativeHandle(ref, () => ({ view: viewRef.current }), [cmView])

  const handleKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Enter') return

      const target = event.target as HTMLElement | null
      if (!target?.closest('.cm-editor')) return

      const view = viewRef.current
      if (!view) return

      const handled = enterInMarkdownTable(view) || enterAfterHiddenInlineSuffix(view)
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

  const onViewReadyRef = useRef(onViewReady)
  useEffect(() => {
    onViewReadyRef.current = onViewReady
  }, [onViewReady])

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
      history(),
      markdownKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      submitKeymap,
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      minueditorTheme,
      visualMarkdown,
      tableDecorations,
      codeBlockDecorations,
      markdownDecorations,
      checkboxDecorations,
      imageDecorations,
      EditorView.lineWrapping,
      updateListener,
      shortcutGuard,
      autolinkPaste,
      imagePasteHandler(() => onImageUploadRef.current),
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

  // ── Sync readOnly prop changes via Compartment ────────────────────────
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorView.editable.of(!readOnly),
      ),
    })
  }, [readOnly])

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
