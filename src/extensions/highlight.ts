import { toHtml } from 'hast-util-to-html'
import { createLowlight } from 'lowlight'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

const lowlight = createLowlight()

lowlight.register({
  bash,
  css,
  javascript,
  json,
  markdown,
  python,
  sql,
  typescript,
  xml,
  yaml,
})

lowlight.registerAlias({
  bash: ['sh', 'shell', 'zsh'],
  javascript: ['js', 'jsx'],
  markdown: ['md'],
  typescript: ['ts', 'tsx'],
  xml: ['html'],
  yaml: ['yml'],
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderCodeHtml(code: string, lang: string): string {
  if (!lang) return `<pre><code>${escapeHtml(code)}</code></pre>`

  try {
    const tree = lowlight.highlight(lang.trim().toLowerCase(), code)
    const html = toHtml(tree)
    return `<pre><code>${html}</code></pre>`
  } catch {
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
}
