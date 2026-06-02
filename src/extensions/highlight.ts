import type { CodeHighlighter } from '../types'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

export function renderCodeHtml(code: string, lang: string): string {
  const languageAttr = lang ? ` data-language="${escapeAttribute(lang)}"` : ''
  return `<pre${languageAttr}><code>${escapeHtml(code)}</code></pre>`
}

export async function highlightCodeHtml(
  highlighter: CodeHighlighter | undefined,
  code: string,
  lang: string,
): Promise<string | null> {
  if (!highlighter) return null

  try {
    return await highlighter(code, lang)
  } catch {
    return null
  }
}
