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
    fontFamily: 'var(--me-command-font-family, var(--me-font-family, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif))',
    fontSize: "var(--me-font-size, 15px)",
    lineHeight: "var(--me-line-height, 1.6)",
  },

  "&.cm-focused": {
    outline: "none",
  },

  ".cm-scroller": {
    fontFamily: "inherit",
    lineHeight: "inherit",
    overflowX: "hidden",
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

  // ── Slash command menu ────────────────────────────────────────────────

  "& .cm-tooltip.cm-tooltip-autocomplete": {
    border: "1px solid var(--me-command-border, rgba(55,53,47,0.09))",
    borderRadius: "10px",
    backgroundColor: "var(--me-command-bg, #fff)",
    boxShadow: "var(--me-command-shadow, 0 12px 28px rgba(15,15,15,0.10), 0 2px 8px rgba(15,15,15,0.06))",
    padding: "4px",
    overflow: "hidden",
    minWidth: "240px",
    maxWidth: "340px",
    fontFamily: "var(--me-font-family, inherit)",
    color: "var(--me-command-color, var(--me-text, #1a1a1a))",
  },

  "& .cm-tooltip-autocomplete > ul": {
    fontFamily: "inherit",
    maxHeight: "min(320px, 42vh)",
    padding: "0",
  },

  "& .cm-tooltip-autocomplete ul li": {
    display: "flex",
    alignItems: "center",
    minHeight: "32px",
    padding: "5px 8px",
    borderRadius: "6px",
    fontSize: "14px",
    lineHeight: "1.3",
    color: "inherit",
    cursor: "default",
  },

  "& .cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--me-command-selected-bg, rgba(55,53,47,0.08))",
    color: "var(--me-command-selected-color, var(--me-command-color, var(--me-text, #1a1a1a)))",
  },

  "& .cm-tooltip-autocomplete ul li:hover": {
    backgroundColor: "var(--me-command-hover-bg, rgba(55,53,47,0.06))",
  },

  "& .cm-tooltip-autocomplete .cm-completionLabel": {
    flex: "1 1 auto",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontWeight: "450",
    fontFamily: "inherit",
  },

  "& .cm-tooltip-autocomplete .cm-completionMatchedText": {
    color: "var(--me-command-match-color, inherit)",
    textDecoration: "none",
    fontWeight: "650",
  },

  "& .cm-tooltip-autocomplete .cm-completionIcon": {
    display: "none",
  },

  "& .cm-tooltip-autocomplete .cm-completionDetail": {
    marginLeft: "10px",
    color: "var(--me-command-detail-color, var(--me-command-muted-color, var(--me-placeholder, #777)))",
    fontSize: "12px",
    fontFamily: "inherit",
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

  ".me-annotation": {
    cursor: "pointer",
  },

  ".me-annotation--kind-comment": {
    backgroundColor: "var(--me-comment-bg, rgba(245, 158, 11, 0.10))",
  },

  ".me-annotation--kind-generated": {
    backgroundColor: "var(--me-generated-bg, rgba(59, 130, 246, 0.10))",
  },

  ".me-annotation--kind-added": {
    backgroundColor: "var(--me-added-bg, rgba(34, 197, 94, 0.10))",
  },

  ".me-annotation--kind-updated": {
    backgroundColor: "var(--me-updated-bg, rgba(59, 130, 246, 0.10))",
  },

  ".me-annotation--kind-deleted": {
    backgroundColor: "var(--me-deleted-bg, rgba(239, 68, 68, 0.10))",
    textDecoration: "line-through",
  },

  ".me-annotation--status-resolved": {
    opacity: "0.55",
  },

  ".me-annotation--actor-agent": {
    boxShadow: "inset 3px 0 0 var(--me-annotation-agent-accent, rgba(59, 130, 246, 0.55))",
  },

  ".me-annotation--actor-user": {
    boxShadow: "inset 3px 0 0 var(--me-annotation-user-accent, rgba(34, 197, 94, 0.55))",
  },

  ".me-annotation--actor-system": {
    boxShadow: "inset 3px 0 0 var(--me-annotation-system-accent, rgba(107, 114, 128, 0.55))",
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
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
    minWidth: "0",
    contain: "inline-size",
    overflowX: "auto",
    overflowY: "hidden",
    overscrollBehaviorX: "contain",
    margin: "0.75em 0",
  },

  ".me-table-widget--editing": {
    borderRadius: "8px",
  },

  ".me-table-scroller": {
    display: "block",
    boxSizing: "border-box",
    width: "100%",
    maxWidth: "100%",
    minWidth: "0",
    contain: "inline-size",
    overflowX: "auto",
    overflowY: "hidden",
    overscrollBehaviorX: "contain",
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

  ".me-table-input-sizer": {
    display: "inline-grid",
    width: "max-content",
    minWidth: "5ch",
    verticalAlign: "top",
  },

  ".me-table-input-sizer::after, .me-table-input-sizer .me-table-input": {
    gridArea: "1 / 1",
    font: "inherit",
    lineHeight: "inherit",
    padding: "0.6rem 0.65rem",
    boxSizing: "border-box",
    minWidth: "5ch",
  },

  ".me-table-input-sizer::after": {
    content: "attr(data-value)",
    visibility: "hidden",
    whiteSpace: "pre",
  },

  ".me-table-input": {
    appearance: "none",
    width: "100%",
    minWidth: "0",
    display: "block",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "inherit",
    boxShadow: "none",
  },

  ".me-hr-text": {
    color: "transparent",
    fontSize: "1px",
    letterSpacing: "-1ch",
    textDecoration: "none",
    userSelect: "none",
  },

  ".cm-line.me-hr-line": {
    position: "relative",
  },

  ".cm-line.me-hr-line::after": {
    content: '""',
    position: "absolute",
    left: "0",
    right: "0",
    top: "50%",
    borderTop: "2px solid var(--me-hr-color, #e0e0e0)",
    transform: "translateY(-50%)",
    pointerEvents: "none",
  },

  // ── Checkbox widget ───────────────────────────────────────────────────

  ".me-checkbox": {
    cursor: "pointer",
    verticalAlign: "-0.08em",
    margin: "0 0.38em 0 0",
    width: "1.15em",
    height: "1.15em",
    padding: "0",
    border: "2px solid #000",
    borderRadius: "0",
    background: "transparent",
    position: "relative",
    boxSizing: "border-box",
  },

  ".me-checkbox--partial": {
    background: "linear-gradient(135deg, #000 0 50%, transparent 50% 100%)",
  },

  ".me-checkbox--checked": {
    background: "#000",
  },

  ".me-checkbox--checked::after": {
    content: '""',
    position: "absolute",
    left: "50%",
    top: "50%",
    width: "0.28em",
    height: "0.56em",
    border: "solid white",
    borderWidth: "0 2px 2px 0",
    transform: "translate(-42%, -58%) rotate(45deg)",
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
    background: "var(--me-image-broken-bg, #fff0f0)",
    borderRadius: "4px",
    fontSize: "0.875em",
    color: "var(--me-image-broken-color, #c33)",
  },

  ".me-image-picker": {
    border: "1px solid var(--me-image-picker-border, var(--me-command-border, rgba(55,53,47,0.14)))",
    borderRadius: "12px",
    background: "var(--me-image-picker-bg, var(--me-command-bg, #fff))",
    boxShadow: "var(--me-image-picker-shadow, var(--me-command-shadow, 0 12px 28px rgba(15,15,15,0.10), 0 2px 8px rgba(15,15,15,0.06)))",
    color: "var(--me-image-picker-color, var(--me-text, #1a1a1a))",
    margin: "0.5rem 0",
    overflow: "hidden",
    maxWidth: "680px",
  },

  ".me-image-picker__title": {
    padding: "14px 18px",
    fontWeight: "600",
    borderBottom: "1px solid var(--me-image-picker-border, var(--me-command-border, rgba(55,53,47,0.10)))",
  },

  ".me-image-picker__tabs": {
    display: "flex",
    gap: "2px",
    padding: "0 16px",
    borderBottom: "1px solid var(--me-image-picker-border, var(--me-command-border, rgba(55,53,47,0.10)))",
  },

  ".me-image-picker__tab": {
    appearance: "none",
    border: "none",
    borderBottom: "2px solid transparent",
    background: "transparent",
    color: "var(--me-image-picker-muted, var(--me-placeholder, #777))",
    cursor: "pointer",
    font: "inherit",
    fontWeight: "600",
    padding: "10px 12px 8px",
  },

  ".me-image-picker__tab--active": {
    borderBottomColor: "var(--me-image-picker-accent, var(--me-accent, #2f80ed))",
    color: "var(--me-image-picker-color, var(--me-text, #1a1a1a))",
  },

  ".me-image-picker__panel": {
    padding: "16px",
  },

  ".me-image-picker__upload, .me-image-picker__submit": {
    width: "100%",
    border: "1px solid var(--me-image-picker-border, rgba(55,53,47,0.14))",
    borderRadius: "8px",
    background: "var(--me-image-picker-button-bg, transparent)",
    color: "inherit",
    cursor: "pointer",
    font: "inherit",
    fontWeight: "600",
    padding: "10px 12px",
  },

  ".me-image-picker__submit": {
    background: "var(--me-image-picker-accent, var(--me-accent, #2f80ed))",
    borderColor: "var(--me-image-picker-accent, var(--me-accent, #2f80ed))",
    color: "var(--me-image-picker-accent-text, #fff)",
    marginTop: "12px",
  },

  ".me-image-picker__upload:disabled": {
    cursor: "not-allowed",
    opacity: "0.55",
  },

  ".me-image-picker__input": {
    boxSizing: "border-box",
    width: "100%",
    border: "1px solid var(--me-image-picker-border, rgba(55,53,47,0.18))",
    borderRadius: "8px",
    background: "var(--me-image-picker-input-bg, transparent)",
    color: "inherit",
    font: "inherit",
    outline: "none",
    padding: "10px 12px",
  },

  ".me-image-picker__input:focus": {
    borderColor: "var(--me-image-picker-accent, var(--me-accent, #2f80ed))",
    boxShadow: "0 0 0 2px color-mix(in srgb, var(--me-image-picker-accent, var(--me-accent, #2f80ed)) 22%, transparent)",
  },

  ".me-image-picker__hint": {
    color: "var(--me-image-picker-muted, var(--me-placeholder, #777))",
    fontSize: "0.875em",
    marginTop: "10px",
    textAlign: "center",
  },
});
