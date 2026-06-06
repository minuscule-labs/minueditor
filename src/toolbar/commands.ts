import type { EditorView } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { setActiveCodeBlock } from "../extensions/codeblock/state";
import { createEmptyTableMarkdown } from "../extensions/tables/model";
import { setActiveTable } from "../extensions/tables/state";

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

export function enterInMarkdownList(view: EditorView): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const line = view.state.doc.lineAt(selection.from);
  if (selection.from !== line.to) return false;

  const taskMatch = line.text.match(/^(\s*)([-*+])\s+\[[ xX/]\]\s+(.*)$/);
  const unorderedMatch = line.text.match(/^(\s*)([-*+])\s+(.*)$/);
  const orderedMatch = line.text.match(/^(\s*)(\d+)\.\s+(.*)$/);

  if (taskMatch) {
    if (taskMatch[3].length === 0) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: taskMatch[1] },
        selection: EditorSelection.cursor(line.from + taskMatch[1].length),
        scrollIntoView: true,
      });
      return true;
    }

    const insert = `\n${taskMatch[1]}${taskMatch[2]} [ ] `;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      scrollIntoView: true,
    });
    return true;
  }

  if (unorderedMatch) {
    if (unorderedMatch[3].length === 0) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: unorderedMatch[1] },
        selection: EditorSelection.cursor(line.from + unorderedMatch[1].length),
        scrollIntoView: true,
      });
      return true;
    }

    const insert = `\n${unorderedMatch[1]}${unorderedMatch[2]} `;
    view.dispatch({
      changes: { from: line.to, insert },
      selection: EditorSelection.cursor(line.to + insert.length),
      scrollIntoView: true,
    });
    return true;
  }

  if (orderedMatch) {
    if (orderedMatch[3].length === 0) {
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: orderedMatch[1] },
        selection: EditorSelection.cursor(line.from + orderedMatch[1].length),
        scrollIntoView: true,
      });
      return true;
    }

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

type TableRegion = {
  headerLine: number;
  delimiterLine: number;
  bodyStartLine: number;
  bodyEndLine: number;
};

function tableRegionAtLine(view: EditorView, lineNumber: number): TableRegion | null {
  const { doc } = view.state;
  const line = doc.line(lineNumber);

  let headerLine: number | null = null;

  if (isTableContentLine(line.text)) {
    if (lineNumber < doc.lines && isTableDelimiterLine(doc.line(lineNumber + 1).text)) {
      headerLine = lineNumber;
    } else {
      let scan = lineNumber - 1;
      while (scan >= 1 && isTableContentLine(doc.line(scan).text)) {
        scan -= 1;
      }
      if (
        scan >= 2 &&
        isTableDelimiterLine(doc.line(scan).text) &&
        isTableContentLine(doc.line(scan - 1).text)
      ) {
        headerLine = scan - 1;
      }
    }
  } else if (isTableDelimiterLine(line.text)) {
    if (lineNumber >= 2 && isTableContentLine(doc.line(lineNumber - 1).text)) {
      headerLine = lineNumber - 1;
    }
  }

  if (headerLine === null) return null;

  const delimiterLine = headerLine + 1;
  if (delimiterLine > doc.lines || !isTableDelimiterLine(doc.line(delimiterLine).text)) {
    return null;
  }

  let bodyEndLine = delimiterLine;
  let scan = delimiterLine + 1;
  while (scan <= doc.lines && isTableContentLine(doc.line(scan).text)) {
    bodyEndLine = scan;
    scan += 1;
  }

  return {
    headerLine,
    delimiterLine,
    bodyStartLine: delimiterLine + 1,
    bodyEndLine,
  };
}

function lineIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : "";
}

function tableContentCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;

  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function tableDelimiterCells(line: string): string[] | null {
  if (!isTableDelimiterLine(line)) return null;

  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => {
      const marker = cell.trim();
      return marker.length > 0 ? marker : "---";
    });
}

function formatTableContentLine(indent: string, cells: string[]): string {
  const body = cells
    .map((cell) => (cell.length > 0 ? ` ${cell} ` : ""))
    .join("|");
  return `${indent}|${body}|`;
}

