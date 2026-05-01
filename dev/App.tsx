import { useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor } from '../src/index'
import { EditorToolbar } from '../src/index'
import '../src/theme/theme.css'

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

const DESCRIPTION_INITIAL = `A floating toolbar appears when you select text here. The editor goes **read-only on blur** — click to edit.`

const COMMENT_INITIAL = `No toolbar here. Use \`Cmd+B\` for bold, \`Cmd+I\` for italic. Press \`Cmd+Enter\` to submit.`

export default function App() {
  const [docValue, setDocValue] = useState(DOCUMENT_INITIAL)
  const [descValue, setDescValue] = useState(DESCRIPTION_INITIAL)
  const [commentValue, setCommentValue] = useState(COMMENT_INITIAL)
  const [docView, setDocView] = useState<EditorView | null>(null)

  return (
    <div className="app">
      <header className="app-header">
        <h1>@dpklabs/minueditor</h1>
        <p>Development playground</p>
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
          <p className="surface-desc">Floating selection toolbar · read-only on blur</p>
          <div className="editor-frame">
            <MarkdownEditor
              value={descValue}
              onChange={setDescValue}
              placeholder="Add a description…"
              floatingToolbar
              readOnlyOnBlur
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
              readOnlyOnBlur
              onSubmit={() => alert(`Submit: ${commentValue}`)}
              minHeight={60}
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
        </section>
      </main>
    </div>
  )
}
