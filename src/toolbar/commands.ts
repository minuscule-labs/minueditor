import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps or unwraps the current selection with a marker string.
 * If the selection is already wrapped, the markers are removed.
 * Works on each selection range independently.
 */
function inlineMarkerPattern(marker: string): RegExp {
  switch (marker) {
    case "**":
      return /\*\*([^*]+)\*\*/g;
    case "*":
      return /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g;
    case "~~":
      return /~~([^~]+)~~/g;
    case "`":
      return /`([^`]+)`/g;
    default:
      return new RegExp("");
  }
}

type InlineEndRule = {
  regexp: RegExp;
  boundaryOffset: (matchStart: number, match: RegExpMatchArray) => number;
  endOffset: (matchStart: number, match: RegExpMatchArray) => number;
};

const inlineEndRules: InlineEndRule[] = [
  {
    regexp: /\*\*([^*]+)\*\*/g,
    boundaryOffset: (start, match) => start + match[0].length - 2,
    endOffset: (start, match) => start + match[0].length,
  },
  {
    regexp: /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g,
    boundaryOffset: (start, match) => start + match[0].length - 1,
    endOffset: (start, match) => start + match[0].length,
  },
  {
    regexp: /~~([^~]+)~~/g,
    boundaryOffset: (start, match) => start + match[0].length - 2,
    endOffset: (start, match) => start + match[0].length,
  },
  {
    regexp: /(`+)([^`]+)\1/g,
    boundaryOffset: (start, match) => {
      const ticks = match[1]?.length ?? 1;
      return start + match[0].length - ticks;
    },
    endOffset: (start, match) => start + match[0].length,
  },
  {
    regexp: /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    boundaryOffset: (start, match) => start + 1 + (match[1]?.length ?? 0),
    endOffset: (start, match) => start + match[0].length,
  },
];

function cursorAfterHiddenInlineSuffix(view: EditorView, cursor: number): number | null {
  const line = view.state.doc.lineAt(cursor);
  const offset = cursor - line.from;

  for (const rule of inlineEndRules) {
    const regexp = new RegExp(rule.regexp.source, rule.regexp.flags);
    for (const match of line.text.matchAll(regexp)) {
      const matchStart = match.index;
      if (matchStart === undefined) continue;

      const end = rule.endOffset(matchStart, match);
      if (end !== line.text.length) continue;

      const boundary = rule.boundaryOffset(matchStart, match);
      if (offset < boundary || offset >= end) continue;

      return line.from + end;
    }
  }

  return null;
}

export function enterAfterHiddenInlineSuffix(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const target = cursorAfterHiddenInlineSuffix(view, selection.from);
  const line = view.state.doc.lineAt(selection.from);
  if (target === null) {
    if (selection.from !== line.to) return false;

    const tail = view.state.doc.sliceString(selection.from, selection.from + 1);
    if (tail !== "`" && tail !== "*" && tail !== "~") return false;
  }

  const taskMatch = line.text.match(/^(\s*)([-*+])\s+\[[ xX]\]\s+/);
  const unorderedMatch = line.text.match(/^(\s*)([-*+])\s+/);
  const orderedMatch = line.text.match(/^(\s*)(\d+)\.\s+/);

  let insert = "\n";
  if (taskMatch) {
    insert = `\n${taskMatch[1]}${taskMatch[2]} [ ] `;
  } else if (unorderedMatch) {
    insert = `\n${unorderedMatch[1]}${unorderedMatch[2]} `;
  } else if (orderedMatch) {
    insert = `\n${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `;
  }

  view.dispatch(
    view.state.update(
      {
        changes: { from: line.to, insert },
        selection: EditorSelection.cursor(line.to + insert.length),
      },
      { scrollIntoView: true, userEvent: "input" },
    ),
  );

  return true;
}

function findInlineMarkerExit(
  view: EditorView,
  cursor: number,
  marker: string,
): number | null {
  const line = view.state.doc.lineAt(cursor);
  const offset = cursor - line.from;
  const pattern = inlineMarkerPattern(marker);

  for (const match of line.text.matchAll(pattern)) {
    const matchStart = match.index;
    if (matchStart === undefined) continue;

    const openEnd = matchStart + marker.length;
    const closeStart = matchStart + match[0].length - marker.length;
    if (offset < openEnd || offset > closeStart) continue;

    return line.from + matchStart + match[0].length;
  }

  return null;
}

