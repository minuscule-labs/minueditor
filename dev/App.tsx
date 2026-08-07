import { useEffect, useMemo, useRef, useState } from 'react'
import { LanguageDescription } from '@codemirror/language'
import { javascript } from '@codemirror/lang-javascript'
import type { EditorView } from '@codemirror/view'
import { EditorToolbar, MarkdownEditor, MarkdownRenderer, parseMarkdownHeadings } from '../src/index'
import type {
  CodeHighlighter,
  EditorComment,
  MarkdownEditorHandle,
  MarkdownEditorState,
  WikiLinksConfig,
} from '../src/index'
import { createShikiHighlighter } from '../src/shiki'
import '../src/theme/theme.css'
import lightThemeUrl from '../src/theme/themes/light.css?url'
import darkThemeUrl from '../src/theme/themes/dark.css?url'
import { markdownParityFixtures } from './fixtures/markdown-parity'
import { richPasteFixtures } from './fixtures/rich-paste'

type ThemeChoice = 'base' | 'light' | 'dark'

const devCodeLanguages = [
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'jsx', 'javascript'],
    load: async () => javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'tsx', 'typescript'],
    load: async () => javascript({ jsx: true, typescript: true }),
  }),
]

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

### Lists

- Build the editor core
- Add live decorations
- Keep advanced widgets out of the default setup with enough extra descriptive text to verify that wrapped list lines align with the list item text instead of jumping back to the left edge
    - Nested list items should also wrap cleanly with their own marker gutter and text column, including enough prose to force wrapping across several visual lines in a narrow editor
        - Deeply nested list items keep increasing the standard list indent while preserving hanging wraps for long content that spans more than one line

### Numbered lists

8. Single-digit markers use the same right-aligned content boundary
9. The final single-digit marker remains aligned
10. Two-digit markers grow left into the hanging-indent area without hiding the period
99. Wider two-digit markers preserve the same text column and wrapped-line alignment across a deliberately longer description
100. Three-digit markers remain complete while list content starts at the same gutter boundary
    100. Nested three-digit markers use the nested hanging-indent area without changing the parent content column

### Task lists

- [ ] Build the editor core
- [/] Add live decorations with a task checkbox and enough extra descriptive text to verify that wrapped task lines align with the task text rather than the checkbox gutter
    - [x] Nested task list items should use the same list gutter model as bullets while preserving clear checkbox alignment and clean wrapping for long task descriptions
        - [ ] Deeply nested task list items keep the checkbox in the marker gutter and wrap the task text under itself across multiple visual lines

### Small table

| Name | Role | Location |
| --- | --- | --- |
| Alice | Engineer | NYC |
| Bob | Designer | LA |

### Wide table

| Name | Role | Location | Project | Notes |
| --- | --- | --- | --- | --- |
| Alice Alexandra Johnson | Senior platform engineer | New York City headquarters | Reusable markdown editor table scrolling validation | This is intentionally long table cell text to force horizontal overflow inside the editor container |
| Bob Benjamin Robertson | Principal product designer | Los Angeles design studio | Interaction polish and editing-state layout review | Another deliberately long value so five columns exceed the available editor width |

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

const COMMAND_API_INITIAL = `# Command API demo

Use the bottom toolbar to drive the editor through the public ref handle.

Select some text, then try **Bold**, *Italic*, Link, Image, Table, or Code.
`

const PERFORMANCE_INITIAL = [
  '# Long-note stability lab',
  '',
  ...Array.from({ length: 24 }, (_, index) => {
    const section = index + 1
    const blocks = [
      `## Section ${section}`,
      '',
      `Paragraph ${section} contains enough ordinary text to exercise wrapping and viewport anchoring while navigating a longer controlled document.`,
    ]
    if (section === 6) blocks.push('', '> [!NOTE]', '> This callout should not disturb nearby cursor positions.')
    if (section === 12) blocks.push('', '| Feature | Status |', '| --- | --- |', '| Cursor mapping | Stable |')
    if (section === 18) blocks.push('', '```ts', 'const preserveViewport = true', '```')
    if (section === 22) blocks.push('', '```mermaid', 'graph LR', '  Source --> Preview', '```')
    return blocks.join('\n')
  }),
].join('\n\n')

