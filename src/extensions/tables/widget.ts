import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { redo, undo } from '@codemirror/commands'
import { Decoration, type DecorationSet, EditorView, WidgetType, keymap } from '@codemirror/view'
import { activeTableField, setActiveTable } from './state'
import {
  findTableBlocks,
  getAdjacentTableBlock,
  getTableBlockByStart,
  TABLE_LIMITS,
  type TableBlock,
} from './model'
import {
  clearTableCellRange,
  deleteTable,
  insertTableColumn,
  insertTableRow,
  removeTableColumn,
  removeTableColumnRange,
  removeTableRow,
  removeTableRowRange,
  resizeTable,
  setTableColumnAlignment,
  updateTableCell,
} from '../../internal/table-commands'
import {
  exitWidgetWithArrowKey,
  focusElementWithoutScroll,
  handleWidgetBoundaryMouseDown,
} from '../../internal/widget-navigation'

function activateTable(
  view: EditorView,
  block: TableBlock,
  target: { rowIndex: number; colIndex: number } = { rowIndex: 0, colIndex: 0 },
): boolean {
  view.dispatch({
    effects: [setActiveTable.of(block.from), view.scrollSnapshot()],
    selection: EditorSelection.cursor(block.from),
  })

  requestAnimationFrame(() => {
    const widget = view.dom.querySelector(
      `.me-table-widget[data-table-from="${block.from}"]`,
    ) as HTMLElement | null
    if (!widget) return
    focusTableInput(widget, target.rowIndex, target.colIndex)
  })

  return true
}

function deactivateTable(view: EditorView, blockFrom: number): boolean {
  const block = getTableBlockByStart(view.state, blockFrom)
  view.dispatch({
    effects: [setActiveTable.of(null), view.scrollSnapshot()],
    selection: EditorSelection.cursor(block?.to ?? blockFrom),
  })
  view.focus()
  return true
}