function isJustAfterInlineMarker(
  view: EditorView,
  cursor: number,
  marker: string,
): boolean {
  const line = view.state.doc.lineAt(cursor);
  const offset = cursor - line.from;
  const pattern = inlineMarkerPattern(marker);

  for (const match of line.text.matchAll(pattern)) {
    const matchStart = match.index;
    if (matchStart === undefined) continue;

    if (offset === matchStart + match[0].length) {
      return true;
    }
  }

  return false;
}

function toggleInlineMarker(view: EditorView, marker: string): boolean {
  const { state } = view;
  const mLen = marker.length;

  const changes = state.changeByRange((range) => {
    const selected = state.doc.sliceString(range.from, range.to);

    // --------------------------------------------------
    // 1. If text is selected
    // --------------------------------------------------
    if (!range.empty) {
      // Already wrapped -> unwrap
      if (
        selected.startsWith(marker) &&
        selected.endsWith(marker) &&
        selected.length >= mLen * 2
      ) {
        const inner = selected.slice(mLen, selected.length - mLen);

        return {
          changes: {
            from: range.from,
            to: range.to,
            insert: inner,
          },
          range: EditorSelection.range(range.from, range.from + inner.length),
        };
      }

      // Wrap selection
      return {
        changes: {
          from: range.from,
          to: range.to,
          insert: `${marker}${selected}${marker}`,
        },
        range: EditorSelection.range(range.from + mLen, range.to + mLen),
      };
    }

    // --------------------------------------------------
    // 2. No selection:
    // If cursor is inside markers -> remove markers
    // Example: **hel|lo**
    // --------------------------------------------------
    const from = range.from;

    const before = state.doc.sliceString(from - mLen, from);
    const after = state.doc.sliceString(from, from + mLen);

    if (from >= mLen && before === marker && after === marker) {
      return {
        changes: [
          { from, to: from + mLen, insert: "" }, // remove right marker
          { from: from - mLen, to: from, insert: "" }, // remove left marker
        ],
        range: EditorSelection.cursor(from - mLen),
      };
    }

    const exitPos = findInlineMarkerExit(view, from, marker);
    if (exitPos !== null) {
      return {
        changes: [],
        range: EditorSelection.cursor(exitPos),
      };
    }

    if (isJustAfterInlineMarker(view, from, marker)) {
      return {
        changes: [],
        range: EditorSelection.cursor(from),
      };
    }

    // --------------------------------------------------
    // 3. Otherwise insert markers and place cursor inside
    // Example: test | -> test **|**
    // --------------------------------------------------
    return {
      changes: {
        from,
        insert: `${marker}${marker}`,
      },
      range: EditorSelection.cursor(from + mLen),
    };
  });

  view.dispatch(
    state.update(changes, {
      scrollIntoView: true,
      userEvent: "input",
    }),
  );

  return true;
}

// ── Inline formatting ─────────────────────────────────────────────────────────

export function toggleBold(view: EditorView): boolean {
  return toggleInlineMarker(view, "**");
}

export function toggleItalic(view: EditorView): boolean {
  return toggleInlineMarker(view, "*");
}

export function toggleStrikethrough(view: EditorView): boolean {
  return toggleInlineMarker(view, "~~");
}

export function toggleInlineCode(view: EditorView): boolean {
  return toggleInlineMarker(view, "`");
}

// ── Link ──────────────────────────────────────────────────────────────────────

/**
 * Wraps selected text as a markdown link: `[text](url)`.
 * If nothing is selected, inserts `[](url)` with cursor in the text slot.
 * If the selection is already `[text](url)`, it's left as-is (no toggle).
 */
export function wrapLink(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to);

  if (selected) {
    const insert = `[${selected}]()`;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert },
      // Place cursor inside the `()` so user can type the URL
      selection: { anchor: range.from + insert.length - 1 },
    });
  } else {
    const insert = "[]()";
    view.dispatch({
      changes: { from: range.from, insert },
      // Place cursor at the start (inside `[]`)
      selection: { anchor: range.from + 1 },
    });
  }

  return true;
}

