import { EditorView } from '@codemirror/view'

/**
 * CM6 theme built entirely from CSS custom properties.
 * Consumers override vars on the .minueditor wrapper class.
 * Light/dark mode is handled by the consumer's design system.
 */
export const minueditorTheme = EditorView.theme({
  '&': {
    color: 'var(--me-text, #1a1a1a)',
    backgroundColor: 'var(--me-bg, transparent)',
    fontFamily: 'var(--me-font-family, inherit)',
    fontSize: 'var(--me-font-size, 15px)',
    lineHeight: 'var(--me-line-height, 1.6)',
  },

  '&.cm-focused': {
    outline: 'none',
  },

  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: 'inherit',
  },

  '.cm-content': {
    padding: 'var(--me-content-padding, 12px 16px)',
    caretColor: 'var(--me-cursor, #1a1a1a)',
    tabSize: '4',
  },

  '.cm-line': {
    paddingTop: '0.08em',
    paddingBottom: '0.08em',
  },

  '.me-list-line': {
    paddingLeft: 'var(--me-list-indent-base, 0px)',
  },

  '.me-list-line--indent-0': {
    paddingLeft: '0px',
  },

  '.me-list-line--indent-1': {
    paddingLeft: '0.5rem',
  },

  '.me-list-line--indent-2': {
    paddingLeft: '1rem',
  },

  '.me-list-line--indent-3': {
    paddingLeft: '1.5rem',
  },

  '.me-list-line--indent-4': {
    paddingLeft: '2rem',
  },

  '.me-list-line--indent-5': {
    paddingLeft: '2.5rem',
  },

  '.me-list-line--indent-6': {
    paddingLeft: '3rem',
  },

  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--me-cursor, #1a1a1a)',
    borderLeftWidth: '2px',
  },

  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--me-selection-bg, #b3d4ff55)',
  },

  '.cm-activeLine': {
    backgroundColor: 'var(--me-active-line-bg, transparent)',
  },

  '.cm-placeholder': {
    color: 'var(--me-placeholder, #aaa)',
    fontStyle: 'italic',
  },

  // ── Markdown element styles ──────────────────────────────────────────

  '.me-h1': {
    fontSize: 'var(--me-h1-size, 2em)',
    fontWeight: 'var(--me-heading-weight, 700)',
    lineHeight: '1.25',
    color: 'var(--me-heading-color, inherit)',
  },
  '.me-h2': {
    fontSize: 'var(--me-h2-size, 1.5em)',
    fontWeight: 'var(--me-heading-weight, 700)',
    lineHeight: '1.3',
    color: 'var(--me-heading-color, inherit)',
  },
  '.me-h3': {
    fontSize: 'var(--me-h3-size, 1.25em)',
    fontWeight: 'var(--me-heading-weight, 600)',
    color: 'var(--me-heading-color, inherit)',
  },
  '.me-h4': {
    fontSize: 'var(--me-h4-size, 1.1em)',
    fontWeight: 'var(--me-heading-weight, 600)',
    color: 'var(--me-heading-color, inherit)',
  },
  '.me-h5': {
    fontSize: 'var(--me-h5-size, 1em)',
    fontWeight: 'var(--me-heading-weight, 600)',
    color: 'var(--me-heading-color, inherit)',
  },
  '.me-h6': {
    fontSize: 'var(--me-h6-size, 0.9em)',
    fontWeight: 'var(--me-heading-weight, 600)',
    color: 'var(--me-heading-color, inherit)',
  },

  '.me-bold': {
    fontWeight: '700',
  },
  '.me-italic': {
    fontStyle: 'italic',
  },
  '.me-strikethrough': {
    textDecoration: 'line-through',
  },
  '.me-inline-code': {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    fontSize: '0.875em',
    backgroundColor: 'var(--me-code-bg, rgba(0,0,0,0.06))',
    color: 'var(--me-code-color, #c7254e)',
    padding: '0.1em 0.3em',
    borderRadius: '3px',
  },

  '.me-link': {
    color: 'var(--me-link-color, #2563eb)',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },

  '.me-blockquote': {
    borderLeft: '3px solid var(--me-blockquote-border, #ccc)',
    paddingLeft: '1em',
    color: 'var(--me-blockquote-color, #666)',
    marginLeft: '0',
  },

  '.me-hr': {
    borderTop: '2px solid var(--me-hr-color, #e0e0e0)',
    display: 'block',
    margin: '0.5em 0',
  },

  // ── Syntax token visibility (decorations.ts hides/shows these) ──────

  '.me-syntax': {
    color: 'var(--me-syntax-color, #bbb)',
    fontSize: '0.85em',
  },

  // ── Code block ───────────────────────────────────────────────────────

  '.me-codeblock': {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    fontSize: 'var(--me-code-font-size, 0.875em)',
    backgroundColor: 'var(--me-codeblock-bg, #f6f8fa)',
    borderRadius: '6px',
    padding: '12px 16px',
    display: 'block',
    overflowX: 'auto',
  },

  '.me-codeblock-wrapper': {
    position: 'relative',
    margin: '0.75em 0',
  },

  // ── List markers ─────────────────────────────────────────────────────

  '.me-list-marker': {
    color: 'var(--me-list-marker-color, var(--me-text, #1a1a1a))',
    userSelect: 'none',
  },

  '.me-unordered-list-marker': {
    color: 'transparent',
    display: 'inline-block',
    userSelect: 'none',
    fontSize: '0',
    lineHeight: '1',
    verticalAlign: 'baseline',
  },

  '.me-unordered-list-marker::before': {
    content: '"• "',
    color: 'var(--me-list-marker-color, var(--me-text, #1a1a1a))',
    fontSize: 'var(--me-font-size, 15px)',
    lineHeight: '1',
    letterSpacing: 'normal',
  },

  '.me-ordered-list-marker': {
    display: 'inline-block',
    minWidth: '2.25ch',
    textAlign: 'right',
    paddingRight: '0.55ch',
    color: 'var(--me-list-marker-color, var(--me-text, #1a1a1a))',
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
  },

  // Obsidian-style token hiding: keep text in flow so cursor math stays stable.
  '.me-token': {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    color: 'transparent',
  },

  '.me-token--inline': {
    fontSize: '1px',
    letterSpacing: '-1ch',
  },

  '.me-token--block': {
    fontSize: '1px',
    letterSpacing: '-1ch',
  },

  '.me-hr-text': {
    color: 'transparent',
    textDecoration: 'line-through solid var(--me-hr-color, #e0e0e0)',
    textDecorationThickness: '2px',
  },

  // ── Checkbox widget ───────────────────────────────────────────────────

  '.me-checkbox': {
    cursor: 'pointer',
    verticalAlign: 'middle',
    margin: '0 4px 0 0',
    width: '14px',
    height: '14px',
    accentColor: 'var(--me-checkbox-color, #2563eb)',
  },

  // ── Code block widgets ────────────────────────────────────────────────

  '.me-lang-label': {
    fontSize: '11px',
    color: 'var(--me-syntax-color, #bbb)',
    marginRight: '6px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    userSelect: 'none',
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
  },

  '.me-copy-btn': {
    padding: '2px 8px',
    fontSize: '11px',
    background: 'var(--me-btn-bg, rgba(0,0,0,0.06))',
    border: '1px solid var(--me-btn-border, rgba(0,0,0,0.12))',
    borderRadius: '4px',
    cursor: 'pointer',
    color: 'var(--me-btn-color, #555)',
    lineHeight: '18px',
    marginLeft: '8px',
    fontFamily: 'inherit',
  },

  '.me-copy-btn--copied': {
    color: 'var(--me-success-color, #16a34a)',
    borderColor: 'var(--me-success-color, #16a34a)',
  },

  // ── Image widget ──────────────────────────────────────────────────────

  '.me-image-wrapper': {
    display: 'inline-block',
    maxWidth: '100%',
    verticalAlign: 'top',
  },

  '.me-image': {
    maxWidth: '100%',
    borderRadius: '4px',
    display: 'block',
  },

  '.me-image-uploading': {
    display: 'inline-block',
    padding: '4px 8px',
    background: 'var(--me-code-bg, rgba(0,0,0,0.06))',
    borderRadius: '4px',
    fontSize: '0.875em',
    color: 'var(--me-placeholder, #aaa)',
    fontStyle: 'italic',
  },

  '.me-image-broken': {
    display: 'inline-block',
    padding: '4px 8px',
    background: '#fff0f0',
    borderRadius: '4px',
    fontSize: '0.875em',
    color: '#c33',
  },
})
