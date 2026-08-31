import type { HighlightStyle, LanguageDescription } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import type { MinuWidgetContext } from './internal/editor-context'

export interface MarkdownEditorState {
  value: string
  isDirty: boolean
  isFocused: boolean
  isEmpty: boolean
  canUndo: boolean
  canRedo: boolean
  readOnly: boolean
  selection: {
    from: number
    to: number
    empty: boolean
  }
  activeLine: {
    number: number
    from: number
    to: number
    text: string
  }
  activeMarks: {
    bold: boolean
    italic: boolean
    code: boolean
    link: boolean
    headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null
    list: 'bullet' | 'ordered' | 'task' | null
    quote: boolean
  }
}

export interface SlashCommand {
  label: string
  detail?: string
  keywords?: readonly string[]
  run: (view: EditorView) => boolean
}

export type WikiLinkStatus = 'resolved' | 'unresolved' | 'unknown'

export type WikiLinkResolution = {
  status: WikiLinkStatus
  href?: string
  title?: string
}

export type WikiLinkSuggestion = {
  id: string
  target: string
  label?: string
  detail?: string
}

export type WikiLinkCompletionPart = 'target' | 'label'
export type WikiLinkLabelBehavior = 'alias' | 'title'
export type WikiLinkCompletionApply = 'replace-target' | 'replace-full-link'

export type WikiLinkSuggestionContext = {
  /** Current completion text/query inside `[[...]]`, excluding wikilink syntax. */
  query: string
  /** Source range currently driving completion. */
  from: number
  to: number
  /** Whether the user is completing from the link target or display label. */
  part: WikiLinkCompletionPart
  /** Whether CodeMirror requested completions explicitly. */
  explicit: boolean
  /** Existing closed wikilink when editing one; absent for a new `[[query`. */
  link?: {
    from: number
    to: number
    target: string
    label?: string
  }
  /** Aborts when CodeMirror invalidates the current async completion query. */
  signal?: AbortSignal
}

export type WikiLinkPasteContext = {
  selectedText: string
  mode: MarkdownEditorMode
}

export type WikiLinkPasteResolution = {
  target: string
}

export type WikiLinkPasteResolver = (
  sourceUrl: string,
  context: WikiLinkPasteContext,
) => WikiLinkPasteResolution | null

export type WikiLinksConfig = {
  enabled?: boolean
  /** Opens decorated inactive wikilinks on plain mouse down. Defaults to false so hosts can opt in. */
  openOnClick?: boolean
  /** Opens wikilinks on Cmd/Ctrl-click. Defaults to true. */
  openOnModifierClick?: boolean
  resolve?: (target: string) => WikiLinkResolution | Promise<WikiLinkResolution>
  /** Recognizes an exact pasted HTTP(S) URL and returns a canonical wikilink target. */
  resolvePastedUrl?: WikiLinkPasteResolver
  /**
   * Controls default completion behavior for the text after `|`.
   * - `alias` preserves Obsidian-like custom aliases. Defaults to target-only completion.
   * - `title` treats the label as a note title snapshot. Defaults to completing from target or label and replacing the full wikilink.
   */
  labelBehavior?: WikiLinkLabelBehavior
  /** Source regions that can open note suggestions. Defaults from `labelBehavior`. */
  completeFrom?: readonly WikiLinkCompletionPart[]
  /** How accepting a suggestion rewrites markdown. Defaults from `labelBehavior`. */
  completionApply?: WikiLinkCompletionApply
  suggest?: (query: string, context?: WikiLinkSuggestionContext) => Promise<WikiLinkSuggestion[]>
  /** Fires whenever the editor asks for wikilink suggestions, so hosts can refresh/re-query candidate data. */
  onSuggestionContext?: (context: WikiLinkSuggestionContext) => void
  onOpen?: (target: string, context: { event: MouseEvent | KeyboardEvent }) => void
  onCreate?: (target: string) => void | Promise<void>
}

export type MermaidRenderResult = {
  svg: string
  bindFunctions?: ((element: Element) => void) | undefined
}

export type MermaidEngine = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => Promise<MermaidRenderResult>
}

export type MermaidConfig = {
  /** Enables Mermaid rendering. Defaults to true when a config object is supplied. */
  enabled?: boolean
  /** Enables inline view controls and an expanded direct-interaction modal. Defaults to true. */
  interactive?: boolean
  /** Mermaid visual theme. Security remains fixed to strict mode. */
  theme?: 'default' | 'dark' | 'neutral' | 'forest' | 'base'
  /** Optional lazy engine loader, primarily for host control and deterministic tests. */
  load?: () => Promise<MermaidEngine>
}

export type RichPasteConfig = {
  /** Enables rich paste conversion. Defaults to true. */
  enabled?: boolean
  /** Converts safe clipboard HTML into portable Markdown. Defaults to true. */
  html?: boolean
  /** Converts tab-delimited clipboard text into a Markdown table. Defaults to true. */
  tabular?: boolean
}

export type CodeHighlighter = (code: string, lang: string) => string | Promise<string | null> | null