function focusTableInput(
  wrapper: HTMLElement,
  rowIndex: number,
  colIndex: number,
  cursorOffset?: number,
): boolean {
  const input = wrapper.querySelector(
    `[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
  ) as HTMLInputElement | null
  if (!input) return false
  const offset = cursorOffset == null
    ? input.value.length
    : Math.max(0, Math.min(cursorOffset, input.value.length))
  focusElementWithoutScroll(input)
  input.setSelectionRange(offset, offset)
  return true
}

function clearTableSelection(wrapper: HTMLElement): void {
  delete wrapper.dataset.selectionAnchorRow
  delete wrapper.dataset.selectionAnchorCol
  delete wrapper.dataset.selectionFocusRow
  delete wrapper.dataset.selectionFocusCol
  for (const element of wrapper.querySelectorAll('.me-table-cell--selected')) {
    element.classList.remove('me-table-cell--selected')
    element.classList.remove('me-table-cell--selected-header')
  }
}

function tableSelectionBounds(wrapper: HTMLElement) {
  const anchorRow = wrapper.dataset.selectionAnchorRow
  const anchorCol = wrapper.dataset.selectionAnchorCol
  const focusRow = wrapper.dataset.selectionFocusRow
  const focusCol = wrapper.dataset.selectionFocusCol
  if (anchorRow == null || anchorCol == null || focusRow == null || focusCol == null) return null
  const rowStart = Math.min(Number(anchorRow), Number(focusRow))
  const rowEnd = Math.max(Number(anchorRow), Number(focusRow))
  const colStart = Math.min(Number(anchorCol), Number(focusCol))
  const colEnd = Math.max(Number(anchorCol), Number(focusCol))
  return { rowStart, rowEnd, colStart, colEnd }
}

function applyTableSelectionStyles(wrapper: HTMLElement): void {
  for (const element of wrapper.querySelectorAll('.me-table-cell--selected')) {
    element.classList.remove('me-table-cell--selected')
  }

  const bounds = tableSelectionBounds(wrapper)
  if (!bounds) return

  for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
    for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
      const input = wrapper.querySelector(
        `[data-row-index="${row}"][data-col-index="${col}"]`,
      ) as HTMLInputElement | null
      const cell = input?.closest('th, td') as HTMLElement | null
      if (!cell) continue
      cell.classList.add('me-table-cell--selected')
      if (row === 0) cell.classList.add('me-table-cell--selected-header')
    }
  }
}

function setTableSelection(
  wrapper: HTMLElement,
  anchorRow: number,
  anchorCol: number,
  focusRow: number,
  focusCol: number,
): void {
  wrapper.dataset.selectionAnchorRow = String(anchorRow)
  wrapper.dataset.selectionAnchorCol = String(anchorCol)
  wrapper.dataset.selectionFocusRow = String(focusRow)
  wrapper.dataset.selectionFocusCol = String(focusCol)
  applyTableSelectionStyles(wrapper)
}

function startTableSelection(wrapper: HTMLElement, rowIndex: number, colIndex: number): void {
  wrapper.dataset.selectionDragging = 'true'
  wrapper.dataset.dragAnchorRow = String(rowIndex)
  wrapper.dataset.dragAnchorCol = String(colIndex)
}

function updateTableSelection(wrapper: HTMLElement, rowIndex: number, colIndex: number): void {
  const anchorRow = wrapper.dataset.dragAnchorRow
  const anchorCol = wrapper.dataset.dragAnchorCol
  if (anchorRow == null || anchorCol == null) return
  setTableSelection(wrapper, Number(anchorRow), Number(anchorCol), rowIndex, colIndex)
}

function stopTableSelection(wrapper: HTMLElement): void {
  delete wrapper.dataset.selectionDragging
  delete wrapper.dataset.dragAnchorRow
  delete wrapper.dataset.dragAnchorCol
}

function deleteSelectedStructure(view: EditorView, blockFrom: number, wrapper: HTMLElement): boolean {
  const currentTarget = tableBlockTarget(wrapper, blockFrom)
  const block = getTableBlockByStart(view.state, currentTarget.blockFrom)
  const bounds = tableSelectionBounds(wrapper)
  if (!block || block.source !== currentTarget.source || !bounds) return false

  const rowCount = block.rows.length
  const colCount = block.rows[0]?.length ?? 0

  if (bounds.colStart === 0 && bounds.colEnd === colCount - 1) {
    return removeTableRowRange(view, currentTarget, bounds.rowStart, bounds.rowEnd)
  }

  if (bounds.rowStart === 0 && bounds.rowEnd === rowCount - 1) {
    return removeTableColumnRange(view, currentTarget, bounds.colStart, bounds.colEnd)
  }

  return clearTableCellRange(
    view,
    currentTarget,
    bounds.rowStart,
    bounds.rowEnd,
    bounds.colStart,
    bounds.colEnd,
  )
}

function createTableBoundary(
  view: EditorView,
  block: TableBlock,
  side: 'before' | 'after',
): HTMLElement {
  const boundary = document.createElement('div')
  boundary.className = `me-widget-boundary me-widget-boundary--${side} me-table-boundary me-table-boundary--${side}`
  boundary.setAttribute('role', 'button')
  boundary.setAttribute('aria-label', side === 'before' ? 'Place cursor before table' : 'Place cursor after table')
  boundary.addEventListener('mousedown', (event) => {
    handleWidgetBoundaryMouseDown(
      event,
      view,
      { from: block.from, to: block.to },
      side,
      setActiveTable.of(null),
    )
  })
  return boundary
}

function activeTableCellTarget(wrapper: HTMLElement, block: TableBlock) {
  const rowIndex = Number(wrapper.dataset.activeRowIndex ?? 0)
  const colIndex = Number(wrapper.dataset.activeColIndex ?? 0)
  return tableCellTarget(wrapper, block.from, block.to, rowIndex, colIndex)
}

function createTableControlButton(
  label: string,
  action: () => boolean | void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'me-table-controls__button'
  button.textContent = label
  button.setAttribute('aria-label', label)
  button.addEventListener('mousedown', (event) => event.preventDefault())
  button.addEventListener('click', () => { action() })
  return button
}

function syncTableControlsAvailability(wrapper: HTMLElement, block: TableBlock): void {
  const target = activeTableCellTarget(wrapper, block)
  const row = block.rows[target.rowIndex]
  const disable = (label: string, value: boolean) => {
    const button = wrapper.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null
    if (button) button.disabled = value
  }
  disable('Add row above', target.rowIndex === 0)
  disable('Add row below', block.rows.length - 1 >= TABLE_LIMITS.maxBodyRows)
  disable('Add column left', block.rows[0].length >= TABLE_LIMITS.maxColumns)
  disable('Add column right', block.rows[0].length >= TABLE_LIMITS.maxColumns)
  disable('Remove row', !row || target.rowIndex === 0 || block.rows.length <= 2 || row.some((cell) => cell.length > 0))
  disable('Remove column', target.colIndex < 0 || block.rows[0].length <= 1 || block.rows.some((currentRow) => currentRow[target.colIndex]?.length > 0))
}

function createTableControls(view: EditorView, block: TableBlock, wrapper: HTMLElement) {
  const controls = document.createElement('div')
  controls.className = 'me-table-controls'
  controls.setAttribute('role', 'toolbar')
  controls.setAttribute('aria-label', 'Table controls')

  const target = () => activeTableCellTarget(
    wrapper,
    getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? block.from)) ?? block,
  )
  controls.append(
    createTableControlButton('Add row above', () => insertTableRow(view, target(), 'above')),
    createTableControlButton('Add row below', () => insertTableRow(view, target(), 'below')),
    createTableControlButton('Add column left', () => insertTableColumn(view, target(), 'left')),
    createTableControlButton('Add column right', () => insertTableColumn(view, target(), 'right')),
    createTableControlButton('Remove row', () => removeTableRow(view, target())),
    createTableControlButton('Remove column', () => removeTableColumn(view, target())),
  )

  const alignment = document.createElement('span')
  alignment.className = 'me-table-controls__group'
  alignment.setAttribute('aria-label', 'Column alignment')
  for (const [label, value] of [['Align default', null], ['Align left', 'left'], ['Align center', 'center'], ['Align right', 'right']] as const) {
    alignment.appendChild(createTableControlButton(label, () => setTableColumnAlignment(view, target(), value)))
  }
  controls.appendChild(alignment)

  const resize = document.createElement('details')
  resize.className = 'me-table-controls__resize'
  const resizeStatus = document.createElement('span')
  resizeStatus.className = 'me-table-controls__status'
  resizeStatus.setAttribute('aria-live', 'polite')
  const summary = document.createElement('summary')
  summary.textContent = 'Resize'
  resize.appendChild(summary)
  const resizeForm = document.createElement('div')
  resizeForm.className = 'me-table-controls__resize-form'
  const columns = document.createElement('input')
  columns.type = 'number'
  columns.min = String(block.rows[0].length)
  columns.max = String(TABLE_LIMITS.maxColumns)
  columns.value = String(block.rows[0].length)
  columns.setAttribute('aria-label', 'Columns')
  const bodyRows = document.createElement('input')
  bodyRows.type = 'number'
  bodyRows.min = String(block.rows.length - 1)
  bodyRows.max = String(TABLE_LIMITS.maxBodyRows)
  bodyRows.value = String(block.rows.length - 1)
  bodyRows.setAttribute('aria-label', 'Body rows')
  resizeForm.append(columns, bodyRows, createTableControlButton('Apply resize', () => {
    const current = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? block.from))
    const nextColumns = Number(columns.value)
    const nextBodyRows = Number(bodyRows.value)
    if (!current || nextColumns < current.rows[0].length || nextBodyRows < current.rows.length - 1) {
      resizeStatus.textContent = 'Shrinking requires confirmation and is unavailable.'
      return false
    }
    const resized = resizeTable(view, target(), nextColumns, nextBodyRows)
    if (!resized) resizeStatus.textContent = 'Choose a larger table size within the supported limits.'
    return resized
  }))
  resize.append(resizeForm, resizeStatus)
  controls.appendChild(resize)

  const status = document.createElement('span')
  status.className = 'me-table-controls__status'
  status.setAttribute('aria-live', 'polite')
  controls.append(
    createTableControlButton('Copy table as Markdown', () => {
      if (!navigator.clipboard?.writeText) {
        status.textContent = 'Clipboard access is unavailable.'
        return
      }
      void navigator.clipboard.writeText(
        getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? block.from))?.source ?? block.source,
      ).then(
        () => { status.textContent = 'Table copied.' },
        () => { status.textContent = 'Could not copy table.' },
      )
    }),
    createTableControlButton('View table source', () => deactivateTable(view, block.from)),
    createTableControlButton('Delete table', () => deleteTable(view, target())),
    status,
  )
  return controls
}

class TableWidget extends WidgetType {
  constructor(
    readonly block: TableBlock,
    readonly isEditing: boolean,
  ) {
    super()
  }

  override eq(other: TableWidget): boolean {
    return (
      this.block.from === other.block.from &&
      this.block.to === other.block.to &&
      this.block.source === other.block.source &&
      JSON.stringify(this.block.rows) === JSON.stringify(other.block.rows) &&
      JSON.stringify(this.block.alignments) === JSON.stringify(other.block.alignments) &&
      this.isEditing === other.isEditing
    )
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = `me-table-widget${this.isEditing ? ' me-table-widget--editing' : ''}`
    wrapper.dataset.tableFrom = String(this.block.from)
    wrapper.dataset.tableTo = String(this.block.to)
    wrapper.dataset.tableSource = this.block.source
    wrapper.dataset.activeRowIndex = '0'
    wrapper.dataset.activeColIndex = '0'

    const scroller = document.createElement('div')
    scroller.className = 'me-table-scroller'

    const table = document.createElement('table')
    table.className = 'me-table-render'

    const thead = document.createElement('thead')
    const headerRow = document.createElement('tr')
    for (const [colIndex, cell] of this.block.rows[0].entries()) {
      const th = document.createElement('th')
      const align = this.block.alignments[colIndex]
      if (align) th.dataset.align = align
      if (this.isEditing) {
        th.appendChild(createTableInput(view, this.block.from, this.block.to, 0, colIndex, cell, wrapper))
      } else {
        th.textContent = cell || ' '
      }
      headerRow.appendChild(th)
    }
    thead.appendChild(headerRow)
    table.appendChild(thead)

    if (this.block.rows.length > 1) {
      const tbody = document.createElement('tbody')
      for (const [rowOffset, row] of this.block.rows.slice(1).entries()) {
        const tr = document.createElement('tr')
        for (const [colIndex, cell] of row.entries()) {
          const td = document.createElement('td')
          const align = this.block.alignments[colIndex]
          if (align) td.dataset.align = align
          if (this.isEditing) {
            td.appendChild(
              createTableInput(view, this.block.from, this.block.to, rowOffset + 1, colIndex, cell, wrapper),
            )
          } else {
            td.textContent = cell || ' '
          }
          tr.appendChild(td)
        }
        tbody.appendChild(tr)
      }
      table.appendChild(tbody)
    }

    scroller.appendChild(table)
    if (this.isEditing) {
      wrapper.appendChild(createTableControls(view, this.block, wrapper))
      syncTableControlsAvailability(wrapper, this.block)
    }
    wrapper.appendChild(createTableBoundary(view, this.block, 'before'))
    wrapper.appendChild(scroller)
    wrapper.appendChild(createTableBoundary(view, this.block, 'after'))
    return wrapper
  }

  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    dom.className = `me-table-widget${this.isEditing ? ' me-table-widget--editing' : ''}`
    dom.dataset.tableFrom = String(this.block.from)
    dom.dataset.tableTo = String(this.block.to)
    dom.dataset.tableSource = this.block.source

    if (!this.isEditing) return false

    const block = getTableBlockByStart(view.state, this.block.from) ?? this.block
    const expectedCells = block.rows.reduce((count, row) => count + row.length, 0)
    if (dom.querySelectorAll('.me-table-input').length !== expectedCells) return false

    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [colIndex, value] of row.entries()) {
        const input = dom.querySelector(
          `[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
        ) as HTMLInputElement | null
        if (!input) return false
        const cell = input.closest('th, td') as HTMLElement | null
        const alignment = block.alignments[colIndex]
        if (cell) {
          if (alignment) cell.dataset.align = alignment
          else delete cell.dataset.align
        }
        if (input.value !== value) {
          // Formatting a table trims cell-edge whitespace. Keep a focused
          // input's in-progress edge spaces so typing one space is enough.
          const isInProgressEdgeWhitespace =
            document.activeElement === input && input.value.trim() === value
          if (!isInProgressEdgeWhitespace) {
            input.value = value
            syncTableInputSizer(input)
          }
        }
      }
    }

    return true
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function syncTableInputSizer(input: HTMLInputElement): void {
  const sizer = input.parentElement
  if (sizer?.classList.contains('me-table-input-sizer')) {
    sizer.dataset.value = input.value
  }
}