// ── Headings ──────────────────────────────────────────────────────────────────

/**
 * Toggles a heading prefix for the current line.
 * If the line already has this heading level, removes the prefix.
 * If the line has a different heading level, replaces it.
 */
export function setHeading(
  view: EditorView,
  level: 1 | 2 | 3 | 4 | 5 | 6,
): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);
  const prefix = "#".repeat(level) + " ";

  const existingMatch = line.text.match(/^(#{1,6})\s/);
  let insert: string;
  let removeLength: number;

  if (existingMatch) {
    if (existingMatch[1].length === level) {
      // Same level — remove the heading
      insert = line.text.slice(existingMatch[0].length);
      removeLength = line.text.length;
    } else {
      // Different level — replace
      insert = prefix + line.text.slice(existingMatch[0].length);
      removeLength = line.text.length;
    }
  } else {
    // Not a heading — add prefix
    insert = prefix + line.text;
    removeLength = line.text.length;
  }

  view.dispatch({
    changes: { from: line.from, to: line.from + removeLength, insert },
    scrollIntoView: true,
  });

  return true;
}

// ── Lists ─────────────────────────────────────────────────────────────────────

function toggleLinePrefix(
  view: EditorView,
  makePrefix: (line: string) => string | null,
  isActive: (line: string) => boolean,
): boolean {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    const lineChanges: { from: number; to: number; insert: string }[] = [];

    for (let ln = fromLine.number; ln <= toLine.number; ln++) {
      const line = state.doc.line(ln);
      if (isActive(line.text)) {
        // Remove prefix
        const stripped = line.text.replace(/^(\s*)([-*+]|\d+\.)\s/, "$1");
        lineChanges.push({ from: line.from, to: line.to, insert: stripped });
      } else {
        const prefix = makePrefix(line.text);
        if (prefix !== null) {
          lineChanges.push({ from: line.from, to: line.from, insert: prefix });
        }
      }
    }

    return {
      changes: lineChanges,
      range,
    };
  });

  view.dispatch(
    state.update(changes, { scrollIntoView: true, userEvent: "input" }),
  );
  return true;
}

export function toggleUnorderedList(view: EditorView): boolean {
  return toggleLinePrefix(
    view,
    () => "- ",
    (line) => /^\s*[-*+]\s/.test(line),
  );
}

export function toggleOrderedList(view: EditorView): boolean {
  let counter = 1;
  return toggleLinePrefix(
    view,
    () => `${counter++}. `,
    (line) => /^\s*\d+\.\s/.test(line),
  );
}

export function toggleCheckboxList(view: EditorView): boolean {
  return toggleLinePrefix(
    view,
    () => "- [ ] ",
    (line) => /^\s*[-*+]\s+\[[ x]\]\s/.test(line),
  );
}

function isListLine(line: string): boolean {
  return /^\s*(?:[-*+]\s|\d+\.\s|[-*+]\s+\[[ x]\]\s)/.test(line);
}

const LIST_INDENT = "    ";

type TextChange = { from: number; to?: number; insert: string };

function mapPositionThroughChanges(position: number, changes: TextChange[]): number {
  let mapped = position;

  for (const change of changes) {
    const from = change.from;
    const to = change.to ?? change.from;
    const deleted = to - from;
    const inserted = change.insert.length;

    if (mapped < from) continue;
    if (mapped <= to) {
      mapped = from + inserted;
      continue;
    }

    mapped += inserted - deleted;
  }

  return mapped;
}

function adjustedSelection(
  range: { anchor: number; head: number },
  changes: TextChange[],
) {
  return EditorSelection.range(
    mapPositionThroughChanges(range.anchor, changes),
    mapPositionThroughChanges(range.head, changes),
  );
}

function lineIndentWidth(line: string): number {
  let width = 0;

  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
  }

  return width;
}

