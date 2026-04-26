import {
  forwardRef,
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
import { markdownKeymap } from './extensions/keymap'
import { FloatingToolbar } from './toolbar/FloatingToolbar'
import { MarkdownRenderer } from './renderer'
import type { MarkdownEditorProps } from './types'
import { visualMarkdown } from './extensions/visual-markdown'
import {
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
 *
 * When `readOnlyOnBlur` is set, the component switches between
 * an editing state (CM6 active) and a viewing state (MarkdownRenderer).
 * Clicking the rendered view re-enters edit mode.
 *
 * When `floatingToolbar` is set, a FloatingToolbar appears above
 * text selections inside the editor.
 *
 * When `onViewReady` is set, it is called with the EditorView instance
 * after CM6 mounts (or re-mounts). Useful for wiring an external toolbar.
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
    readOnlyOnBlur = false,
    floatingToolbar = false,
    autoFocus = false,
    minHeight,
    maxHeight,
    onSubmit,
    onViewReady,
    className,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const readOnlyCompartment = useRef(new Compartment());

  // Store the view in state so consumers of cmView (FloatingToolbar, onViewReady)
  // see it after CM6 mounts — viewRef alone wouldn't trigger a re-render.
  const [cmView, setCmView] = useState<EditorView | null>(null);

  // When readOnlyOnBlur is set, start in viewing mode unless autoFocus
  const [mode, setMode] = useState<"editing" | "viewing">(
    readOnlyOnBlur && !autoFocus ? "viewing" : "editing",
  )

  // Expose the EditorView via ref
  useImperativeHandle(ref, () => ({ view: viewRef.current }), [cmView])

  const enterEditMode = useCallback(() => {
    setMode('editing')
  }, [])

  // Keep onViewReady fresh without re-init
  const onViewReadyRef = useRef(onViewReady)
  useEffect(() => {
    onViewReadyRef.current = onViewReady
  }, [onViewReady])

  // ── Init CM6 ──────────────────────────────────────────────────────────
  useEffect(() => {
    // Don't mount CM6 while we're in viewing mode
    if (mode === 'viewing') return

    const container = containerRef.current
    if (!container) return

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newValue = update.state.doc.toString()
        valueRef.current = newValue
        onChange(newValue)
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

    // Blur handler — switch to viewing mode when readOnlyOnBlur is set
    const blurHandler = readOnlyOnBlur
      ? EditorView.domEventHandlers({
          blur() {
            // Small delay so toolbar clicks don't trigger blur→view transition
            setTimeout(() => setMode('viewing'), 150)
          },
        })
      : []

    const submitKeymap = onSubmit
      ? keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onSubmit()
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
      markdownDecorations,
      EditorView.lineWrapping,
      updateListener,
      shortcutGuard,
      blurHandler,
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

    // Focus when switching from viewing → editing
    view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
      setCmView(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Intentionally re-runs only when mode changes (mount/unmount CM6)
  }, [mode])

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

  if (mode === 'viewing') {
    return (
      <MarkdownRenderer
        value={value}
        onClick={readOnly ? undefined : enterEditMode}
        className={className}
      />
      )
  }

  return (
    <div className={`minueditor-wrap${className ? ` ${className}` : ''}`}>
      <div ref={containerRef} className="minueditor" data-minueditor />
      {floatingToolbar && <FloatingToolbar view={cmView} />}
    </div>
  )
})
