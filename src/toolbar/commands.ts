import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { setActiveCodeBlock } from "../extensions/codeblock/state";
import {
  insertTableAt,
  insertTableColumn as insertSharedTableColumn,
  insertTableRow as insertSharedTableRow,
  tableCellTargetAtSelection,
} from '../internal/table-commands';
import { hiddenInlineSuffixTarget, inlineMarkdownSpans } from "../internal/inline-markdown";
import { findTableBlocks } from '../extensions/tables/model';

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

export function enterAfterHiddenInlineSuffix(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const target = hiddenInlineSuffixTarget(view.state, selection.from);
  const line = view.state.doc.lineAt(selection.from);
  if (target === null) {
    if (selection.from !== line.to) return false;

    const tail = view.state.doc.sliceString(selection.from, selection.from + 1);
    if (tail !== "`" && tail !== "*" && tail !== "~") return false;
  }

  const taskMatch = line.text.match(/^(\s*)([-*+])\s+\[[ xX/]\]\s+/);
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

export function deleteMarkdownListMarker(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  const taskMatch = line.text.match(/^(\s*)([-*+])\s+\[[ xX/]\]\s+(.*)$/);
  const unorderedMatch = line.text.match(/^(\s*)([-*+])\s+(.*)$/);
  const orderedMatch = line.text.match(/^(\s*)(\d+)\.\s+(.*)$/);
  const match = taskMatch ?? unorderedMatch ?? orderedMatch;
  if (!match) return false;

  const indent = match[1];
  const markerEnd =
    match === taskMatch
      ? indent.length + match[2].length + 5
      : indent.length + match[2].length + (match === orderedMatch ? 2 : 1);

  if (selection.from !== line.from + markerEnd) return false;

  view.dispatch(
    view.state.update(
      {
        changes: { from: line.from + indent.length, to: line.from + markerEnd, insert: "" },
        selection: EditorSelection.cursor(line.from + indent.length),
      },
      { scrollIntoView: true, userEvent: "delete.backward" },
    ),
  );
  return true;
}

type ListContinuation = {
  indent: string;
  marker: string;
};

function listContinuation(line: string): ListContinuation | null {
  const taskMatch = line.match(/^(\s*)([-*+])\s+\[[ xX/]\]\s*/);
  if (taskMatch) return { indent: taskMatch[1], marker: `${taskMatch[2]} [ ] ` };

  const unorderedMatch = line.match(/^(\s*)([-*+])\s+/);
  if (unorderedMatch) return { indent: unorderedMatch[1], marker: `${unorderedMatch[2]} ` };

  const orderedMatch = line.match(/^(\s*)(\d+)\.\s*/);
  if (orderedMatch) return { indent: orderedMatch[1], marker: `${Number(orderedMatch[2]) + 1}. ` };

  return null;
}

function parentListContinuation(view: EditorView, lineNumber: number, indent: string): string | null {
  const currentIndent = lineIndentWidth(indent);

  for (let number = lineNumber - 1; number >= 1; number--) {
    const parent = listContinuation(view.state.doc.line(number).text);
    if (parent && lineIndentWidth(parent.indent) < currentIndent) {
      return `${parent.indent}${parent.marker}`;
    }
  }

  return null;
}

function exitEmptyListItem(
  view: EditorView,
  line: { from: number; to: number; number: number },
  indent: string,
): boolean {
  // A top-level empty item exits the list. A nested item moves to its parent
  // list level, matching the one-step outdent behavior of block editors.
  const insert = indent.length === 0
    ? ""
    : parentListContinuation(view, line.number, indent) ?? "";

  view.dispatch({
    changes: { from: line.from, to: line.to, insert },
    selection: EditorSelection.cursor(line.from + insert.length),
    scrollIntoView: true,
  });
  return true;
}

export function enterInMarkdownList(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  if (selection.from !== line.to) return false;

  const taskMatch = line.text.match(/^(\s*)([-*+])\s+\[[ xX/]\](?:\s+(.*))?$/);
  const unorderedMatch = line.text.match(/^(\s*)([-*+])(?:\s+(.*))?$/);
  const orderedMatch = line.text.match(/^(\s*)(\d+)\.(?:\s+(.*))?$/);

  if (taskMatch) {
    if ((taskMatch[3] ?? "").length === 0) return exitEmptyListItem(view, line, taskMatch[1]);

    const insert = `\n${taskMatch[1]}${taskMatch[2]} [ ] `;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      scrollIntoView: true,
    });
    return true;
  }

  if (unorderedMatch) {
    if ((unorderedMatch[3] ?? "").length === 0) return exitEmptyListItem(view, line, unorderedMatch[1]);

    const insert = `\n${unorderedMatch[1]}${unorderedMatch[2]} `;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      scrollIntoView: true,
    });
    return true;
  }

  if (orderedMatch) {
    if ((orderedMatch[3] ?? "").length === 0) return exitEmptyListItem(view, line, orderedMatch[1]);

    const insert = `\n${orderedMatch[1]}${Number(orderedMatch[2]) + 1}. `;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      scrollIntoView: true,
    });
    return true;
  }

  return false;
}