const MERMAID_INITIAL = `# Mermaid rich blocks

\`\`\`mermaid
graph TD
  A[Markdown source] --> B{Render safely?}
  B -->|Yes| C[Interactive diagram]
  B -->|Error| D[Editable source fallback]
\`\`\`

## Sequence example

\`\`\`mermaid
sequenceDiagram
  participant H as Host
  participant E as MinuEditor
  H->>E: Portable fenced source
  E-->>H: Lazy rendered diagram
\`\`\`
`

const CALLOUT_INITIAL = `# GitHub-style callouts

> [!NOTE]
> Callouts are portable Markdown content, unlike external review comments.

> [!TIP]
> Use a slash command such as **Tip Callout** to insert one.

> [!IMPORTANT]
> Markdown remains the source of truth.
>
> - Nested lists work.
> - Links and **formatting** remain ordinary Markdown.

> [!WARNING]
> Unknown or malformed markers fall back to blockquotes.

> [!CAUTION]
> Do not use callouts as a replacement for comments or review threads.
`

const OUTLINE_INITIAL = `# Product direction

This demo exposes a host-owned outline built from MinuEditor heading data.

## Everyday authoring

Navigate between sections without inserting hidden block IDs.

### Rich paste

Preserve clean, portable Markdown.

### Heading anchors

Generate deterministic anchors and disambiguate duplicate headings.

## Rich blocks

Keep heavy renderers optional and lazy.

## Rich blocks

Duplicate headings receive a stable numeric suffix.
`

const COMMENT_DOC = `# Commented draft

This section has review notes attached to specific lines.

## Scope

We should explain the tradeoff before merging.

## Risks

The anchor model may drift if the document changes a lot above the comment.

## Follow-up

Add replies, resolve state, and a sidebar thread view later.
`

const WIKI_INITIAL = `# Wikilink manual test

Try:

- [[
- [[proj
- [[note_1|Project Plan]]
- [[note_2|Meeting Notes]]

In title mode, put the cursor in the label/title part after \`|\` and select another suggestion.
`

const WIKI_NOTES = [
  { id: 'note_1', title: 'Project Plan', folder: 'Work' },
  { id: 'note_2', title: 'Meeting Notes', folder: 'Work' },
  { id: 'note_3', title: 'Project Plan', folder: 'Archive' },
  { id: 'note_4', title: 'Daily Journal', folder: 'Personal' },
]

function initialLocalComments(): EditorComment[] {
  const quote = 'We should explain the tradeoff before merging.'
  const from = COMMENT_DOC.indexOf(quote)
  const anchor: EditorComment['anchor'] = {
    anchorType: 'range',
    from,
    to: from + quote.length,
    quote,
    documentVersion: 'local-demo-v1',
  }
  return [
    {
      id: 'comment-1',
      body: 'Can we include one concrete example here?',
      status: 'open',
      anchor,
      author: { id: 'demo-user', type: 'user', name: 'Reviewer' },
    },
    {
      id: 'comment-2',
      body: 'I agree—an example would make the tradeoff easier to review.',
      status: 'open',
      anchor,
      author: { id: 'demo-reviewer', type: 'user', name: 'Second reviewer' },
    },
  ]
}

function CommentsCrudDemo({ codeHighlighter }: { codeHighlighter: CodeHighlighter }) {
  const [value, setValue] = useState(COMMENT_DOC)
  const [comments, setComments] = useState<EditorComment[]>(initialLocalComments)
  const nextCommentId = useRef(3)

  return (
    <section className="surface">
      <h2>Comments API and local CRUD</h2>
      <p className="surface-desc">
        Select text or use a line’s right-side comment icon. Inline anchors, count-free gutter icons,
        multiple comments on the same text, the side panel, CRUD, anchor mapping, and detached states use the same controlled API a host can persist.
      </p>
      <div className="editor-frame">
        <MarkdownEditor
          value={value}
          onChange={setValue}
          minHeight={300}
          codeHighlighter={codeHighlighter}
          codeLanguages={devCodeLanguages}
          comments={{
            items: comments,
            documentVersion: 'local-demo-v1',
            onCreate: ({ body, anchor }) => {
              const comment: EditorComment = {
                id: `comment-${nextCommentId.current++}`,
                body,
                status: 'open',
                anchor,
                author: { id: 'demo-user', type: 'user', name: 'Local reviewer' },
              }
              setComments((current) => [...current, comment])
              return comment
            },
            onUpdate: (id, update) => {
              setComments((current) => current.map((comment) => (
                comment.id === id ? { ...comment, ...update } : comment
              )))
            },
            onDelete: (id) => {
              setComments((current) => current.filter((comment) => comment.id !== id))
            },
            onAnchorChange: (id, anchor) => {
              setComments((current) => current.map((comment) => (
                comment.id === id ? { ...comment, anchor } : comment
              )))
            },
          }}
        />
      </div>
    </section>
  )
}

