import { toHtml } from 'hast-util-to-html'
import { createLowlight } from 'lowlight'
import { codeToHtml } from 'shiki'
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

const shikiLanguageAliases: Record<string, string> = {
  js: 'javascript',
  jsx: 'jsx',
  md: 'markdown',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  ts: 'typescript',
  tsx: 'tsx',
  yml: 'yaml',
  zsh: 'bash',
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;')
}

function normalizeLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase()
  return shikiLanguageAliases[normalized] ?? normalized
}

function renderPlainCodeHtml(code: string, lang: string): string {
  const languageAttr = lang ? ` data-language="${escapeAttribute(lang)}"` : ''
  return `<pre${languageAttr}><code>${escapeHtml(code)}</code></pre>`
}

export function renderCodeHtml(code: string, lang: string): string {
  if (!lang) return renderPlainCodeHtml(code, lang)

  try {
    const tree = lowlight.highlight(normalizeLanguage(lang), code)
    const html = toHtml(tree)
    return `<pre data-language="${escapeAttribute(lang)}"><code>${html}</code></pre>`
  } catch {
    return renderPlainCodeHtml(code, lang)
  }
}

export async function renderCodeHtmlWithShiki(code: string, lang: string): Promise<string | null> {
  const normalized = normalizeLanguage(lang)
  if (!normalized) return null

  try {
    return await codeToHtml(code, {
      lang: normalized,
      themes: {
        light: 'github-light',
        dark: 'github-dark',
      },
    })
  } catch {
    return null
  }
}