function tableColumnCount(line: string): number | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  const inner = trimmed.slice(1, -1);
  const columns = inner.split("|").length;
  return columns > 0 ? columns : null;
}

function isTableDelimiterLine(line: string): boolean {
  return /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
}

function isTableDataLine(line: string): boolean {
  return /^\s*\|(?:[^|\n]*\|)+\s*$/.test(line);
}

function isTableContentLine(line: string): boolean {
  return isTableDataLine(line) && !isTableDelimiterLine(line);
}

function lineIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}

function formatTableContentLine(indent: string, cells: string[]): string {
  const body = cells
    .map((cell) => (cell.length > 0 ? ` ${cell} ` : ""))
    .join("|");
  return `${indent}|${body}|`;
}

type TableCell = {
  leftPipe: number;
  rightPipe: number;
  contentStart: number;
};

function tableCells(line: string): TableCell[] | null {
  const pipes: number[] = [];

  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "|") pipes.push(i);
  }

  if (pipes.length < 2) return null;

  return pipes.slice(0, -1).map((leftPipe, index) => {
    const rightPipe = pipes[index + 1];
    let contentStart = leftPipe + 1;
    while (contentStart < rightPipe && line[contentStart] === " ") {
      contentStart += 1;
    }

    return { leftPipe, rightPipe, contentStart };
  });
}

function preferredCellOffset(cell: TableCell): number {
  if (cell.contentStart < cell.rightPipe) return cell.contentStart;
  if (cell.leftPipe + 1 < cell.rightPipe) return cell.leftPipe + 1;
  return cell.rightPipe;
}

function tableCellIndexAtOffset(cells: TableCell[], offset: number): number {
  for (let i = 0; i < cells.length; i += 1) {
    if (offset <= cells[i].rightPipe) return i;
  }

  return cells.length - 1;
}

function nextTableRowNumber(view: EditorView, lineNumber: number): number | null {
  const { doc } = view.state;
  const nextNumber = lineNumber + 1;
  if (nextNumber > doc.lines) return null;

  const nextLine = doc.line(nextNumber);
  if (isTableDelimiterLine(nextLine.text)) {
    const bodyNumber = nextNumber + 1;
    if (bodyNumber > doc.lines) return null;
    const bodyLine = doc.line(bodyNumber);
    return isTableContentLine(bodyLine.text) ? bodyNumber : null;
  }

  return isTableContentLine(nextLine.text) ? nextNumber : null;
}

function previousTableRowNumber(view: EditorView, lineNumber: number): number | null {
  const { doc } = view.state;
  const prevNumber = lineNumber - 1;
  if (prevNumber < 1) return null;

  const prevLine = doc.line(prevNumber);
  if (isTableDelimiterLine(prevLine.text)) {
    const headerNumber = prevNumber - 1;
    if (headerNumber < 1) return null;
    const headerLine = doc.line(headerNumber);
    return isTableContentLine(headerLine.text) ? headerNumber : null;
  }

  return isTableContentLine(prevLine.text) ? prevNumber : null;
}