function CommandApiDemo({ codeHighlighter }: { codeHighlighter: CodeHighlighter }) {
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const [value, setValue] = useState(COMMAND_API_INITIAL)
  const [mode, setMode] = useState<'live' | 'source'>('live')
  const [status, setStatus] = useState('Ready')

  function run(label: string, command: () => boolean | undefined) {
    const handled = command() === true
    setStatus(`${label}: ${handled ? 'handled' : 'not handled'}`)
  }

  return (
    <section className="surface">
      <h2>Command API surface</h2>
      <p className="surface-desc">Bottom app toolbar wired through MarkdownEditorHandle commands.</p>
      <div className="editor-frame command-api-frame">
        <MarkdownEditor
          ref={editorRef}
          value={value}
          onChange={setValue}
          mode={mode}
          placeholder="Try the command API…"
          minHeight={220}
          codeHighlighter={codeHighlighter}
          codeLanguages={devCodeLanguages}
          onImageUpload={async (file) => URL.createObjectURL(file)}
        />
        <div className="command-api-toolbar" aria-label="Command API toolbar">
          <button type="button" onClick={() => setMode((current) => current === 'live' ? 'source' : 'live')}>
            Mode: {mode}
          </button>
          <span className="command-api-separator" />
          <button type="button" onClick={() => run('Undo', () => editorRef.current?.undo())}>Undo</button>
          <button type="button" onClick={() => run('Redo', () => editorRef.current?.redo())}>Redo</button>
          <span className="command-api-separator" />
          <button type="button" onClick={() => run('Bold', () => editorRef.current?.toggleBold())}>Bold</button>
          <button type="button" onClick={() => run('Italic', () => editorRef.current?.toggleItalic())}>Italic</button>
          <button type="button" onClick={() => run('Code', () => editorRef.current?.toggleInlineCode())}>Code</button>
          <button type="button" onClick={() => run('Link', () => editorRef.current?.wrapLink())}>Link</button>
          <span className="command-api-separator" />
          <button type="button" onClick={() => run('Image picker', () => editorRef.current?.openImagePicker())}>Image</button>
          <button type="button" onClick={() => run('Insert image', () => editorRef.current?.insertImage({ src: 'https://placehold.co/640x240', alt: 'Placeholder' }))}>Insert image</button>
          <button type="button" onClick={() => run('Table', () => editorRef.current?.insertTable())}>Table</button>
          <button type="button" onClick={() => run('Code block', () => editorRef.current?.insertCodeBlock())}>Code block</button>
          <span className="command-api-status">{status}</span>
        </div>
      </div>
    </section>
  )
}

