// @dpklabs/minueditor
// Public API — exported from here

import './theme/theme.css'

export { MarkdownEditor } from './MarkdownEditor'
export type { MarkdownEditorHandle } from './MarkdownEditor'
export { EditorToolbar } from './toolbar/Toolbar'
export { FloatingToolbar } from './toolbar/FloatingToolbar'
export { MarkdownRenderer } from './renderer'
export {
  getMarkdownHeadings,
  parseMarkdownHeadings,
  slugifyMarkdownHeading,
} from './headings'
export type { MarkdownHeading, MarkdownHeadingLevel } from './headings'
export { defaultSlashCommands } from './extensions/slash-commands'
export { documentAnnotationExtension } from './extensions/annotations'
export { githubDarkCodeHighlightStyle } from './extensions/codeblock/highlight-style'
export type {
  MarkdownEditorProps,
  MarkdownEditorState,
  MarkdownEditorMode,
  SlashCommand,
  WikiLinkStatus,
  WikiLinkResolution,
  WikiLinkSuggestion,
  WikiLinkCompletionPart,
  WikiLinkLabelBehavior,
  WikiLinkCompletionApply,
  WikiLinkSuggestionContext,
  WikiLinksConfig,
  EditorToolbarProps,
  DocumentAnnotation,
  RichPasteConfig,
  CodeHighlighter,
} from './types'