function renumberOrderedLines(lines: string[]): string[] {
  const counters = new Map<number, number>();

  return lines.map((line) => {
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (orderedMatch) {
      const indentWidth = lineIndentWidth(orderedMatch[1]);
      const nextNumber = (counters.get(indentWidth) ?? 0) + 1;

      counters.set(indentWidth, nextNumber);
      for (const key of [...counters.keys()]) {
        if (key > indentWidth) counters.delete(key);
      }

      return `${orderedMatch[1]}${nextNumber}. ${orderedMatch[3]}`;
    }

    const indentWidth = lineIndentWidth(line);
    for (const key of [...counters.keys()]) {
      if (key >= indentWidth) counters.delete(key);
    }

    return line;
  });
}

function updateSelectedListLines(
  view: EditorView,
  updater: (line: string) => string | null,
): boolean {
  const { state } = view;
  const docLines = Array.from(
    { length: state.doc.lines },
    (_, index) => state.doc.line(index + 1).text,
  );
  const changes = state.changeByRange((range) => {
    const fromLine = state.doc.lineAt(range.from);
    const toLine = state.doc.lineAt(range.to);
    const lineChanges: { from: number; to: number; insert: string }[] = [];
    const nextLines = [...docLines];
    let selectionChanges: TextChange[] = [];

    for (let ln = fromLine.number; ln <= toLine.number; ln++) {
      const line = state.doc.line(ln);
      if (!isListLine(line.text)) {
        return { changes: [], range };
      }
    }

    for (let ln = fromLine.number; ln <= toLine.number; ln++) {
      const line = state.doc.line(ln);
      const next = updater(line.text);
      if (next !== null && next !== line.text) {
        nextLines[ln - 1] = next;
      }
    }

    const normalizedLines = renumberOrderedLines(nextLines);
    for (let ln = fromLine.number; ln <= toLine.number; ln++) {
      const line = state.doc.line(ln);
      const normalized = normalizedLines[ln - 1];
      if (normalized !== line.text) {
        lineChanges.push({ from: line.from, to: line.to, insert: normalized });
      }
    }

    selectionChanges = [...lineChanges].sort((a, b) => a.from - b.from);

    return {
      changes: lineChanges,
      range: adjustedSelection(range, selectionChanges),
    };
  });

  if (Array.isArray(changes.changes) && changes.changes.length === 0) {
    return false;
  }

  view.dispatch(
    state.update(changes, { scrollIntoView: true, userEvent: "input" }),
  );
  return true;
}

export function indentList(view: EditorView): boolean {
  return updateSelectedListLines(view, (line) => `${LIST_INDENT}${line}`);
}

export function outdentList(view: EditorView): boolean {
  return updateSelectedListLines(view, (line) => {
    if (line.startsWith("    ")) return line.slice(4);
    if (line.startsWith("  ")) return line.slice(2);
    return line;
  });
}

// ── Block elements ────────────────────────────────────────────────────────────

export function insertCodeBlock(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selectedText = state.doc.sliceString(range.from, range.to);

  const insert = selectedText
    ? `\`\`\`\n${selectedText}\n\`\`\``
    : "```\n\n```";

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    // Place cursor on the blank line inside the fence
    selection: {
      anchor: range.from + 4 + (selectedText ? selectedText.length + 1 : 0),
    },
    scrollIntoView: true,
  });

  return true;
}

export function insertTable(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);

  const table = "| Column 1 | Column 2 |\n|---|---|\n| Cell | Cell |\n";
  const insertAt = line.to;

  view.dispatch({
    changes: { from: insertAt, insert: `\n${table}` },
    selection: { anchor: insertAt + 3 }, // cursor at start of first cell
    scrollIntoView: true,
  });

  return true;
}

export function insertHR(view: EditorView): boolean {
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);

  view.dispatch({
    changes: { from: line.to, insert: "\n\n---\n" },
    selection: { anchor: line.to + 6 },
    scrollIntoView: true,
  });

  return true;
}

export function insertImage(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  const selected = state.doc.sliceString(range.from, range.to);

  const insert = selected ? `![${selected}]()` : "![]()";
  const cursorPos = range.from + insert.length - 1; // inside `()`

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: cursorPos },
    scrollIntoView: true,
  });

  return true;
}