function emptyTableRow(columns: number): string {
  return formatTableContentLine("", Array(columns).fill(""));
}

function firstTableCellCursorOffset(line: string): number {
  const cells = tableCells(line);
  if (!cells || cells.length === 0) return 1;
  return preferredCellOffset(cells[0]);
}

export function enterInMarkdownTable(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  if (selection.from !== line.to) return false;

  if (!isTableContentLine(line.text)) return false;

  const nextLine =
    line.number < view.state.doc.lines ? view.state.doc.line(line.number + 1) : null;

  // Header row: let default Enter behavior run so users can break out naturally.
  if (nextLine && isTableDelimiterLine(nextLine.text)) {
    return false;
  }

  const columns = tableColumnCount(line.text);
  if (!columns || columns < 1) return false;

  const rowText = `${lineIndent(line.text)}${emptyTableRow(columns)}`;
  const insert = `\n${rowText}`;
  const cursor = line.to + 1 + firstTableCellCursorOffset(rowText);

  view.dispatch(
    view.state.update(
      {
        changes: { from: line.to, insert },
        selection: EditorSelection.cursor(cursor),
      },
      { scrollIntoView: true, userEvent: "input" },
    ),
  );

  return true;
}

export function tabInMarkdownTable(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  if (!isTableContentLine(line.text)) return false;

  const cells = tableCells(line.text);
  if (!cells || cells.length === 0) return false;

  const offset = Math.max(0, Math.min(selection.from - line.from, line.text.length));
  const cellIndex = tableCellIndexAtOffset(cells, offset);

  if (cellIndex < cells.length - 1) {
    const target = line.from + preferredCellOffset(cells[cellIndex + 1]);
    view.dispatch(
      view.state.update(
        { selection: EditorSelection.cursor(target) },
        { scrollIntoView: true, userEvent: "select" },
      ),
    );
    return true;
  }

  const nextRow = nextTableRowNumber(view, line.number);
  if (nextRow !== null) {
    const nextLine = view.state.doc.line(nextRow);
    const nextCells = tableCells(nextLine.text);
    if (nextCells && nextCells.length > 0) {
      const target = nextLine.from + preferredCellOffset(nextCells[0]);
      view.dispatch(
        view.state.update(
          { selection: EditorSelection.cursor(target) },
          { scrollIntoView: true, userEvent: "select" },
        ),
      );
      return true;
    }
  }

  const afterLineNumber =
    line.number < view.state.doc.lines &&
    isTableDelimiterLine(view.state.doc.line(line.number + 1).text)
      ? line.number + 1
      : line.number;
  const insertAfter = view.state.doc.line(afterLineNumber);
  const rowText = `${lineIndent(line.text)}${emptyTableRow(cells.length)}`;
  const insert = `\n${rowText}`;
  const cursor = insertAfter.to + 1 + firstTableCellCursorOffset(rowText);

  view.dispatch(
    view.state.update(
      {
        changes: { from: insertAfter.to, insert },
        selection: EditorSelection.cursor(cursor),
      },
      { scrollIntoView: true, userEvent: "input" },
    ),
  );

  return true;
}

export function shiftTabInMarkdownTable(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  if (!isTableContentLine(line.text)) return false;

  const cells = tableCells(line.text);
  if (!cells || cells.length === 0) return false;

  const offset = Math.max(0, Math.min(selection.from - line.from, line.text.length));
  const cellIndex = tableCellIndexAtOffset(cells, offset);

  if (cellIndex > 0) {
    const target = line.from + preferredCellOffset(cells[cellIndex - 1]);
    view.dispatch(
      view.state.update(
        { selection: EditorSelection.cursor(target) },
        { scrollIntoView: true, userEvent: "select" },
      ),
    );
    return true;
  }

  const prevRow = previousTableRowNumber(view, line.number);
  if (prevRow === null) return false;

  const prevLine = view.state.doc.line(prevRow);
  const prevCells = tableCells(prevLine.text);
  if (!prevCells || prevCells.length === 0) return false;

  const target = prevLine.from + preferredCellOffset(prevCells[prevCells.length - 1]);
  view.dispatch(
    view.state.update(
      { selection: EditorSelection.cursor(target) },
      { scrollIntoView: true, userEvent: "select" },
    ),
  );

  return true;
}

