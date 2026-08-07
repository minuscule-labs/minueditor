import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { EditorView } from '@codemirror/view'
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  wrapLink,
  setHeading,
} from './commands'

interface FloatingToolbarProps {
  view: EditorView | null
  showFormatting?: boolean
  onCommentRequest?: (view: EditorView) => void
}

interface Position {
  top: number
  left: number
}

const FLOATING_BUTTONS = [
  { label: 'B', title: 'Bold', run: toggleBold },
  { label: 'I', title: 'Italic', run: toggleItalic },
  { label: 'S', title: 'Strikethrough', run: toggleStrikethrough },
  { label: '`', title: 'Inline code', run: toggleInlineCode },
  { label: '🔗', title: 'Link', run: wrapLink },
  { label: 'H2', title: 'Heading 2', run: (v: EditorView) => setHeading(v, 2) },
  { label: 'H3', title: 'Heading 3', run: (v: EditorView) => setHeading(v, 3) },
] as const

const TOOLBAR_HEIGHT = 36 // px — approximate, keeps toolbar above selection
const TOOLBAR_OFFSET = 8  // gap between toolbar bottom and selection top

/**
 * FloatingToolbar — renders above the current text selection.
 *
 * Mounted as a portal at document.body to escape overflow clipping.
 * Dismisses when the selection collapses or focus leaves the editor.
 */
export function FloatingToolbar({
  view,
  showFormatting = true,
  onCommentRequest,
}: FloatingToolbarProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<Position>({ top: 0, left: 0 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!view) return
    const editorView = view

    let rafId = 0

    function update() {
      const sel = editorView.state.selection.main
      const hasSelection = !sel.empty

      if (!hasSelection || !editorView.hasFocus) {
        setVisible(false)
        return
      }

      const coords = editorView.coordsAtPos(sel.from)
      if (!coords) {
        setVisible(false)
        return
      }

      setVisible(true)
      setPos({
        top: coords.top + window.scrollY - TOOLBAR_HEIGHT - TOOLBAR_OFFSET,
        left: coords.left + window.scrollX,
      })
    }

    function scheduleUpdate() {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(update)
    }

    const handleFocusOut = () => {
      window.setTimeout(scheduleUpdate, 0)
    }

    document.addEventListener('selectionchange', scheduleUpdate)
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('scroll', scheduleUpdate, true)
    editorView.dom.addEventListener('focusin', scheduleUpdate)
    editorView.dom.addEventListener('focusout', handleFocusOut)

    scheduleUpdate()

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('selectionchange', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('scroll', scheduleUpdate, true)
      editorView.dom.removeEventListener('focusin', scheduleUpdate)
      editorView.dom.removeEventListener('focusout', handleFocusOut)
    }
  }, [view])

  if (!visible || !view) return null

  return createPortal(
    <div
      ref={toolbarRef}
      className="me-toolbar me-toolbar--floating"
      role="toolbar"
      aria-label="Formatting"
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
      }}
    >
      {showFormatting ? FLOATING_BUTTONS.map((btn) => (
        <button
          key={btn.label}
          type="button"
          title={btn.title}
          aria-label={btn.title}
          className="me-toolbar-btn"
          onMouseDown={(e) => {
            e.preventDefault() // prevent editor blur
            btn.run(view)
            view.focus()
          }}
        >
          {btn.label}
        </button>
      )) : null}
      {onCommentRequest ? (
        <button
          type="button"
          title="Comment"
          aria-label="Comment"
          className="me-toolbar-btn me-toolbar-btn--comment"
          onMouseDown={(event) => {
            event.preventDefault()
            onCommentRequest(view)
          }}
        >Comment</button>
      ) : null}
    </div>,
    document.body
  )
}
