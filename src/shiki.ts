import { codeToHtml } from 'shiki'
import type { CodeHighlighter } from './types'

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

function normalizeLanguage(lang: string): string {
  const normalized = lang.trim().toLowerCase()
  return shikiLanguageAliases[normalized] ?? normalized
}

export interface ShikiHighlighterOptions {
  themes?: Record<string, string>
  theme?: string
}

export function createShikiHighlighter(
  options: ShikiHighlighterOptions = {},
): CodeHighlighter {
  return async (code, lang) => {
    const normalized = normalizeLanguage(lang)
    if (!normalized) return null

    try {
      return await codeToHtml(code, options.theme
        ? {
          lang: normalized,
          theme: options.theme,
        }
        : {
          lang: normalized,
          themes: options.themes ?? {
            light: 'github-light',
            dark: 'github-dark',
          },
        })
    } catch {
      return null
    }
  }
}
