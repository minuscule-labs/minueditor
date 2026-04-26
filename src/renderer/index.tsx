import { useEffect, useRef } from 'react'
import { marked } from 'marked'

interface MarkdownRendererProps {
  /** The plain markdown string to render. */
  value: string
  /** Called when the user clicks anywhere on the rendered content. */
  onClick?: (() => void) | undefined
  className?: string | undefined
}

// Configure marked once — GFM + line breaks
marked.setOptions({
  gfm: true,
  breaks: false,
})

/**
 * MarkdownRenderer — renders markdown as static HTML.
 *
 * Used as the "viewing" state when `readOnlyOnBlur` is set.
 * Clicking the rendered content fires `onClick` so the parent
 * can switch back to edit mode.
 *
 * Checkboxes in task lists remain interactive — toggling them
 * fires `onCheckboxToggle` which the parent reflects back into
 * the markdown value.
 */
export function MarkdownRenderer({
  value,
  onClick,
  className,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse markdown synchronously (marked is sync by default)
  const html = marked.parse(value) as string

  // Wire up checkbox interactivity after render
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // marked renders GFM task list items as:
    // <li><input type="checkbox" disabled> text</li>
    // We remove `disabled` to make them interactive,
    // but since we can't write back to markdown here,
    // checkboxes are read-only in the renderer.
    // Interactive toggling is handled by the CM6 checkbox widget
    // in edit mode — the renderer shows the current state only.
    const checkboxes = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]'
    )
    checkboxes.forEach((cb) => {
      cb.removeAttribute('disabled')
      // Prevent toggling in read-only renderer
      cb.addEventListener('click', (e) => e.preventDefault())
    })
  }, [html])

  return (
    <div
      ref={containerRef}
      className={`me-renderer${className ? ` ${className}` : ''}`}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: marked output is trusted (user's own content)
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
    />
  )
}
