import type { EditorView } from '@codemirror/view'

let highlighter: any = null
let ready = false
let initPromise: Promise<void> | null = null
const loadedLangs = new Set<string>()
const cache = new Map<string, string>()

const COMMON_LANGS = [
  'javascript',
  'typescript',
  'python',
  'json',
  'bash',
  'markdown',
  'yaml',
  'html',
  'css',
  'sql',
]

async function init() {
  if (ready || highlighter) return
  if (initPromise) return initPromise

  initPromise = (async () => {
  try {
    const { createHighlighter } = await import('shiki')
    const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript')

    highlighter = await createHighlighter({
      themes: ['github-light'],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })

    for (const lang of COMMON_LANGS) {
      try {
        await highlighter.loadLanguage(lang)
        loadedLangs.add(lang)
      } catch {
        // ignore unsupported languages
      }
    }

    ready = true
  } catch {
    // Shiki failed to load — editor will work without highlighting
    ready = true
  } finally {
    initPromise = null
  }
  })()

  return initPromise
}

export function ensureShiki(view?: EditorView): void {
  void view
  if (ready) return
  void init()
}

export function isLangLoaded(lang: string): boolean {
  return loadedLangs.has(lang)
}

export async function loadLang(lang: string): Promise<boolean> {
  await init()
  if (!highlighter) return false
  if (loadedLangs.has(lang)) return true
  try {
    await highlighter.loadLanguage(lang)
    loadedLangs.add(lang)
    return true
  } catch {
    return false
  }
}

export function highlight(code: string, lang: string): string | null {
  if (!highlighter || !loadedLangs.has(lang)) return null
  const key = `${lang}\0${code}`
  if (cache.has(key)) return cache.get(key)!
  try {
    const html = highlighter.codeToHtml(code, {
      lang,
      theme: 'github-light',
    })
    // Strip Shiki's inline background so our CSS controls it
    const cleaned = html.replace(/style="background-color: #[0-9a-fA-F]+"/, 'style=""')
    // cap cache size
    if (cache.size > 200) {
      const first = cache.keys().next().value
      if (first !== undefined) cache.delete(first)
    }
    cache.set(key, cleaned)
    return cleaned
  } catch {
    return null
  }
}
