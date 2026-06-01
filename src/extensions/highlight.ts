import { codeToHtml } from 'shiki'

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

export function renderCodeHtml(code: string, lang: string): string {
  const languageAttr = lang ? ` data-language="${escapeAttribute(lang)}"` : ''
  return `<pre${languageAttr}><code>${escapeHtml(code)}</code></pre>`
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
