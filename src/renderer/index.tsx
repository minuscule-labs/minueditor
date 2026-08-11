import { useEffect, useMemo, useRef } from 'react'
import { Marked } from 'marked'
import type { RendererThis, Tokens } from 'marked'
import { renderCodeHtml, highlightCodeHtml } from '../extensions/highlight'
import type { CodeHighlighter, MermaidConfig, ResourceUrlResolver } from '../types'
import {
  decodeMarkdownResourceDestination,
  encodeResourceUrlForHtmlAttribute,
  escapeHtmlAttribute,
  resolveAndValidateResourceUrl,
} from '../internal/resource-urls'
import { enhanceRendererCallouts } from '../extensions/callouts'
import { enhanceRendererMermaid, normalizeMermaidConfig } from '../extensions/mermaid'

export interface MarkdownRendererProps {
  /** The plain markdown string to render. */
  value: string
  /** Called when the user clicks anywhere on the rendered content. */
  onClick?: (() => void) | undefined
  /** Optional syntax highlighter for rendered fenced code. Defaults to plain escaped code. */
  codeHighlighter?: CodeHighlighter | undefined
  /** Opt-in Mermaid fenced-block rendering. Disabled by default. */
  mermaid?: boolean | MermaidConfig | undefined
  /** Resolves parsed canonical Markdown image/link destinations for runtime rendering only. */
  resourceUrlResolver?: ResourceUrlResolver | undefined
  className?: string | undefined
}

function renderLink(
  this: RendererThis,
  token: Tokens.Link,
  resourceUrlResolver?: ResourceUrlResolver,
): string {
  const text = this.parser.parseInline(token.tokens)
  const canonicalHref = decodeMarkdownResourceDestination(token.href)
  const resource = resolveAndValidateResourceUrl(canonicalHref, 'link', resourceUrlResolver)
  if (!resource.validation.allowed) return text

  const href = encodeResourceUrlForHtmlAttribute(resource.validation.url)
  if (href == null) return text

  let output = `<a href="${href}"`
  if (token.title) {
    output += ` title="${escapeHtmlAttribute(decodeMarkdownResourceDestination(token.title))}"`
  }
  return `${output}>${text}</a>`
}

function renderImage(
  this: RendererThis,
  token: Tokens.Image,
  resourceUrlResolver?: ResourceUrlResolver,
): string {
  const alt = token.tokens
    ? this.parser.parseInline(token.tokens, this.parser.textRenderer)
    : token.text
  const escapedAlt = escapeHtmlAttribute(decodeMarkdownResourceDestination(alt))
  const canonicalHref = decodeMarkdownResourceDestination(token.href)
  const resource = resolveAndValidateResourceUrl(canonicalHref, 'image', resourceUrlResolver)
  if (!resource.validation.allowed) return escapedAlt

  const src = encodeResourceUrlForHtmlAttribute(resource.validation.url)
  if (src == null) return escapedAlt

  let output = `<img src="${src}" alt="${escapedAlt}"`
  if (token.title) {
    output += ` title="${escapeHtmlAttribute(decodeMarkdownResourceDestination(token.title))}"`
  }
  return `${output}>`
}

function createMarkdownParser(resourceUrlResolver?: ResourceUrlResolver): Marked {
  return new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      code({ text, lang }) {
        return renderCodeHtml(text, lang || '')
      },
      link(token) {
        return renderLink.call(this, token, resourceUrlResolver)
      },
      image(token) {
        return renderImage.call(this, token, resourceUrlResolver)
      },
    },
  })
}

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
  mermaid = false,
  resourceUrlResolver,
  className,
}: MarkdownRendererProps) {
  const normalizedMermaid = normalizeMermaidConfig(mermaid)
  const stableMermaidConfig = useMemo(
    () => normalizedMermaid.enabled
      ? {
          enabled: true,
          theme: normalizedMermaid.theme,
          load: normalizedMermaid.load,
        }
      : false,
    [normalizedMermaid.enabled, normalizedMermaid.load, normalizedMermaid.theme],
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const markdownParser = useMemo(
    () => createMarkdownParser(resourceUrlResolver),
    [resourceUrlResolver],
  )

  // Parse markdown synchronously (marked is sync by default)
  const html = useMemo(() => markdownParser.parse(value) as string, [markdownParser, value])

  // Wire up checkbox interactivity after render
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    enhanceRendererCallouts(container)
    const cancelMermaid = enhanceRendererMermaid(container, stableMermaidConfig)

    container.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
      if (table.parentElement?.classList.contains('me-renderer-table-scroller')) return

      const scroller = document.createElement('div')
      scroller.className = 'me-renderer-table-scroller'
      table.parentNode?.insertBefore(scroller, table)
      scroller.appendChild(table)
    })

    container.querySelectorAll<HTMLLIElement>('li').forEach((li) => {
      const first = li.firstChild
      if (!first || first.nodeType !== Node.TEXT_NODE) return
      const text = first.textContent ?? ''
      const match = text.match(/^\[\/\]\s+/)
      if (!match) return

      first.textContent = text.slice(match[0].length)
      li.classList.add('task-list-item', 'me-task-list-item--partial')
      li.parentElement?.classList.add('contains-task-list')

      const checkbox = document.createElement('span')
      checkbox.className = 'me-renderer-checkbox me-renderer-checkbox--partial'
      checkbox.setAttribute('role', 'checkbox')
      checkbox.setAttribute('aria-checked', 'mixed')
      checkbox.setAttribute('aria-label', 'In progress')
      li.prepend(checkbox)
    })

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
      cancelMermaid()
    }
  }, [html, codeHighlighter, stableMermaidConfig])

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