export function insertTableColumnLeft(view: EditorView): boolean {
  const target = tableCellTargetAtSelection(view);
  return target ? insertSharedTableColumn(view, target, 'left') : false;
}

export function insertTableColumnRight(view: EditorView): boolean {
  const target = tableCellTargetAtSelection(view);
  return target ? insertSharedTableColumn(view, target, 'right') : false;
}

export function insertTableRowAbove(view: EditorView): boolean {
  const target = tableCellTargetAtSelection(view);
  return target ? insertSharedTableRow(view, target, 'above') : false;
}

export function insertTableRowBelow(view: EditorView): boolean {
  const target = tableCellTargetAtSelection(view);
  return target ? insertSharedTableRow(view, target, 'below') : false;
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

export function moveCursorOutOfInlineCode(view: EditorView, direction: "left" | "right"): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  for (const span of inlineMarkdownSpans(line.text, line.from)) {
    if (span.kind !== "code") continue;

    const target =
      direction === "right" && selection.from === span.contentTo
        ? span.to
        : direction === "left" && selection.from === span.contentFrom
          ? span.from
          : null;

    if (target === null) continue;

    view.dispatch(
      view.state.update(
        { selection: EditorSelection.cursor(target) },
        { scrollIntoView: true, userEvent: "select" },
      ),
    );
    return true;
  }

  return false;
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
      // Keep the cursor at the visual end of the editable label, not in the
      // hidden markdown URL suffix. A dedicated link editor can own URL edits.
      selection: { anchor: range.from + 1 + selected.length },
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

function minimalLineChange(line: { from: number; text: string }, next: string): TextChange | null {
  if (line.text === next) return null;

  let start = 0;
  while (start < line.text.length && start < next.length && line.text[start] === next[start]) start += 1;

  let currentEnd = line.text.length;
  let nextEnd = next.length;
  while (
    currentEnd > start &&
    nextEnd > start &&
    line.text[currentEnd - 1] === next[nextEnd - 1]
  ) {
    currentEnd -= 1;
    nextEnd -= 1;
  }

  return { from: line.from + start, to: line.from + currentEnd, insert: next.slice(start, nextEnd) };
}

function toggleLinePrefix(
  view: EditorView,
  makePrefix: (line: string) => string | null,
  isActive: (line: string) => boolean,
): boolean {
  const { state } = view;
  const lineChanges: TextChange[] = [];
  for (const number of selectedListLineNumbers(state, true)) {
    const line = state.doc.line(number);
    const next = isActive(line.text)
      ? line.text.replace(/^(\s*)(?:[-*+]\s+\[[ xX/]\]\s+|[-*+]\s+|\d+\.\s+)/, "$1")
      : (() => {
          const prefix = makePrefix(line.text);
          if (prefix === null) return line.text;
          const indent = line.text.match(/^\s*/)?.[0].length ?? 0;
          return `${line.text.slice(0, indent)}${prefix}${line.text.slice(indent)}`;
        })();
    const change = minimalLineChange(line, next);
    if (change) lineChanges.push(change);
  }

  if (lineChanges.length === 0) return false;
  const changeSet = state.changes(lineChanges);
  const selection = EditorSelection.create(
    state.selection.ranges.map((range) => EditorSelection.range(
      changeSet.mapPos(range.anchor, 1),
      changeSet.mapPos(range.head, 1),
    )),
    state.selection.mainIndex,
  );
  view.dispatch(
    state.update(
      { changes: changeSet, selection },
      { scrollIntoView: true, userEvent: "input" },
    ),
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

function lineIndentWidth(line: string): number {
  let width = 0;

  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
  }

  return width;
}

function renumberOrderedLines(lines: string[], resetAt = new Set<number>()): string[] {
  const counters = new Map<number, number>();

  return lines.map((line, index) => {
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s(.*)$/);
    if (orderedMatch) {
      const indentWidth = lineIndentWidth(orderedMatch[1]);
      // Preserve a list's authored starting number (for example 9), then
      // renumber only its subsequent siblings after structural changes.
      const nextNumber = resetAt.has(index + 1)
        ? 1
        : (counters.get(indentWidth) ?? Number(orderedMatch[2]) - 1) + 1;

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

function selectedListLineNumbers(
  state: EditorView['state'],
  includeEndAtLineStart = false,
): number[] {
  const selected = new Set<number>();
  const ranges = state.selection.ranges ?? [state.selection.main];

  for (const range of ranges) {
    const from = state.doc.lineAt(range.from);
    // A non-empty selection ending at the next line's start owns the previous
    // line, avoiding accidental transformation of an unselected next item.
    const end = !includeEndAtLineStart &&
      !range.empty &&
      range.to > range.from &&
      range.to === state.doc.lineAt(range.to).from
      ? range.to - 1
      : range.to;
    const to = state.doc.lineAt(end);
    for (let number = from.number; number <= to.number; number++) selected.add(number);
  }

  return [...selected].sort((a, b) => a - b);
}

function updateSelectedListLines(
  view: EditorView,
  updater: (line: string) => string | null,
): boolean {
  const { state } = view;
  const selected = selectedListLineNumbers(state);
  if (selected.length === 0 || selected.some((number) => !isListLine(state.doc.line(number).text))) {
    return false;
  }

  const nextLines = Array.from(
    { length: state.doc.lines },
    (_, index) => state.doc.line(index + 1).text,
  );
  const resetOrderedAt = new Set<number>();
  for (const number of selected) {
    const current = nextLines[number - 1];
    const next = updater(current);
    if (next !== null) {
      if (
        /^\s*\d+\.\s/.test(current) &&
        lineIndentWidth(next) > lineIndentWidth(current) &&
        !resetOrderedAt.has(number - 1)
      ) {
        resetOrderedAt.add(number);
      }
      nextLines[number - 1] = next;
    }
  }

  const normalizedLines = renumberOrderedLines(nextLines, resetOrderedAt);
  const changes: TextChange[] = [];
  for (let number = 1; number <= state.doc.lines; number++) {
    const change = minimalLineChange(state.doc.line(number), normalizedLines[number - 1]);
    if (change) changes.push(change);
  }

  if (changes.length === 0) return false;
  // Let CodeMirror map every range through the one authoritative ChangeSet.
  view.dispatch(
    state.update({ changes }, { scrollIntoView: true, userEvent: "input" }),
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

  const block = selectedText
    ? `\`\`\`\n${selectedText}\n\`\`\``
    : "```\n\n```";
  const insert = `\n\n${block}\n\n`;

  const blockFrom = range.from + 2;
  const contentFrom = blockFrom + 4;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    effects: setActiveCodeBlock.of(blockFrom),
    // Place cursor on the blank line inside the fence
    selection: {
      anchor: contentFrom + (selectedText ? selectedText.length + 1 : 0),
    },
    scrollIntoView: true,
  });

  return true;
}

export function insertTable(view: EditorView): boolean {
  const selection = view.state.selection.main;
  const activeTable = findTableBlocks(view.state).find(
    (block) => selection.from >= block.from && selection.from <= block.to,
  );
  const insertionFrom = activeTable?.to ?? view.state.doc.lineAt(selection.from).to;
  return insertTableAt(view, { from: insertionFrom, prefix: '\n\n', suffix: '\n\n' });
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