function PerformanceStabilityDemo({ theme }: { theme: ThemeChoice }) {
  const ref = useRef<MarkdownEditorHandle>(null)
  const [value, setValue] = useState(PERFORMANCE_INITIAL)
  const [view, setView] = useState<EditorView | null>(null)
  const [state, setState] = useState<MarkdownEditorState | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const mermaid = useMemo(() => ({ theme: theme === 'dark' ? 'dark' as const : 'default' as const }), [theme])

  useEffect(() => {
    if (!view) return
    const scroller = view.scrollDOM
    const updateScroll = () => setScrollTop(Math.round(scroller.scrollTop))
    updateScroll()
    scroller.addEventListener('scroll', updateScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', updateScroll)
  }, [view])

  function goToLine(lineNumber: number) {
    const editor = ref.current?.view
    if (!editor) return
    const line = editor.state.doc.line(Math.min(lineNumber, editor.state.doc.lines))
    ref.current?.setSelection(line.from)
  }

  return (
    <section className="surface">
      <h2>Long-note cursor and widget stability</h2>
      <p className="surface-desc">
        Stress surface for controlled updates, scrolling, and table/code/Mermaid geometry changes.
      </p>
      <div className="parity-demo-controls">
        <button type="button" onClick={() => goToLine(70)}>Go to line 70</button>
        <button type="button" onClick={() => setValue((current) => `Externally inserted above cursor.\n${current}`)}>
          Insert externally at top
        </button>
        <button type="button" onClick={() => setValue(PERFORMANCE_INITIAL)}>Reset note</button>
      </div>
      <div className="performance-lab-status" aria-live="polite">
        <span>Line {state?.activeLine.number ?? '—'}</span>
        <span>Selection {state?.selection.from ?? '—'}–{state?.selection.to ?? '—'}</span>
        <span>Scroll {scrollTop}px</span>
      </div>
      <div className="editor-frame">
        <MarkdownEditor
          ref={ref}
          value={value}
          onChange={setValue}
          onViewReady={setView}
          onStateChange={setState}
          mermaid={mermaid}
          minHeight={480}
          maxHeight={480}
        />
      </div>
    </section>
  )
}

function MermaidDemo({ theme }: { theme: ThemeChoice }) {
  const [value, setValue] = useState(MERMAID_INITIAL)
  const [mode, setMode] = useState<'live' | 'source'>('live')
  const mermaid = useMemo(() => ({ theme: theme === 'dark' ? 'dark' as const : 'default' as const }), [theme])

  return (
    <section className="surface">
      <h2>Mermaid rich-block lifecycle</h2>
      <p className="surface-desc">
        Opt-in, lazy, strict rendering with editable fenced source and static parity.
      </p>
      <div className="parity-demo-controls">
        <button type="button" onClick={() => setMode((current) => current === 'live' ? 'source' : 'live')}>
          Editor mode: {mode}
        </button>
        <button type="button" onClick={() => setValue(MERMAID_INITIAL)}>Reset diagrams</button>
      </div>
      <div className="callout-demo-layout">
        <div>
          <h3 className="demo-column-title">Editor</h3>
          <div className="editor-frame">
            <MarkdownEditor
              value={value}
              onChange={setValue}
              mode={mode}
              mermaid={mermaid}
              minHeight={520}
            />
          </div>
        </div>
        <div>
          <h3 className="demo-column-title">Static renderer</h3>
          <div className="editor-frame parity-renderer-frame">
            <MarkdownRenderer value={value} mermaid={mermaid} />
          </div>
        </div>
      </div>
    </section>
  )
}

function RichPasteDemo() {
  const firstFixture = richPasteFixtures[0]
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const [fixtureId, setFixtureId] = useState(firstFixture.id)
  const [value, setValue] = useState('# Rich paste lab\n\nPlace the cursor here and simulate a fixture, or paste from another app.\n')
  const [enabled, setEnabled] = useState(true)
  const fixture = richPasteFixtures.find(({ id }) => id === fixtureId) ?? firstFixture

  function simulatePaste() {
    const content = editorRef.current?.view?.contentDOM
    if (!content) return
    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      value: {
        items: [],
        getData: (type: string) => type === 'text/html' ? fixture.html : fixture.plain,
      },
    })
    content.dispatchEvent(event)
    // Synthetic paste events do not perform the browser's native fallback.
    if (!event.defaultPrevented) editorRef.current?.replaceSelection(fixture.plain)
  }

  return (
    <section className="surface">
      <h2>Rich paste lab</h2>
      <p className="surface-desc">
        Browser, Google Docs, Notion, spreadsheet, and existing-Markdown conversion fixtures.
      </p>
      <div className="parity-demo-controls">
        <label>
          <span>Clipboard fixture</span>
          <select value={fixture.id} onChange={(event) => setFixtureId(event.target.value)}>
            {richPasteFixtures.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={simulatePaste}>Simulate paste</button>
        <button type="button" onClick={() => setEnabled((current) => !current)}>
          Rich paste: {enabled ? 'on' : 'off'}
        </button>
        <button type="button" onClick={() => setValue('')}>Clear</button>
      </div>
      <p className="parity-demo-description">{fixture.description}</p>
      <div className="editor-frame">
        <MarkdownEditor
          ref={editorRef}
          value={value}
          onChange={setValue}
          richPaste={enabled}
          minHeight={260}
          onImageUpload={async (file) => URL.createObjectURL(file)}
        />
      </div>
      <details>
        <summary>Fixture expectation</summary>
        <pre>{fixture.expected ?? 'Native paste preserves the plain-text Markdown exactly.'}</pre>
      </details>
    </section>
  )
}

