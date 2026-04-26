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
export function FloatingToolbar({ view }: FloatingToolbarProps) {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState<Position>({ top: 0, left: 0 })
  const toolbarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!view) return

    // Use a MutationObserver-free approach: CM6 fires update callbacks.
    // We need to observe selection changes — use EditorView.updateListener.
    // But we can't add it after init here. Instead, poll via requestAnimationFrame.
    // This is the standard approach for floating toolbars outside CM6's plugin system.

    let rafId: number

    function update() {
      if (!view) return

      const sel = view.state.selection.main
      const hasSelection = !sel.empty

      if (!hasSelection || !view.hasFocus) {
        setVisible(false)
        rafId = requestAnimationFrame(update)
        return
      }

      // Position above the selection start
      const coords = view.coordsAtPos(sel.from)
      if (!coords) {
        setVisible(false)
        rafId = requestAnimationFrame(update)
        return
      }

      setVisible(true)
      setPos({
        top: coords.top + window.scrollY - TOOLBAR_HEIGHT - TOOLBAR_OFFSET,
        left: coords.left + window.scrollX,
      })

      rafId = requestAnimationFrame(update)
    }

    rafId = requestAnimationFrame(update)
    return () => cancelAnimationFrame(rafId)
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
      {FLOATING_BUTTONS.map((btn) => (
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
      ))}
    </div>,
    document.body
  )
}
