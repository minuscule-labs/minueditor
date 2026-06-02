import { useEffect, useMemo, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor } from '../src/index'
import { EditorToolbar } from '../src/index'
import type { CodeHighlighter, DocumentAnnotation } from '../src/index'
import { createShikiHighlighter } from '../src/shiki'
import '../src/theme/theme.css'
import lightThemeUrl from '../src/theme/themes/light.css?url'
import darkThemeUrl from '../src/theme/themes/dark.css?url'

type ThemeChoice = 'base' | 'light' | 'dark'

const THEME_URLS: Record<Exclude<ThemeChoice, 'base'>, string> = {
  light: lightThemeUrl,
  dark: darkThemeUrl,
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

const COMMENT_DOC = `# Commented draft

This section has review notes attached to specific lines.

## Scope

We should explain the tradeoff before merging.

## Risks

The anchor model may drift if the document changes a lot above the comment.

## Follow-up

Add replies, resolve state, and a sidebar thread view later.
`

const AI_DOC = `# AI change highlights

The editor can render annotations for generated, updated, added, and deleted ranges.

## Generated

This paragraph was drafted by an agent.

## Updated

This paragraph was revised by an agent after a human edit.

## Added

This section was inserted during an automation pass.

## Deleted

This line remains in the document but should be struck through in the review surface.
`

function annotationById(annotations: readonly DocumentAnnotation[], id: string | null) {
  if (!id) return null
  return annotations.find((annotation) => annotation.id === id) ?? null
}

function AnnotationSurface({
  title,
  description,
  value,
  annotations,
  selectedId,
  onAnnotationClick,
  sidebarLabel,
  codeHighlighter,
}: {
  title: string
  description: string
  value: string
  annotations: readonly DocumentAnnotation[]
  selectedId: string | null
  onAnnotationClick: (annotation: DocumentAnnotation, view: EditorView) => void
  sidebarLabel: string
  codeHighlighter: CodeHighlighter
}) {
  const selectedAnnotation = useMemo(
    () => annotationById(annotations, selectedId),
    [annotations, selectedId],
  )

  return (
    <section className="surface">
      <h2>{title}</h2>
      <p className="surface-desc">{description}</p>
      <div className="annotation-layout">
        <div className="editor-frame">
          <MarkdownEditor
            value={value}
            onChange={() => {}}
            annotations={annotations}
            onAnnotationClick={onAnnotationClick}
            readOnly
            minHeight={240}
            slashCommands={false}
            codeHighlighter={codeHighlighter}
          />
        </div>
        <aside className="annotation-panel">
          <div className="annotation-panel__header">{sidebarLabel}</div>
          {selectedAnnotation ? (
            <div className="annotation-panel__body">
              <div className="annotation-panel__label">{selectedAnnotation.label ?? selectedAnnotation.kind}</div>
              <div className="annotation-panel__meta">
                {selectedAnnotation.actorType ? <span>{selectedAnnotation.actorType}</span> : null}
                {selectedAnnotation.status ? <span>{selectedAnnotation.status}</span> : null}
                {selectedAnnotation.anchorType === 'line' ? (
                  <span>
                    lines {selectedAnnotation.startLine ?? 1}
                    {selectedAnnotation.endLine && selectedAnnotation.endLine !== selectedAnnotation.startLine
                      ? `-${selectedAnnotation.endLine}`
                      : ''}
                  </span>
                ) : (
                  <span>range {selectedAnnotation.from ?? 0}-{selectedAnnotation.to ?? 0}</span>
                )}
              </div>
              <pre>{JSON.stringify(selectedAnnotation, null, 2)}</pre>
            </div>
          ) : (
            <div className="annotation-panel__empty">Click an annotation to inspect it.</div>
          )}
        </aside>
      </div>
    </section>
  )
}

function CommentAnnotationsDemo({ codeHighlighter }: { codeHighlighter: CodeHighlighter }) {
  const [selectedId, setSelectedId] = useState<string | null>('comment-2')

  const annotations = useMemo<readonly DocumentAnnotation[]>(
    () => [
      {
        id: 'comment-1',
        documentId: 'comments-doc',
        kind: 'comment',
        actorType: 'user',
        anchorType: 'line',
        startLine: 5,
        endLine: 7,
        label: 'Clarify scope',
        status: 'open',
      },
      {
        id: 'comment-2',
        documentId: 'comments-doc',
        kind: 'comment',
        actorType: 'agent',
        anchorType: 'line',
        startLine: 9,
        endLine: 11,
        label: 'Add a follow-up',
        status: 'open',
      },
    ],
    [],
  )

  return (
    <AnnotationSurface
      title="Comment wrapper"
      description="External comment threads rendered as annotations, not markdown metadata."
      value={COMMENT_DOC}
      annotations={annotations}
      selectedId={selectedId}
      sidebarLabel="Comment thread"
      codeHighlighter={codeHighlighter}
      onAnnotationClick={(annotation) => setSelectedId(annotation.id)}
    />
  )
}

function AIChangeHighlightsDemo({ codeHighlighter }: { codeHighlighter: CodeHighlighter }) {
  const [selectedId, setSelectedId] = useState<string | null>('ai-updated')

  const annotations = useMemo<readonly DocumentAnnotation[]>(
    () => [
      {
        id: 'ai-generated',
        documentId: 'ai-doc',
        kind: 'generated',
        actorType: 'agent',
        actorId: 'pi',
        anchorType: 'line',
        startLine: 5,
        endLine: 7,
        label: 'AI drafted',
      },
      {
        id: 'ai-updated',
        documentId: 'ai-doc',
        kind: 'updated',
        actorType: 'agent',
        actorId: 'pi',
        anchorType: 'line',
        startLine: 9,
        endLine: 11,
        label: 'AI revised',
      },
      {
        id: 'ai-added',
        documentId: 'ai-doc',
        kind: 'added',
        actorType: 'system',
        anchorType: 'range',
        from: AI_DOC.indexOf('This section was inserted'),
        to: AI_DOC.indexOf('This section was inserted') + 'This section was inserted during an automation pass.'.length,
        label: 'AI inserted text',
      },
      {
        id: 'ai-deleted',
        documentId: 'ai-doc',
        kind: 'deleted',
        actorType: 'agent',
        anchorType: 'line',
        startLine: 17,
        endLine: 19,
        label: 'AI removed candidate',
      },
    ],
    [],
  )

  return (
    <AnnotationSurface
      title="AI change wrapper"
      description="Generated, updated, added, and deleted ranges all render through the same annotation API."
      value={AI_DOC}
      annotations={annotations}
      selectedId={selectedId}
      sidebarLabel="Change metadata"
      codeHighlighter={codeHighlighter}
      onAnnotationClick={(annotation) => setSelectedId(annotation.id)}
    />
  )
}

export default function App() {
  const [docValue, setDocValue] = useState(DOCUMENT_INITIAL)
  const [descValue, setDescValue] = useState(DESCRIPTION_INITIAL)
  const [commentValue, setCommentValue] = useState(COMMENT_INITIAL)
  const [imageValue, setImageValue] = useState(IMAGE_INITIAL)
  const [docView, setDocView] = useState<EditorView | null>(null)
  const [docEditing, setDocEditing] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>('base')
  const codeHighlighter = useMemo(() => createShikiHighlighter(), [])

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
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>

      <main className="app-main">
        <section className="surface">
          <h2>Document surface</h2>
          <p className="surface-desc">
            Full persistent toolbar · starts read-only so click the editor to enter edit mode
          </p>
          <div
            className="editor-frame"
            onMouseDown={() => {
              if (!docEditing) setDocEditing(true)
            }}
          >
            <EditorToolbar view={docEditing ? docView : null} variant="full" />
            <MarkdownEditor
              value={docValue}
              onChange={setDocValue}
              placeholder="Start writing…"
              minHeight={300}
              onViewReady={setDocView}
              codeHighlighter={codeHighlighter}
              readOnly={!docEditing}
            />
          </div>
          <button type="button" onClick={() => setDocEditing(false)}>
            Return document surface to read-only
          </button>
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

        <CommentAnnotationsDemo codeHighlighter={codeHighlighter} />

        <AIChangeHighlightsDemo codeHighlighter={codeHighlighter} />

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