function ParityFixturesDemo() {
  const firstFixture = markdownParityFixtures[0]
  const [fixtureId, setFixtureId] = useState(firstFixture.id)
  const [value, setValue] = useState(firstFixture.markdown)
  const [mode, setMode] = useState<'live' | 'source'>('live')
  const fixture = markdownParityFixtures.find(({ id }) => id === fixtureId) ?? firstFixture

  function selectFixture(nextId: string) {
    const next = markdownParityFixtures.find(({ id }) => id === nextId) ?? firstFixture
    setFixtureId(next.id)
    setValue(next.markdown)
  }

  return (
    <section className="surface">
      <h2>Editor/static parity fixtures</h2>
      <p className="surface-desc">
        Canonical regression fixtures for semantic and visual comparison across both rendering paths.
      </p>
      <div className="parity-demo-controls">
        <label>
          <span>Fixture</span>
          <select value={fixture.id} onChange={(event) => selectFixture(event.target.value)}>
            {markdownParityFixtures.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.title}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setMode((current) => current === 'live' ? 'source' : 'live')}>
          Editor mode: {mode}
        </button>
        <button type="button" onClick={() => setValue(fixture.markdown)}>
          Reset fixture
        </button>
      </div>
      <p className="parity-demo-description">{fixture.description}</p>
      <div className="callout-demo-layout">
        <div>
          <h3 className="demo-column-title">Editor</h3>
          <div className="editor-frame">
            <MarkdownEditor
              value={value}
              onChange={setValue}
              mode={mode}
              minHeight={360}
              {...(fixture.annotations ? { annotations: fixture.annotations } : {})}
              wikiLinks={{
                resolve: (target) => ({ status: target === 'Project Alpha' ? 'resolved' : 'unresolved' }),
              }}
            />
          </div>
        </div>
        <div>
          <h3 className="demo-column-title">Static renderer</h3>
          <div className="editor-frame parity-renderer-frame">
            <MarkdownRenderer value={value} />
          </div>
        </div>
      </div>
    </section>
  )
}

function CalloutDemo() {
  const [value, setValue] = useState(CALLOUT_INITIAL)
  const [mode, setMode] = useState<'live' | 'source'>('live')

  return (
    <section className="surface">
      <h2>GitHub-style alerts and callouts</h2>
      <p className="surface-desc">
        Portable blockquote syntax with live/source/static parity. Click into a marker to reveal it.
      </p>
      <button type="button" onClick={() => setMode((current) => current === 'live' ? 'source' : 'live')}>
        Editor mode: {mode}
      </button>
      <div className="callout-demo-layout">
        <div>
          <h3 className="demo-column-title">Editor</h3>
          <div className="editor-frame">
            <MarkdownEditor
              value={value}
              onChange={setValue}
              mode={mode}
              minHeight={420}
            />
          </div>
        </div>
        <div>
          <h3 className="demo-column-title">Static renderer</h3>
          <div className="editor-frame">
            <MarkdownRenderer value={value} />
          </div>
        </div>
      </div>
    </section>
  )
}

function OutlineDemo({ codeHighlighter }: { codeHighlighter: CodeHighlighter }) {
  const editorRef = useRef<MarkdownEditorHandle>(null)
  const [value, setValue] = useState(OUTLINE_INITIAL)
  const [activeSlug, setActiveSlug] = useState<string | null>('product-direction')
  const [copyStatus, setCopyStatus] = useState('')
  const headings = useMemo(() => parseMarkdownHeadings(value), [value])

  function updateActiveHeading(selectionFrom: number) {
    const currentHeadings = editorRef.current?.getHeadings() ?? headings
    const active = currentHeadings.reduce<(typeof currentHeadings)[number] | null>(
      (current, heading) => heading.from <= selectionFrom ? heading : current,
      null,
    )
    setActiveSlug(active?.slug ?? null)
  }

  async function copyAnchor(slug: string) {
    try {
      await navigator.clipboard.writeText(`#${slug}`)
      setCopyStatus(`Copied #${slug}`)
    } catch {
      setCopyStatus(`Anchor: #${slug}`)
    }
  }

  return (
    <section className="surface">
      <h2>Heading outline and anchors</h2>
      <p className="surface-desc">
        Host-owned outline using exported syntax-tree heading ranges and duplicate-aware slugs.
      </p>
      <div className="outline-layout">
        <nav className="outline-panel" aria-label="Document outline">
          <div className="outline-panel__header">Outline</div>
          <div className="outline-panel__items">
            {headings.map((heading) => (
              <div
                className={`outline-item${activeSlug === heading.slug ? ' outline-item--active' : ''}`}
                key={`${heading.from}-${heading.slug}`}
                style={{ paddingLeft: `${10 + (heading.level - 1) * 14}px` }}
              >
                <button
                  type="button"
                  className="outline-item__navigate"
                  onClick={() => editorRef.current?.goToHeading(heading.slug)}
                >
                  {heading.text || 'Untitled section'}
                </button>
                <button
                  type="button"
                  className="outline-item__copy"
                  aria-label={`Copy link to ${heading.text || 'untitled section'}`}
                  title={`Copy #${heading.slug}`}
                  onClick={() => void copyAnchor(heading.slug)}
                >
                  #
                </button>
              </div>
            ))}
          </div>
          <div className="outline-panel__status" aria-live="polite">{copyStatus}</div>
        </nav>
        <div className="editor-frame">
          <MarkdownEditor
            ref={editorRef}
            value={value}
            onChange={setValue}
            onStateChange={(state) => updateActiveHeading(state.selection.from)}
            minHeight={360}
            codeHighlighter={codeHighlighter}
            codeLanguages={devCodeLanguages}
          />
        </div>
      </div>
    </section>
  )
}