function tableBlockTarget(wrapper: HTMLElement, blockFrom: number) {
  return {
    blockFrom: Number(wrapper.dataset.tableFrom ?? blockFrom),
    blockTo: Number(wrapper.dataset.tableTo),
    source: wrapper.dataset.tableSource ?? '',
  }
}

function tableCellTarget(wrapper: HTMLElement, blockFrom: number, blockTo: number, rowIndex: number, colIndex: number) {
  return { ...tableBlockTarget(wrapper, blockFrom), blockTo: Number(wrapper.dataset.tableTo ?? blockTo), rowIndex, colIndex }
}

function createTableInput(
  view: EditorView,
  blockFrom: number,
  blockTo: number,
  rowIndex: number,
  colIndex: number,
  value: string,
  wrapper: HTMLElement,
): HTMLElement {
  const sizer = document.createElement('span')
  sizer.className = 'me-table-input-sizer'
  sizer.dataset.value = value

  const input = document.createElement('input')
  input.className = 'me-table-input'
  input.type = 'text'
  input.size = 1
  input.value = value
  input.dataset.rowIndex = String(rowIndex)
  input.dataset.colIndex = String(colIndex)
  input.spellcheck = false
  input.autocomplete = 'off'
  input.autocapitalize = 'off'
  input.setAttribute('autocorrect', 'off')
  input.setAttribute('data-form-type', 'other')
  input.setAttribute('data-lpignore', 'true')
  input.setAttribute('data-1p-ignore', 'true')
  input.addEventListener('mousedown', (event) => {
    event.stopPropagation()
    startTableSelection(wrapper, rowIndex, colIndex)
  })
  input.addEventListener('click', (event) => {
    event.stopPropagation()
    wrapper.dataset.activeRowIndex = String(rowIndex)
    wrapper.dataset.activeColIndex = String(colIndex)
    const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
    if (block) syncTableControlsAvailability(wrapper, block)
    if (event.shiftKey) {
      const anchorRow = wrapper.dataset.selectionAnchorRow
      const anchorCol = wrapper.dataset.selectionAnchorCol
      if (anchorRow != null && anchorCol != null) {
        setTableSelection(wrapper, Number(anchorRow), Number(anchorCol), rowIndex, colIndex)
      } else {
        setTableSelection(wrapper, rowIndex, colIndex, rowIndex, colIndex)
      }
      return
    }
    clearTableSelection(wrapper)
    wrapper.dataset.selectionAnchorRow = String(rowIndex)
    wrapper.dataset.selectionAnchorCol = String(colIndex)
  })
  input.addEventListener('mouseenter', () => {
    if (wrapper.dataset.selectionDragging !== 'true') return
    updateTableSelection(wrapper, rowIndex, colIndex)
  })
  input.addEventListener('focus', () => {
    wrapper.dataset.activeRowIndex = String(rowIndex)
    wrapper.dataset.activeColIndex = String(colIndex)
    const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
    if (block) syncTableControlsAvailability(wrapper, block)
    if (wrapper.dataset.selectionAnchorRow == null || wrapper.dataset.selectionAnchorCol == null) {
      wrapper.dataset.selectionAnchorRow = String(rowIndex)
      wrapper.dataset.selectionAnchorCol = String(colIndex)
    }
  })
  input.addEventListener('input', () => {
    syncTableInputSizer(input)
    updateTableCell(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), input.value)
    const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
    if (block) syncTableControlsAvailability(wrapper, block)
  })
  input.addEventListener('keydown', (event) => {
    event.stopPropagation()
    if (event.key === 'Escape') {
      event.preventDefault()
      clearTableSelection(wrapper)
      deactivateTable(view, blockFrom)
      return
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo(view)
        else undo(view)
        return
      }
      if (key === 'y') {
        event.preventDefault()
        redo(view)
        return
      }
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && deleteSelectedStructure(view, blockFrom, wrapper)) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      let nextRow = rowIndex
      let nextCol = colIndex
      if (event.key === 'ArrowRight') nextCol += 1
      else if (event.key === 'ArrowLeft') nextCol -= 1
      else if (event.key === 'ArrowDown') nextRow += 1
      else if (event.key === 'ArrowUp') nextRow -= 1
      else nextRow = Number.NaN

      if (!Number.isNaN(nextRow)) {
        const block = getTableBlockByStart(view.state, blockFrom)
        if (!block) return
        nextRow = Math.max(0, Math.min(nextRow, block.rows.length - 1))
        nextCol = Math.max(0, Math.min(nextCol, block.rows[nextRow].length - 1))
        const anchorRow = Number(wrapper.dataset.selectionAnchorRow ?? rowIndex)
        const anchorCol = Number(wrapper.dataset.selectionAnchorCol ?? colIndex)
        setTableSelection(wrapper, anchorRow, anchorCol, nextRow, nextCol)
        focusTableInput(wrapper, nextRow, nextCol)
        event.preventDefault()
        return
      }
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowLeft') {
      event.preventDefault()
      insertTableColumn(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), 'left')
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowRight') {
      event.preventDefault()
      insertTableColumn(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), 'right')
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowUp') {
      event.preventDefault()
      insertTableRow(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), 'above')
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'ArrowDown') {
      event.preventDefault()
      insertTableRow(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), 'below')
      return
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'Backspace') {
      event.preventDefault()
      removeTableColumn(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex))
      return
    }
    if (event.metaKey && event.ctrlKey && event.key === 'Backspace') {
      event.preventDefault()
      removeTableRow(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex))
      return
    }
    if (event.key === 'ArrowRight' && input.selectionStart === input.value.length) {
      if (focusTableInput(wrapper, rowIndex, colIndex + 1)) event.preventDefault()
      return
    }
    if (event.key === 'ArrowLeft' && input.selectionStart === 0) {
      if (focusTableInput(wrapper, rowIndex, colIndex - 1)) event.preventDefault()
      return
    }
    if (event.key === 'ArrowDown') {
      const cursorOffset = input.selectionStart ?? input.value.length
      if (focusTableInput(wrapper, rowIndex + 1, colIndex, cursorOffset)) {
        event.preventDefault()
        return
      }

      const block = getTableBlockByStart(view.state, blockFrom)
      if (!block) return
      event.preventDefault()
      clearTableSelection(wrapper)
      exitWidgetWithArrowKey(
        view,
        { from: block.from, to: block.to },
        'after',
        setActiveTable.of(null),
      )
      return
    }
    if (event.key === 'ArrowUp') {
      const cursorOffset = input.selectionStart ?? input.value.length
      if (focusTableInput(wrapper, rowIndex - 1, colIndex, cursorOffset)) {
        event.preventDefault()
        return
      }

      const block = getTableBlockByStart(view.state, blockFrom)
      if (!block) return
      event.preventDefault()
      clearTableSelection(wrapper)
      exitWidgetWithArrowKey(
        view,
        { from: block.from, to: block.to },
        'before',
        setActiveTable.of(null),
      )
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      if (event.shiftKey) {
        if (focusTableInput(wrapper, rowIndex, colIndex - 1)) return
        focusTableInput(wrapper, rowIndex - 1, Number.MAX_SAFE_INTEGER)
        return
      }
      if (focusTableInput(wrapper, rowIndex, colIndex + 1)) return
      focusTableInput(wrapper, rowIndex + 1, 0)
    }
  })
  sizer.appendChild(input)
  return sizer
}

