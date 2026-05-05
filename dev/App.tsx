import { useEffect, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor } from '../src/index'
import { EditorToolbar } from '../src/index'
import '../src/theme/theme.css'
import opencodeThemeUrl from '../src/theme/themes/opencode.css?url'
import ghosttyThemeUrl from '../src/theme/themes/ghostty.css?url'
import terminalThemeUrl from '../src/theme/themes/terminal.css?url'

type ThemeChoice = 'base' | 'opencode' | 'ghostty' | 'terminal'

const THEME_URLS: Record<Exclude<ThemeChoice, 'base'>, string> = {
  opencode: opencodeThemeUrl,
  ghostty: ghosttyThemeUrl,
  terminal: terminalThemeUrl,
}

const DOCUMENT_INITIAL = `# Welcome to minueditor

This is the **document** surface with basic live markdown only.

## Features

- Live markdown decorations (Obsidian-style)
- Syntax tokens hide off the active line
- **Bold**, *italic*, ~~strikethrough~~, \`inline code\`

### Tasks

- Build the editor core
- Add live decorations
- Keep advanced widgets out of the default setup

### Table

| Name | Role | Location |
| --- | --- | --- |
| Alice | Engineer | NYC |
| Bob | Designer | LA |

### Code

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`
}
\`\`\`
`

const DESCRIPTION_INITIAL = `A floating toolbar appears when you select text here.`

const COMMENT_INITIAL = `No toolbar here. Use \`Cmd+B\` for bold, \`Cmd+I\` for italic. Press \`Cmd+Enter\` to submit.`

const IMAGE_INITIAL = `Paste or drop an image into this surface. The dev app uses an object URL upload handler so you can review the flow without wiring storage.`

export default function App() {
  const [docValue, setDocValue] = useState(DOCUMENT_INITIAL)
  const [descValue, setDescValue] = useState(DESCRIPTION_INITIAL)
  const [commentValue, setCommentValue] = useState(COMMENT_INITIAL)
  const [imageValue, setImageValue] = useState(IMAGE_INITIAL)
  const [docView, setDocView] = useState<EditorView | null>(null)
  const [theme, setTheme] = useState<ThemeChoice>('base')

  async function handleDemoImageUpload(file: File) {
    return URL.createObjectURL(file)
  }

  useEffect(() => {
    const id = 'minueditor-dev-theme'
    let link = document.getElementById(id) as HTMLLinkElement | null

    if (theme === 'base') {
      link?.remove()
      return
    }

    if (!link) {
      link = document.createElement('link')
      link.id = id
      link.rel = 'stylesheet'
      document.head.appendChild(link)
    }

    link.href = THEME_URLS[theme]
  }, [theme])

  return (
    <div className={`app app--theme-${theme}`}>
      <header className="app-header">
        <div>
          <h1>@dpklabs/minueditor</h1>
          <p>Development playground</p>
        </div>
        <label className="theme-picker">
          <span>Theme</span>
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeChoice)}>
            <option value="base">Base</option>
            <option value="opencode">OpenCode</option>
            <option value="ghostty">Ghostty</option>
            <option value="terminal">Terminal</option>
          </select>
        </label>
      </header>

      <main className="app-main">
        <section className="surface">
          <h2>Document surface</h2>
          <p className="surface-desc">Full persistent toolbar · all features</p>
          <div className="editor-frame">
            <EditorToolbar view={docView} variant="full" />
            <MarkdownEditor
              value={docValue}
              onChange={setDocValue}
              placeholder="Start writing…"
              minHeight={300}
              onViewReady={setDocView}
            />
          </div>
        </section>

        <section className="surface">
          <h2>Description surface</h2>
          <p className="surface-desc">Floating selection toolbar</p>
          <div className="editor-frame">
            <MarkdownEditor
              value={descValue}
              onChange={setDescValue}
              placeholder="Add a description…"
              floatingToolbar
              minHeight={80}
            />
          </div>
        </section>

        <section className="surface">
          <h2>Comment surface</h2>
          <p className="surface-desc">No toolbar · Cmd+Enter to submit</p>
          <div className="editor-frame">
            <MarkdownEditor
              value={commentValue}
              onChange={setCommentValue}
              placeholder="Write a comment…"
              onSubmit={() => alert(`Submit: ${commentValue}`)}
              minHeight={60}
            />
          </div>
        </section>

        <section className="surface">
          <h2>Image surface</h2>
          <p className="surface-desc">Paste or drop images · app-provided upload hook</p>
          <div className="editor-frame">
            <MarkdownEditor
              value={imageValue}
              onChange={setImageValue}
              onImageUpload={handleDemoImageUpload}
              placeholder="Paste or drop an image…"
              minHeight={120}
            />
          </div>
        </section>

        <section className="surface">
          <h2>State inspector</h2>
          <details>
            <summary>Document value</summary>
            <pre>{docValue}</pre>
          </details>
          <details>
            <summary>Description value</summary>
            <pre>{descValue}</pre>
          </details>
          <details>
            <summary>Comment value</summary>
            <pre>{commentValue}</pre>
          </details>
          <details>
            <summary>Image value</summary>
            <pre>{imageValue}</pre>
          </details>
        </section>
      </main>
    </div>
  )
}