export interface DocumentAnnotation {
  id: string
  documentId: string
  kind: string
  anchorType: 'line' | 'range'
  startLine?: number
  endLine?: number
  from?: number
  to?: number
  label?: string
  actorType?: string
  actorId?: string
  status?: string
  className?: string
}

export type EditorCommentStatus = 'open' | 'resolved'

export interface EditorCommentAnchor {
  anchorType: 'range' | 'line'
  from: number
  to: number
  quote: string
  prefix?: string
  suffix?: string
  documentVersion?: string
  detached?: boolean
}

export interface EditorCommentAuthor {
  id: string
  type: 'user' | 'agent'
  name?: string
}

export interface EditorComment {
  id: string
  body: string
  status: EditorCommentStatus
  anchor: EditorCommentAnchor
  author?: EditorCommentAuthor
  createdAt?: string
  updatedAt?: string
}

export interface EditorCommentCreateInput {
  body: string
  anchor: EditorCommentAnchor
}

export interface EditorCommentUpdateInput {
  body?: string
  status?: EditorCommentStatus
}

export interface EditorCommentsConfig {
  items: readonly EditorComment[]
  documentVersion?: string
  /** Shows MinuEditor's simple side panel. Defaults to true; disable when the host renders its own panel. */
  showPanel?: boolean
  /** Receives a selected anchor so a host can open its own popover or composer. */
  onRequest?: (anchor: EditorCommentAnchor) => void
  onCreate?: (input: EditorCommentCreateInput) => void | EditorComment | Promise<void | EditorComment>
  onUpdate?: (id: string, update: EditorCommentUpdateInput) => void | Promise<void>
  onDelete?: (id: string) => void | Promise<void>
  onAnchorChange?: (id: string, anchor: EditorCommentAnchor) => void
  onSelect?: (comment: EditorComment | null) => void
  /** Called from a gutter icon with every comment anchored on that source line. */
  onSelectGroup?: (comments: readonly EditorComment[]) => void
  /** Formats created/updated timestamps in the built-in panel. */
  formatTimestamp?: (timestamp: string, comment: EditorComment) => string
}

export type ResourceKind = 'image' | 'link'

export interface ResourceUrlContext {
  kind: ResourceKind
}

export type ResourceUrlResolver = (
  source: string,
  context: ResourceUrlContext,
) => string

export type MarkdownEditorMode = 'live' | 'source'

export interface MarkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  baselineValue?: string
  slashCommands?: boolean | readonly SlashCommand[]
  wikiLinks?: boolean | WikiLinksConfig
  annotations?: readonly DocumentAnnotation[]
  onAnnotationClick?: (annotation: DocumentAnnotation, view: EditorView) => void
  /** Controlled host-owned comments with editor rendering and CRUD callbacks. */
  comments?: EditorCommentsConfig
  placeholder?: string
  readOnly?: boolean
  /** Visual editing mode. `live` hides inactive markdown syntax and renders widgets; `source` shows raw markdown. Defaults to `live`. */
  mode?: MarkdownEditorMode
  /** Resolves parsed canonical Markdown image/link destinations for runtime display and navigation only. */
  resourceUrlResolver?: ResourceUrlResolver
  floatingToolbar?: boolean
  autoFocus?: boolean
  /** Enables browser/OS spellcheck for the editable document body. Defaults to true. */
  spellCheck?: boolean
  /** Controls browser/OS autocorrect for the editable document body. Defaults to 'on'. */
  autoCorrect?: 'on' | 'off'
  /** Controls browser autocomplete for the editable document body. Defaults to 'on'. */
  autoComplete?: string
  /** Controls browser/OS autocapitalization for the editable document body. Defaults to 'sentences'. */
  autoCapitalize?: string
  minHeight?: number
  maxHeight?: number
  onSubmit?: () => void
  /** Rich HTML and tabular paste conversion. Enabled by default; pass false to use native plain-text paste only. */
  richPaste?: boolean | RichPasteConfig
  /** Opt-in Mermaid fenced-block rendering. Disabled by default to keep rich blocks host-controlled. */
  mermaid?: boolean | MermaidConfig
  onImageUpload?: (file: File) => Promise<string>
  /** Optional host-provided image picker. When present, image commands call this instead of the built-in picker. */
  onRequestImage?: (context: MinuWidgetContext) => void
  /** Optional CodeMirror language loaders for fenced-code editing. Defaults to none. */
  codeLanguages?: readonly LanguageDescription[]
  /** Optional syntax highlighter for rendered fenced code. Defaults to plain escaped code. */
  codeHighlighter?: CodeHighlighter
  /** Optional CodeMirror highlight style for active fenced-code editing. Defaults to a GitHub Dark-aligned palette. */
  codeHighlightStyle?: HighlightStyle
  onStateChange?: (state: MarkdownEditorState) => void
  /** Called with the EditorView instance after CM6 mounts (or re-mounts). */
  onViewReady?: (view: EditorView) => void
  className?: string
}

export interface EditorToolbarProps {
  view: EditorView | null
  variant: 'full' | 'floating'
}