export function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = []
  const activeFrom = state.field(activeTableField, false)

  for (const block of findTableBlocks(state)) {
    ranges.push(
      Decoration.replace({
        widget: new TableWidget(block, activeFrom === block.from),
        block: true,
        inclusive: true,
      }).range(block.from, block.to),
    )
  }

  return Decoration.set(ranges, true)
}

export const tableClickHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    if (!view.state.facet(EditorView.editable)) return false

    const target = event.target as HTMLElement | null
    const widget = target?.closest('.me-table-widget') as HTMLElement | null
    const activeFrom = view.state.field(activeTableField, false)

    if (!widget) {
      if (activeFrom != null) return deactivateTable(view, activeFrom)
      return false
    }

    if (target?.closest('.me-table-input')) return false

    const fromText = widget.dataset.tableFrom
    if (!fromText) return false
    const block = getTableBlockByStart(view.state, Number(fromText))
    if (!block) return false
    activateTable(view, block)
    event.preventDefault()
    return true
  },
  mouseup(_event, view) {
    for (const widget of view.dom.querySelectorAll('.me-table-widget')) {
      stopTableSelection(widget as HTMLElement)
    }
    return false
  },
})

export const tableArrowNavigation = Prec.high(
  keymap.of([
    {
      key: 'ArrowDown',
      run(view) {
        if (!view.state.facet(EditorView.editable)) return false

        const selection = view.state.selection.main
        if (!selection.empty) return false
        const block = getAdjacentTableBlock(view.state, selection.head, 'down')
        if (!block) return false
        return activateTable(view, block, { rowIndex: 0, colIndex: 0 })
      },
    },
    {
      key: 'ArrowUp',
      run(view) {
        if (!view.state.facet(EditorView.editable)) return false

        const selection = view.state.selection.main
        if (!selection.empty) return false
        const block = getAdjacentTableBlock(view.state, selection.head, 'up')
        if (!block) return false
        return activateTable(view, block, {
          rowIndex: Math.max(0, block.rows.length - 1),
          colIndex: 0,
        })
      },
    },
  ]),
)
