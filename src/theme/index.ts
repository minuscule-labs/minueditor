import { EditorView } from "@codemirror/view";

/**
 * CM6 theme built entirely from CSS custom properties.
 * Consumers override vars on the .minueditor wrapper class.
 * Light/dark mode is handled by the consumer's design system.
 */
export const minueditorTheme = EditorView.theme({
  "&": {
    color: "var(--me-text, #1a1a1a)",
    backgroundColor: "var(--me-bg, transparent)",
    fontFamily: "var(--me-font-family, inherit)",
    fontSize: "var(--me-font-size, 15px)",
    lineHeight: "var(--me-line-height, 1.6)",
  },

  "&.cm-focused": {
    outline: "none",
  },

  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflowX: "auto",
  },

  ".cm-content": {
    padding: "var(--me-content-padding, 12px 16px)",
    caretColor: "var(--me-cursor, #1a1a1a)",
    tabSize: "4",
  },

  ".cm-line": {
    paddingTop: "0.08em",
    paddingBottom: "0.08em",
  },

  ".me-list-line": {
    paddingLeft: "var(--me-list-indent-base, 0px)",
  },

  ".me-list-line--indent-0": {
    paddingLeft: "0px",
  },

  ".me-list-line--indent-1": {
    paddingLeft: "0.5rem",
  },

  ".me-list-line--indent-2": {
    paddingLeft: "1rem",
  },

  ".me-list-line--indent-3": {
    paddingLeft: "1.5rem",
  },

  ".me-list-line--indent-4": {
    paddingLeft: "2rem",
  },

  ".me-list-line--indent-5": {
    paddingLeft: "2.5rem",
  },

  ".me-list-line--indent-6": {
    paddingLeft: "3rem",
  },

  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--me-cursor, #1a1a1a)",
    borderLeftWidth: "2px",
  },

  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--me-selection-bg, #b3d4ff55)",
  },

  ".cm-activeLine": {
    backgroundColor: "var(--me-active-line-bg, transparent)",
  },

  ".cm-placeholder": {
    color: "var(--me-placeholder, #aaa)",
    fontStyle: "italic",
  },

  // ── Markdown element styles ──────────────────────────────────────────

  ".me-h1": {
    fontSize: "var(--me-h1-size, 2em)",
    fontWeight: "var(--me-heading-weight, 700)",
    lineHeight: "1.25",
    color: "var(--me-heading-color, inherit)",
  },
  ".me-h2": {
    fontSize: "var(--me-h2-size, 1.5em)",
    fontWeight: "var(--me-heading-weight, 700)",
    lineHeight: "1.3",
    color: "var(--me-heading-color, inherit)",
  },
  ".me-h3": {
    fontSize: "var(--me-h3-size, 1.25em)",
    fontWeight: "var(--me-heading-weight, 600)",
    color: "var(--me-heading-color, inherit)",
  },
  ".me-h4": {
    fontSize: "var(--me-h4-size, 1.1em)",
    fontWeight: "var(--me-heading-weight, 600)",
    color: "var(--me-heading-color, inherit)",
  },
  ".me-h5": {
    fontSize: "var(--me-h5-size, 1em)",
    fontWeight: "var(--me-heading-weight, 600)",
    color: "var(--me-heading-color, inherit)",
  },
  ".me-h6": {
    fontSize: "var(--me-h6-size, 0.9em)",
    fontWeight: "var(--me-heading-weight, 600)",
    color: "var(--me-heading-color, inherit)",
  },

  ".me-bold": {
    fontWeight: "700",
  },
  ".me-italic": {
    fontStyle: "italic",
  },
  ".me-strikethrough": {
    textDecoration: "line-through",
  },
  ".me-inline-code": {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    fontSize: "0.875em",
    backgroundColor: "var(--me-code-bg, rgba(0,0,0,0.06))",
    color: "var(--me-code-color, #c7254e)",
    padding: "0.1em 0.3em",
    borderRadius: "3px",
  },

  ".me-link": {
    color: "var(--me-link-color, #2563eb)",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
  },

  ".me-blockquote": {
    borderLeft: "3px solid var(--me-blockquote-border, #ccc)",
    paddingLeft: "1em",
    color: "var(--me-blockquote-color, #666)",
    marginLeft: "0",
  },

  ".me-hr": {
    borderTop: "2px solid var(--me-hr-color, #e0e0e0)",
    display: "block",
    margin: "0.5em 0",
  },

  // ── Syntax token visibility (decorations.ts hides/shows these) ──────

  ".me-syntax": {
    color: "var(--me-syntax-color, #bbb)",
    fontSize: "0.85em",
  },

  // ── Code block ───────────────────────────────────────────────────────

  ".me-codeblock": {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    fontSize: "var(--me-code-font-size, 0.875em)",
    backgroundColor: "var(--me-codeblock-bg, #f6f8fa)",
    borderRadius: "6px",
    padding: "12px 16px",
    display: "block",
    overflowX: "auto",
  },

  ".me-codeblock-widget": {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    fontSize: "var(--me-code-font-size, 0.875em)",
    backgroundColor: "var(--me-codeblock-bg, #f6f8fa)",
    border: "1px solid var(--me-codeblock-border, #e1e4e8)",
    borderRadius: "8px",
    margin: "0.75em 0",
    overflow: "hidden",
    boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  },

  ".me-codeblock-header": {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderBottom: "1px solid var(--me-codeblock-border, #e1e4e8)",
    backgroundColor: "var(--me-codeblock-header-bg, #f3f4f6)",
    userSelect: "none",
  },

  ".me-codeblock-body": {
    padding: "16px",
    overflowX: "auto",
    backgroundColor: "var(--me-codeblock-body-bg, #f6f8fa)",
  },

  ".me-codeblock-widget--editing .me-codeblock-header": {
    display: "none",
  },

  ".me-codeblock-widget--editing": {
    boxShadow: "none",
  },

  ".me-codeblock-fence": {
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
    fontFamily: "inherit",
    opacity: "0.75",
    padding: "0 0 8px 0",
    whiteSpace: "pre",
  },

  ".me-codeblock-fence-ticks": {
    flex: "0 0 auto",
  },

  ".me-codeblock-lang-input": {
    flex: "0 1 12ch",
    minWidth: "6ch",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    padding: "0",
    margin: "0",
  },

  ".me-codeblock-lang-input::placeholder": {
    color: "inherit",
    opacity: "0.55",
  },

  ".me-codeblock-fence--close": {
    padding: "8px 0 0 0",
  },

  ".me-codeblock-editor-host": {
    minHeight: "0",
  },

  ".me-codeblock-editor-host .cm-editor": {
    background: "transparent",
    border: "none",
    outline: "none",
  },

  ".me-codeblock-editor-host .cm-scroller": {
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "1.6",
    background: "transparent",
    overflowY: "hidden",
    minHeight: "0",
    height: "auto",
  },

  ".me-codeblock-editor-host .cm-content": {
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "1.6",
    padding: "0",
    minHeight: "0",
  },

  ".me-codeblock-editor-host .cm-focused": {
    outline: "none",
  },

  ".me-codeblock-body pre": {
    margin: "0",
    padding: "0",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "1.6",
    background: "transparent",
  },

  ".me-codeblock-body pre code": {
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    background: "transparent",
  },

  ".me-codeblock-hidden": {
    height: "0",
    minHeight: "0",
    lineHeight: "0",
    overflow: "hidden",
    paddingTop: "0",
    paddingBottom: "0",
  },

  // ── List markers ─────────────────────────────────────────────────────

  ".me-list-marker": {
    color: "var(--me-list-marker-color, var(--me-text, #1a1a1a))",
    userSelect: "none",
  },

  ".me-unordered-list-marker": {
    color: "transparent",
    display: "inline-block",
    userSelect: "none",
    fontSize: "0",
    lineHeight: "1",
    verticalAlign: "baseline",
  },

  ".me-unordered-list-marker::before": {
    content: '"• "',
    color: "var(--me-list-marker-color, var(--me-text, #1a1a1a))",
    fontSize: "var(--me-font-size, 15px)",
    lineHeight: "1",
    letterSpacing: "normal",
  },

  ".me-ordered-list-marker": {
    display: "inline-block",
    minWidth: "2.25ch",
    textAlign: "right",
    paddingRight: "0.55ch",
    color: "var(--me-list-marker-color, var(--me-text, #1a1a1a))",
    fontVariantNumeric: "tabular-nums",
    userSelect: "none",
  },

  // Obsidian-style token hiding: keep text in flow so cursor math stays stable.
  ".me-token": {
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
    color: "transparent",
  },

  ".me-token--inline": {
    fontSize: "1px",
    letterSpacing: "-1ch",
  },

  ".me-token--block": {
    fontSize: "1px",
    letterSpacing: "-1ch",
  },

  ".me-table-widget": {
    margin: "0.75em 0",
  },

  ".me-table-widget--editing": {
    borderRadius: "8px",
  },

  ".me-table-scroller": {
    overflowX: "auto",
    overflowY: "hidden",
    maxWidth: "100%",
  },

  ".me-table-render": {
    borderCollapse: "collapse",
    width: "max-content",
    tableLayout: "auto",
    backgroundColor: "var(--me-table-bg, transparent)",
  },

  ".me-table-render th, .me-table-render td": {
    border: "1px solid var(--me-table-border, #d1d5db)",
    padding: "0.6rem 0.65rem",
    verticalAlign: "top",
    whiteSpace: "nowrap",
    textAlign: "left",
    minWidth: "5ch",
  },

  ".me-table-widget--editing .me-table-render th, .me-table-widget--editing .me-table-render td": {
    padding: "0",
  },

  ".me-table-render .me-table-cell--selected": {
    backgroundColor: "var(--me-table-selection-bg, rgba(37,99,235,0.14))",
  },

  ".me-table-render th.me-table-cell--selected-header": {
    backgroundColor: "var(--me-table-selection-header-bg, rgba(37,99,235,0.2))",
  },

  ".me-table-cell--selected .me-table-input": {
    backgroundColor: "transparent",
    padding: "0.6rem 0.65rem",
    minWidth: "5ch",
    width: "auto",
    boxShadow: "none",
  },

  ".me-table-render th": {
    fontWeight: "600",
    backgroundColor: "var(--me-table-header-bg, rgba(0,0,0,0.03))",
  },

  '.me-table-render th[data-align="center"], .me-table-render td[data-align="center"]': {
    textAlign: "center",
  },

  '.me-table-render th[data-align="right"], .me-table-render td[data-align="right"]': {
    textAlign: "right",
  },

  ".me-table-input": {
    appearance: "none",
    width: "100%",
    display: "block",
    minWidth: "5ch",
    maxWidth: "100%",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    font: "inherit",
    lineHeight: "inherit",
    padding: "0.6rem 0.65rem",
    boxSizing: "border-box",
    boxShadow: "none",
  },

  ".me-hr-text": {
    color: "transparent",
    textDecoration: "line-through solid var(--me-hr-color, #e0e0e0)",
    textDecorationThickness: "2px",
  },

  // ── Checkbox widget ───────────────────────────────────────────────────

  ".me-checkbox": {
    cursor: "pointer",
    verticalAlign: "middle",
    margin: "0 4px 0 0",
    width: "14px",
    height: "14px",
    accentColor: "var(--me-checkbox-color, #2563eb)",
  },

  // ── Code block widgets ────────────────────────────────────────────────

  ".me-lang-label": {
    fontSize: "11px",
    color: "var(--me-syntax-color, #bbb)",
    marginRight: "6px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    userSelect: "none",
    fontFamily: 'var(--me-font-code, "SF Mono", "Fira Code", monospace)',
  },

  ".me-copy-btn": {
    padding: "2px 8px",
    fontSize: "11px",
    background: "var(--me-btn-bg, rgba(0,0,0,0.06))",
    border: "1px solid var(--me-btn-border, rgba(0,0,0,0.12))",
    borderRadius: "4px",
    cursor: "pointer",
    color: "var(--me-btn-color, #555)",
    lineHeight: "18px",
    marginLeft: "8px",
    fontFamily: "inherit",
  },

  ".me-copy-btn--copied": {
    color: "var(--me-success-color, #16a34a)",
    borderColor: "var(--me-success-color, #16a34a)",
  },

  // ── Image widget ──────────────────────────────────────────────────────

  ".me-image-wrapper": {
    display: "inline-block",
    maxWidth: "100%",
    verticalAlign: "top",
  },

  ".me-image": {
    maxWidth: "100%",
    borderRadius: "4px",
    display: "block",
  },

  ".me-image-uploading": {
    display: "inline-block",
    padding: "4px 8px",
    background: "var(--me-code-bg, rgba(0,0,0,0.06))",
    borderRadius: "4px",
    fontSize: "0.875em",
    color: "var(--me-placeholder, #aaa)",
    fontStyle: "italic",
  },

  ".me-image-broken": {
    display: "inline-block",
    padding: "4px 8px",
    background: "#fff0f0",
    borderRadius: "4px",
    fontSize: "0.875em",
    color: "#c33",
  },
});