function formatTableDelimiterLine(indent: string, cells: string[]): string {
  return `${indent}| ${cells.join(" | ")} |`;
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

function tableRowFromLine(line: string): string | null {
  const columns = tableColumnCount(line);
  if (!columns) return null;
  return `${lineIndent(line)}${emptyTableRow(columns)}`;
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

function insertTableColumn(view: EditorView, side: "left" | "right"): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const currentLine = view.state.doc.lineAt(selection.from);
  const region = tableRegionAtLine(view, currentLine.number);
  if (!region) return false;

  const cells = tableCells(currentLine.text);
  if (!cells || cells.length === 0) return false;

  const offset = Math.max(0, Math.min(selection.from - currentLine.from, currentLine.text.length));
  const cellIndex = tableCellIndexAtOffset(cells, offset);
  const insertIndex = side === "left" ? cellIndex : cellIndex + 1;

  const lineChanges: TextChange[] = [];

  for (let lineNumber = region.headerLine; lineNumber <= region.bodyEndLine; lineNumber += 1) {
    const line = view.state.doc.line(lineNumber);
    const indent = lineIndent(line.text);

    if (lineNumber === region.delimiterLine) {
      const delimiterCells = tableDelimiterCells(line.text);
      if (!delimiterCells) return false;

      delimiterCells.splice(insertIndex, 0, "---");
      lineChanges.push({
        from: line.from,
        to: line.to,
        insert: formatTableDelimiterLine(indent, delimiterCells),
      });
      continue;
    }

    const contentCells = tableContentCells(line.text);
    if (!contentCells) return false;

    contentCells.splice(insertIndex, 0, "");
    lineChanges.push({
      from: line.from,
      to: line.to,
      insert: formatTableContentLine(indent, contentCells),
    });
  }

  const currentLineChange = lineChanges.find((change) => change.from === currentLine.from);
  if (!currentLineChange) return false;

  const nextCells = tableCells(currentLineChange.insert);
  if (!nextCells || !nextCells[insertIndex]) return false;

  const targetOffset = preferredCellOffset(nextCells[insertIndex]);
  const target =
    currentLine.from +
    lineChanges
      .filter((change) => change.from < currentLine.from)
      .reduce((delta, change) => {
        const to = change.to ?? change.from;
        return delta + change.insert.length - (to - change.from);
      }, 0) +
    targetOffset;

  view.dispatch(
    view.state.update(
      {
        changes: lineChanges,
        selection: EditorSelection.cursor(target),
      },
      { scrollIntoView: true, userEvent: "input" },
    ),
  );

  return true;
}

export function insertTableColumnLeft(view: EditorView): boolean {
  return insertTableColumn(view, "left");
}

export function insertTableColumnRight(view: EditorView): boolean {
  return insertTableColumn(view, "right");
}

function insertTableRowRelative(view: EditorView, side: "above" | "below"): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;

  const currentLine = view.state.doc.lineAt(selection.from);
  const region = tableRegionAtLine(view, currentLine.number);
  if (!region) return false;

  if (currentLine.number === region.delimiterLine) return false;

  const rowSource =
    currentLine.number === region.headerLine
      ? view.state.doc.line(region.headerLine).text
      : currentLine.text;
  const rowText = tableRowFromLine(rowSource);
  if (!rowText) return false;

  let from: number;
  let insert: string;

  if (side === "above") {
    if (currentLine.number === region.headerLine) return false;
    from = currentLine.from;
    insert = `${rowText}\n`;
  } else {
    if (currentLine.number === region.headerLine) {
      const delimiter = view.state.doc.line(region.delimiterLine);
      from = delimiter.to;
      insert = `\n${rowText}`;
    } else {
      from = currentLine.to;
      insert = `\n${rowText}`;
    }
  }

  const cursor =
    side === "above"
      ? from + firstTableCellCursorOffset(rowText)
      : from + 1 + firstTableCellCursorOffset(rowText);

  view.dispatch(
    view.state.update(
      {
        changes: { from, insert },
        selection: EditorSelection.cursor(cursor),
      },
      { scrollIntoView: true, userEvent: "input" },
    ),
  );

  return true;
}

export function insertTableRowAbove(view: EditorView): boolean {
  return insertTableRowRelative(view, "above");
}

export function insertTableRowBelow(view: EditorView): boolean {
  return insertTableRowRelative(view, "below");
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
  const { state } = view;
  const line = state.doc.lineAt(state.selection.main.from);

  const table = createEmptyTableMarkdown(2, 1);
  const insertAt = line.to;
  const blockFrom = insertAt + 2;

  view.dispatch({
    changes: { from: insertAt, insert: `\n\n${table}\n\n` },
    effects: setActiveTable.of(blockFrom),
    selection: { anchor: blockFrom },
    scrollIntoView: true,
  });

  requestAnimationFrame(() => {
    const input = view.dom.querySelector(
      `.me-table-widget[data-table-from="${blockFrom}"] .me-table-input[data-row-index="0"][data-col-index="0"]`,
    ) as HTMLInputElement | null;
    input?.focus();
    input?.select();
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