export default function App() {
  const [docValue, setDocValue] = useState(DOCUMENT_INITIAL)
  const [descValue, setDescValue] = useState(DESCRIPTION_INITIAL)
  const [commentValue, setCommentValue] = useState(COMMENT_INITIAL)
  const [imageValue, setImageValue] = useState(IMAGE_INITIAL)
  const [wikiValue, setWikiValue] = useState(WIKI_INITIAL)
  const [wikiEvents, setWikiEvents] = useState<string[]>([])
  const [docView, setDocView] = useState<EditorView | null>(null)
  const [docEditing, setDocEditing] = useState(false)
  const [theme, setTheme] = useState<ThemeChoice>('base')
  const codeHighlighter = useMemo(() => createShikiHighlighter(), [])
  const wikiLinksConfig = useMemo<WikiLinksConfig>(() => ({
    labelBehavior: 'title',
    resolve: (target) => {
      const note = WIKI_NOTES.find((candidate) => candidate.id === target || candidate.title === target)
      return note
        ? { status: 'resolved', href: `/notes/${note.id}`, title: note.title }
        : { status: 'unresolved' }
    },
    onSuggestionContext: (context) => {
      setWikiEvents((events) => [
        `context "${context.query}" part=${context.part} explicit=${context.explicit}`,
        ...events.slice(0, 8),
      ])
    },
    suggest: async (query, context) => {
      setWikiEvents((events) => [
        `suggest "${query}" part=${context?.part ?? 'unknown'}`,
        ...events.slice(0, 8),
      ])

      const normalized = query.toLowerCase()
      return WIKI_NOTES
        .filter((note) =>
          note.title.toLowerCase().includes(normalized) ||
          note.id.toLowerCase().includes(normalized),
        )
        .map((note) => ({
          id: note.id,
          target: note.id,
          label: note.title,
          detail: `${note.folder} · ${note.id}`,
        }))
    },
    onOpen: (target) => {
      setWikiEvents((events) => [`open ${target}`, ...events.slice(0, 8)])
    },
    onCreate: async (target) => {
      setWikiEvents((events) => [`create ${target}`, ...events.slice(0, 8)])
    },
  }), [])

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
              codeLanguages={devCodeLanguages}
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

        <CommandApiDemo codeHighlighter={codeHighlighter} />

        <OutlineDemo codeHighlighter={codeHighlighter} />

        <ParityFixturesDemo />

        <RichPasteDemo />

        <MermaidDemo theme={theme} />

        <PerformanceStabilityDemo theme={theme} />

        <CalloutDemo />

        <CommentsCrudDemo codeHighlighter={codeHighlighter} />

        <section className="surface">
          <h2>Wikilink surface</h2>
          <p className="surface-desc">
            ID-backed wikilinks · title-mode completion · raw reveal · Cmd/Ctrl-click open
          </p>
          <div className="editor-frame">
            <MarkdownEditor
              value={wikiValue}
              onChange={setWikiValue}
              placeholder="Try [[project…"
              minHeight={220}
              slashCommands={false}
              wikiLinks={wikiLinksConfig}
            />
          </div>
          <details>
            <summary>Markdown value</summary>
            <pre>{wikiValue}</pre>
          </details>
          <details open>
            <summary>Events</summary>
            <pre>{wikiEvents.join('\n')}</pre>
          </details>
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
