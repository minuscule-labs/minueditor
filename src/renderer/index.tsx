import { useEffect, useRef } from 'react'
import { Marked } from 'marked'
import { renderCodeHtml, highlightCodeHtml } from '../extensions/highlight'
import type { CodeHighlighter } from '../types'

interface MarkdownRendererProps {
  /** The plain markdown string to render. */
  value: string
  /** Called when the user clicks anywhere on the rendered content. */
  onClick?: (() => void) | undefined
  /** Optional syntax highlighter for rendered fenced code. Defaults to plain escaped code. */
  codeHighlighter?: CodeHighlighter | undefined
  className?: string | undefined
}

const renderer = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      return renderCodeHtml(text, lang || '')
    },
  },
})

/**
 * MarkdownRenderer — renders markdown as static HTML.
 *
 * Consumers can use this alongside `MarkdownEditor` when they want
 * to control viewing vs editing state outside the core editor.
 */
export function MarkdownRenderer({
  value,
  onClick,
  codeHighlighter,
  className,
}: MarkdownRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Parse markdown synchronously (marked is sync by default)
  const html = renderer.parse(value) as string

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

    let isDisposed = false
    const blocks = container.querySelectorAll<HTMLPreElement>('pre[data-language]')
    blocks.forEach((block) => {
      const lang = block.dataset.language
      const code = block.textContent
      if (!lang || code == null) return

      void highlightCodeHtml(codeHighlighter, code, lang).then((highlighted) => {
        if (!highlighted || isDisposed || !block.isConnected) return
        block.outerHTML = highlighted
      })
    })

    return () => {
      isDisposed = true
    }
  }, [html, codeHighlighter])

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
