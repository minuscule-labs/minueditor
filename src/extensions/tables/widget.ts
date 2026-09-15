import { EditorSelection, EditorState, Prec } from '@codemirror/state'
import { redo, undo } from '@codemirror/commands'
import { Decoration, type DecorationSet, EditorView, WidgetType, keymap } from '@codemirror/view'
import {
  activeTableField,
  setActiveTable,
  setTableInteraction,
  tableConfiguration,
  tableInteractionField,
  tableSubmitHandler,
  type TableCellSelection,
} from './state'
import {
  findTableBlocks,
  getAdjacentTableBlock,
  getTableBlockByStart,
  TABLE_LIMITS,
  type TableBlock,
} from './model'
import { parseTableClipboard, tableCellsToTsv } from './clipboard'
import {
  clearTableCellRange,
  deleteTable,
  insertTableColumn,
  insertTableRow,
  moveTableColumn,
  moveTableRow,
  pasteTableCellRange,
  previewTableCellPaste,
  removeTableColumn,
  removeTableRow,
  setTableColumnAlignment,
  updateTableCell,
} from '../../internal/table-commands'
import {
  exitWidgetWithArrowKey,
  focusElementWithoutScroll,
  handleWidgetBoundaryMouseDown,
} from '../../internal/widget-navigation'

const tableFocusTokens = new WeakMap<EditorView, number>()
const tableMenuCleanups = new WeakMap<HTMLElement, () => void>()
const tableMenuOpeners = new WeakMap<HTMLElement, () => void>()
let tableMenuId = 0

export type TableInputFocusSnapshot = {
  start: number
  end: number
  direction: HTMLInputElement['selectionDirection']
}

type InputSelection = TableInputFocusSnapshot

type TableCell = { rowIndex: number; colIndex: number }

function scheduleTableInputFocus(
  view: EditorView,
  blockFrom: number,
  target: { rowIndex: number; colIndex: number },
  selection?: InputSelection,
): void {
  const token = (tableFocusTokens.get(view) ?? 0) + 1
  const document = view.state.doc
  tableFocusTokens.set(view, token)

  requestAnimationFrame(() => {
    if (
      tableFocusTokens.get(view) !== token ||
      view.state.doc !== document ||
      !view.dom.isConnected ||
      !view.state.facet(EditorView.editable) ||
      view.state.field(activeTableField, false) !== blockFrom
    ) return
    const widget = view.dom.querySelector(
      `.me-table-widget[data-table-from="${blockFrom}"]`,
    ) as HTMLElement | null
    if (widget) focusTableInput(widget, target.rowIndex, target.colIndex, selection)
  })
}

export function captureActiveTableInputFocus(view: EditorView): TableInputFocusSnapshot | null {
  const activeElement = document.activeElement
  if (
    !(activeElement instanceof HTMLInputElement) ||
    !activeElement.classList.contains('me-table-input') ||
    !view.dom.contains(activeElement)
  ) return null
  return inputSelection(activeElement)
}

export function restoreActiveTableInputFocus(
  view: EditorView,
  selection: TableInputFocusSnapshot,
): void {
  const interaction = view.state.field(tableInteractionField, false)
  if (!interaction) return
  scheduleTableInputFocus(view, interaction.blockFrom, interaction.activeCell, selection)
}

function activateTable(
  view: EditorView,
  block: TableBlock,
  target: { rowIndex: number; colIndex: number } = { rowIndex: 0, colIndex: 0 },
): boolean {
  view.dispatch({
    effects: [
      setActiveTable.of(block.from),
      setTableInteraction.of({
        blockFrom: block.from,
        activeCell: target,
        selectionAnchor: target,
        selection: null,
      }),
      view.scrollSnapshot(),
    ],
    selection: EditorSelection.cursor(block.from),
  })
  scheduleTableInputFocus(view, block.from, target)
  return true
}

function deactivateTable(view: EditorView, blockFrom: number): boolean {
  tableFocusTokens.set(view, (tableFocusTokens.get(view) ?? 0) + 1)
  const block = getTableBlockByStart(view.state, blockFrom)
  view.dispatch({
    effects: [setActiveTable.of(null), setTableInteraction.of(null), view.scrollSnapshot()],
    selection: EditorSelection.cursor(block?.to ?? blockFrom),
  })
  view.focus()
  return true
}

function inputSelection(input: HTMLInputElement): InputSelection {
  return {
    start: input.selectionStart ?? input.value.length,
    end: input.selectionEnd ?? input.value.length,
    direction: input.selectionDirection,
  }
}

function focusTableInput(
  wrapper: HTMLElement,
  rowIndex: number,
  colIndex: number,
  selection?: InputSelection,
): boolean {
  const input = wrapper.querySelector(
    `[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
  ) as HTMLInputElement | null
  if (!input) return false
  const nextSelection = selection ?? { start: input.value.length, end: input.value.length, direction: 'none' }
  const start = Math.max(0, Math.min(nextSelection.start, input.value.length))
  const end = Math.max(start, Math.min(nextSelection.end, input.value.length))
  focusElementWithoutScroll(input)
  input.setSelectionRange(start, end, nextSelection.direction ?? 'none')
  return true
}

function announceTableStatus(wrapper: HTMLElement, message: string): void {
  const status = wrapper.querySelector('[data-table-status]')
  if (status) status.textContent = message
}

function restoreTablePasteFocus(
  view: EditorView,
  origin: HTMLInputElement,
  target: ReturnType<typeof tableCellTarget>,
  selection: InputSelection,
): void {
  if (origin.isConnected) {
    focusElementWithoutScroll(origin)
    origin.setSelectionRange(selection.start, selection.end, selection.direction ?? 'none')
    return
  }
  const widget = view.dom.querySelector(
    `.me-table-widget[data-table-from="${target.blockFrom}"]`,
  ) as HTMLElement | null
  if (widget && focusTableInput(widget, target.rowIndex, target.colIndex, selection)) return
  view.focus()
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

function tableSelection(wrapper: HTMLElement): TableCellSelection | null {
  const anchorRow = Number(wrapper.dataset.selectionAnchorRow)
  const anchorCol = Number(wrapper.dataset.selectionAnchorCol)
  const focusRow = Number(wrapper.dataset.selectionFocusRow)
  const focusCol = Number(wrapper.dataset.selectionFocusCol)
  if (![anchorRow, anchorCol, focusRow, focusCol].every(Number.isInteger)) return null
  return {
    anchor: { rowIndex: anchorRow, colIndex: anchorCol },
    focus: { rowIndex: focusRow, colIndex: focusCol },
  }
}

function clampTableCell(block: TableBlock, cell: TableCell): TableCell {
  const rowIndex = Math.max(0, Math.min(cell.rowIndex, block.rows.length - 1))
  const colIndex = Math.max(0, Math.min(cell.colIndex, block.rows[rowIndex].length - 1))
  return { rowIndex, colIndex }
}

function persistTableInteraction(view: EditorView, wrapper: HTMLElement, blockFrom: number): void {
  const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
  if (!block) return
  const activeCell = clampTableCell(block, {
    rowIndex: Number(wrapper.dataset.activeRowIndex ?? 0),
    colIndex: Number(wrapper.dataset.activeColIndex ?? 0),
  })
  const selectionAnchor = clampTableCell(block, {
    rowIndex: Number(wrapper.dataset.shiftAnchorRow ?? activeCell.rowIndex),
    colIndex: Number(wrapper.dataset.shiftAnchorCol ?? activeCell.colIndex),
  })
  view.dispatch({
    effects: setTableInteraction.of({
      blockFrom: block.from,
      activeCell,
      selectionAnchor,
      selection: tableSelection(wrapper),
    }),
  })
}

function restoreTableInteraction(view: EditorView, wrapper: HTMLElement, block: TableBlock): void {
  const interaction = view.state.field(tableInteractionField, false)
  if (!interaction || interaction.blockFrom !== block.from) return
  const activeCell = clampTableCell(block, interaction.activeCell)
  wrapper.dataset.activeRowIndex = String(activeCell.rowIndex)
  wrapper.dataset.activeColIndex = String(activeCell.colIndex)
  const selectionAnchor = clampTableCell(block, interaction.selectionAnchor)
  wrapper.dataset.shiftAnchorRow = String(selectionAnchor.rowIndex)
  wrapper.dataset.shiftAnchorCol = String(selectionAnchor.colIndex)
  clearTableSelection(wrapper)
  if (!interaction.selection) return
  const anchor = clampTableCell(block, interaction.selection.anchor)
  const focus = clampTableCell(block, interaction.selection.focus)
  setTableSelection(wrapper, anchor.rowIndex, anchor.colIndex, focus.rowIndex, focus.colIndex)
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
  delete wrapper.dataset.shiftSelecting
  delete wrapper.dataset.pendingShiftAnchorRow
  delete wrapper.dataset.pendingShiftAnchorCol
}

function selectedTableCells(wrapper: HTMLElement, block: TableBlock): string[][] | null {
  const bounds = tableSelectionBounds(wrapper)
  if (!bounds) return null
  return block.rows.slice(bounds.rowStart, bounds.rowEnd + 1).map((row) =>
    row.slice(bounds.colStart, bounds.colEnd + 1),
  )
}

function copySelectedTableCells(event: ClipboardEvent, view: EditorView, blockFrom: number, wrapper: HTMLElement): boolean {
  const target = tableBlockTarget(wrapper, blockFrom)
  const block = getTableBlockByStart(view.state, target.blockFrom)
  if (!block || block.source !== target.source) return false
  const cells = selectedTableCells(wrapper, block)
  if (!cells || !event.clipboardData) return false
  event.clipboardData.setData('text/plain', tableCellsToTsv(cells))
  return true
}

function showTablePasteConfirmation(
  view: EditorView,
  wrapper: HTMLElement,
  origin: HTMLInputElement,
  target: ReturnType<typeof tableCellTarget>,
  cells: string[][],
  overwriteCount: number,
): void {
  wrapper.querySelector('[data-table-paste-confirmation]')?.remove()
  const dialog = document.createElement('div')
  dialog.className = 'me-table-paste-confirmation'
  dialog.dataset.tablePasteConfirmation = 'true'
  dialog.setAttribute('role', 'alertdialog')
  dialog.setAttribute('aria-label', 'Confirm table paste')
  const message = document.createElement('p')
  message.textContent = `Paste ${cells.length} by ${cells[0].length} cells and replace ${overwriteCount} populated ${overwriteCount === 1 ? 'cell' : 'cells'}?`
  const selection = inputSelection(origin)
  const dismiss = () => {
    dialog.remove()
    restoreTablePasteFocus(view, origin, target, selection)
  }
  const cancel = createTableControlButton('Cancel table paste', dismiss)
  const confirm = createTableControlButton('Confirm table paste', () => {
    if (pasteTableCellRange(view, target, cells, { allowOverwrite: true })) {
      clearTableSelection(wrapper)
      announceTableStatus(wrapper, 'Table pasted.')
      dialog.remove()
    } else {
      announceTableStatus(wrapper, 'Table changed; paste was cancelled.')
      dismiss()
    }
  })
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    dismiss()
  })
  dialog.append(message, cancel, confirm)
  wrapper.appendChild(dialog)
  confirm.focus()
}

function clearSelectedCells(view: EditorView, blockFrom: number, wrapper: HTMLElement): boolean {
  const currentTarget = tableBlockTarget(wrapper, blockFrom)
  const block = getTableBlockByStart(view.state, currentTarget.blockFrom)
  const bounds = tableSelectionBounds(wrapper)
  if (!block || block.source !== currentTarget.source || !bounds) return false

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
  wrapper: HTMLElement,
  side: 'before' | 'after',
): HTMLElement {
  const boundary = document.createElement('div')
  boundary.className = `me-widget-boundary me-widget-boundary--${side} me-table-boundary me-table-boundary--${side}`
  boundary.setAttribute('role', 'button')
  boundary.setAttribute('aria-label', side === 'before' ? 'Place cursor before table' : 'Place cursor after table')
  boundary.addEventListener('mousedown', (event) => {
    const current = getTableBlockByStart(
      view.state,
      Number(wrapper.dataset.tableFrom ?? block.from),
    )
    if (!current) return
    handleWidgetBoundaryMouseDown(
      event,
      view,
      { from: current.from, to: current.to },
      side,
      [setActiveTable.of(null), setTableInteraction.of(null)],
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

function getTableMenu(wrapper: HTMLElement): HTMLElement | null {
  const id = wrapper.dataset.tableMenuId
  return id ? wrapper.ownerDocument.getElementById(id) : null
}

function syncTableControlsAvailability(wrapper: HTMLElement, block: TableBlock): void {
  const target = activeTableCellTarget(wrapper, block)
  const row = block.rows[target.rowIndex]
  const menu = getTableMenu(wrapper)
  const disable = (label: string, value: boolean) => {
    const button = menu?.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null
    if (button) button.disabled = value
  }
  disable('Add row above', target.rowIndex === 0)
  disable('Add row below', block.rows.length - 1 >= TABLE_LIMITS.maxBodyRows)
  disable('Add column left', block.rows[0].length >= TABLE_LIMITS.maxColumns)
  disable('Add column right', block.rows[0].length >= TABLE_LIMITS.maxColumns)
  disable('Move row up', target.rowIndex <= 1)
  disable('Move row down', target.rowIndex === 0 || target.rowIndex >= block.rows.length - 1)
  disable('Move column left', target.colIndex <= 0)
  disable('Move column right', target.colIndex >= block.rows[0].length - 1)
  disable('Remove row', !row || target.rowIndex === 0 || block.rows.length <= 2 || row.some((cell) => cell.length > 0))
  disable('Remove column', target.colIndex < 0 || block.rows[0].length <= 1 || block.rows.some((currentRow) => currentRow[target.colIndex]?.length > 0))

  const alignment = block.alignments[target.colIndex] ?? null
  for (const [label, value] of [['Align default', null], ['Align left', 'left'], ['Align center', 'center'], ['Align right', 'right']] as const) {
    menu?.querySelector(`[aria-label="${label}"]`)?.setAttribute('aria-checked', String(alignment === value))
  }
}

function appendTableActionsIcon(button: HTMLButtonElement): void {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')

  for (const d of [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
    'M3 9h18',
    'M3 15h18',
    'M15 3v18',
  ]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    icon.appendChild(path)
  }

  button.appendChild(icon)
}

function createTableActions(view: EditorView, block: TableBlock, wrapper: HTMLElement): HTMLElement {
  const actions = document.createElement('div')
  actions.className = 'me-table-actions'

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'me-table-actions__trigger'
  appendTableActionsIcon(trigger)
  trigger.setAttribute('aria-label', 'Table actions')
  trigger.setAttribute('aria-haspopup', 'menu')
  trigger.setAttribute('aria-expanded', 'false')

  const status = document.createElement('span')
  status.className = 'me-table-actions__status'
  status.dataset.tableStatus = 'true'
  status.setAttribute('role', 'status')
  status.setAttribute('aria-live', 'polite')

  const menu = document.createElement('div')
  const menuId = `me-table-actions-menu-${++tableMenuId}`
  menu.id = menuId
  menu.className = 'me-table-menu'
  menu.hidden = true
  menu.setAttribute('role', 'menu')
  menu.setAttribute('aria-label', 'Table actions')
  trigger.setAttribute('aria-controls', menuId)
  wrapper.dataset.tableMenuId = menuId

  let open = false
  let returnSelection: InputSelection | undefined

  const currentBlock = () => getTableBlockByStart(
    view.state,
    Number(wrapper.dataset.tableFrom ?? block.from),
  )
  const target = () => activeTableCellTarget(wrapper, currentBlock() ?? block)
  const captureReturnSelection = () => {
    const activeElement = wrapper.ownerDocument.activeElement
    if (activeElement instanceof HTMLInputElement && activeElement.classList.contains('me-table-input')) {
      returnSelection = inputSelection(activeElement)
    }
  }
  const restoreActiveCell = () => {
    if (!wrapper.isConnected) return
    focusTableInput(
      wrapper,
      Number(wrapper.dataset.activeRowIndex ?? 0),
      Number(wrapper.dataset.activeColIndex ?? 0),
      returnSelection,
    )
  }
  const positionMenu = () => {
    if (!open) return
    const viewport = window.visualViewport
    const viewportLeft = viewport?.offsetLeft ?? 0
    const viewportTop = viewport?.offsetTop ?? 0
    const viewportWidth = viewport?.width ?? window.innerWidth
    const viewportHeight = viewport?.height ?? window.innerHeight
    const padding = 8
    const gap = 6
    const minLeft = viewportLeft + padding
    const maxRight = viewportLeft + viewportWidth - padding
    const minTop = viewportTop + padding
    const maxBottom = viewportTop + viewportHeight - padding

    menu.style.maxWidth = `${Math.max(80, Math.floor(viewportWidth - padding * 2))}px`
    const anchor = trigger.getBoundingClientRect()
    const bounds = menu.getBoundingClientRect()
    const naturalHeight = menu.scrollHeight + bounds.height - menu.clientHeight

    let left = anchor.right - bounds.width
    if (left < minLeft) left = anchor.left
    left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxRight - bounds.width)))

    const belowTop = anchor.bottom + gap
    const aboveBottom = anchor.top - gap
    const availableBelow = Math.max(0, maxBottom - belowTop)
    const availableAbove = Math.max(0, aboveBottom - minTop)
    const openBelow = naturalHeight <= availableBelow || availableBelow >= availableAbove
    const availableHeight = openBelow ? availableBelow : availableAbove
    const maxMenuHeight = Math.max(80, Math.floor(availableHeight))
    const renderedHeight = Math.min(naturalHeight, maxMenuHeight)
    let top = openBelow ? belowTop : aboveBottom - renderedHeight
    top = Math.max(minTop, Math.min(top, Math.max(minTop, maxBottom - renderedHeight)))

    menu.style.left = `${Math.round(left)}px`
    menu.style.top = `${Math.round(top)}px`
    menu.style.maxHeight = `${maxMenuHeight}px`
  }
  const closeMenu = ({ restoreFocus = true }: { restoreFocus?: boolean } = {}) => {
    if (!open) return
    open = false
    menu.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    if (restoreFocus) requestAnimationFrame(restoreActiveCell)
  }
  const enabledItems = () => Array.from(
    menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]'),
  ).filter((item) => !item.disabled)
  const openMenu = (focus: 'first' | 'last' = 'first') => {
    if (open || !wrapper.isConnected) return
    captureReturnSelection()
    const latest = currentBlock()
    if (!latest) return
    syncTableControlsAvailability(wrapper, latest)
    const styles = getComputedStyle(wrapper)
    for (const property of [
      '--me-toolbar-border',
      '--me-toolbar-bg',
      '--me-toolbar-btn-color',
      '--me-table-border',
      '--me-table-bg',
      '--me-deleted-accent',
    ]) {
      const value = styles.getPropertyValue(property)
      if (value) menu.style.setProperty(property, value)
    }
    menu.style.colorScheme = styles.colorScheme
    // Opening a menu takes focus ownership from any activation callback that
    // was queued when the table widget first became active.
    tableFocusTokens.set(view, (tableFocusTokens.get(view) ?? 0) + 1)
    open = true
    menu.hidden = false
    menu.style.visibility = 'hidden'
    trigger.setAttribute('aria-expanded', 'true')
    positionMenu()
    menu.style.visibility = ''
    const items = enabledItems()
    items[focus === 'first' ? 0 : items.length - 1]?.focus()
  }
  const runAction = (
    action: () => boolean | void,
    { restoreFocus = true }: { restoreFocus?: boolean } = {},
  ) => {
    const applied = action()
    if (applied === false) {
      status.textContent = 'The table changed; reopen Table actions and try again.'
      const latest = currentBlock()
      if (latest) syncTableControlsAvailability(wrapper, latest)
      return
    }
    closeMenu({ restoreFocus })
  }
  const createItem = (
    label: string,
    text: string,
    action: () => boolean | void,
    options: { destructive?: boolean; radio?: boolean; restoreFocus?: boolean } = {},
  ) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `me-table-menu__item${options.destructive ? ' me-table-menu__item--destructive' : ''}`
    button.textContent = text
    button.setAttribute('aria-label', label)
    button.setAttribute('role', options.radio ? 'menuitemradio' : 'menuitem')
    if (options.radio) button.setAttribute('aria-checked', 'false')
    button.addEventListener('click', () => runAction(action, { restoreFocus: options.restoreFocus !== false }))
    return button
  }
  const addGroup = (label: string, items: readonly HTMLButtonElement[]) => {
    const group = document.createElement('div')
    group.className = 'me-table-menu__group'
    group.setAttribute('role', 'group')
    const heading = document.createElement('div')
    const headingId = `${menuId}-${label.toLowerCase()}`
    heading.id = headingId
    heading.className = 'me-table-menu__heading'
    heading.textContent = label
    group.setAttribute('aria-labelledby', headingId)
    group.append(heading, ...items)
    menu.appendChild(group)
  }

  addGroup('Row', [
    createItem('Add row above', 'Add row above', () => insertTableRow(view, target(), 'above')),
    createItem('Add row below', 'Add row below', () => insertTableRow(view, target(), 'below')),
    createItem('Move row up', 'Move row up', () => moveTableRow(view, target(), 'up')),
    createItem('Move row down', 'Move row down', () => moveTableRow(view, target(), 'down')),
    createItem('Remove row', 'Remove row', () => removeTableRow(view, target()), { destructive: true }),
  ])
  addGroup('Column', [
    createItem('Add column left', 'Add column left', () => insertTableColumn(view, target(), 'left')),
    createItem('Add column right', 'Add column right', () => insertTableColumn(view, target(), 'right')),
    createItem('Move column left', 'Move column left', () => moveTableColumn(view, target(), 'left')),
    createItem('Move column right', 'Move column right', () => moveTableColumn(view, target(), 'right')),
    createItem('Remove column', 'Remove column', () => removeTableColumn(view, target()), { destructive: true }),
  ])
  addGroup('Alignment', [
    createItem('Align default', 'Default', () => setTableColumnAlignment(view, target(), null), { radio: true }),
    createItem('Align left', 'Left', () => setTableColumnAlignment(view, target(), 'left'), { radio: true }),
    createItem('Align center', 'Center', () => setTableColumnAlignment(view, target(), 'center'), { radio: true }),
    createItem('Align right', 'Right', () => setTableColumnAlignment(view, target(), 'right'), { radio: true }),
  ])
  addGroup('Table', [
    createItem('Copy table as Markdown', 'Copy table as Markdown', () => {
      if (!navigator.clipboard?.writeText) {
        status.textContent = 'Clipboard access is unavailable.'
        return
      }
      void navigator.clipboard.writeText(currentBlock()?.source ?? block.source).then(
        () => { status.textContent = 'Table copied.' },
        () => { status.textContent = 'Could not copy table.' },
      )
    }),
    createItem('Exit table editing', 'Exit table editing', () => deactivateTable(
      view,
      Number(wrapper.dataset.tableFrom ?? block.from),
    ), { restoreFocus: false }),
    createItem('Delete table', 'Delete table', () => deleteTable(view, target()), {
      destructive: true,
      restoreFocus: false,
    }),
  ])

  const handleOutsidePointer = (event: Event) => {
    const eventTarget = event.target as Node | null
    if (eventTarget && (menu.contains(eventTarget) || trigger.contains(eventTarget))) return
    // Preserve the focus destination chosen by the outside interaction.
    closeMenu({ restoreFocus: false })
  }
  const handleViewportChange = () => positionMenu()
  const cleanup = () => {
    document.removeEventListener('pointerdown', handleOutsidePointer, true)
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange, true)
    tableMenuOpeners.delete(wrapper)
    menu.remove()
  }

  trigger.addEventListener('mousedown', (event) => {
    captureReturnSelection()
    event.stopPropagation()
  })
  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    if (open) closeMenu()
    else openMenu()
  })
  trigger.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    openMenu(event.key === 'ArrowUp' ? 'last' : 'first')
  })
  menu.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closeMenu()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      closeMenu()
      return
    }
    const items = enabledItems()
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    let next = -1
    if (event.key === 'ArrowDown') next = current < 0 ? 0 : (current + 1) % items.length
    else if (event.key === 'ArrowUp') next = current < 0 ? items.length - 1 : (current - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    if (next < 0) return
    event.preventDefault()
    items[next]?.focus()
  })
  document.addEventListener('pointerdown', handleOutsidePointer, true)
  window.addEventListener('resize', handleViewportChange)
  window.addEventListener('scroll', handleViewportChange, true)
  tableMenuCleanups.set(wrapper, cleanup)
  tableMenuOpeners.set(wrapper, openMenu)
  document.body.appendChild(menu)
  actions.append(trigger, status)
  return actions
}

class TableWidget extends WidgetType {
  constructor(
    readonly block: TableBlock,
    readonly isEditing: boolean,
    readonly showTableActions: boolean,
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
      this.isEditing === other.isEditing &&
      this.showTableActions === other.showTableActions
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
      restoreTableInteraction(view, wrapper, this.block)
      if (this.showTableActions) {
        wrapper.appendChild(createTableActions(view, this.block, wrapper))
        syncTableControlsAvailability(wrapper, this.block)
      }
    }
    wrapper.appendChild(createTableBoundary(view, this.block, wrapper, 'before'))
    wrapper.appendChild(scroller)
    wrapper.appendChild(createTableBoundary(view, this.block, wrapper, 'after'))
    return wrapper
  }

  override updateDOM(dom: HTMLElement, view: EditorView): boolean {
    dom.className = `me-table-widget${this.isEditing ? ' me-table-widget--editing' : ''}`
    dom.dataset.tableFrom = String(this.block.from)
    dom.dataset.tableTo = String(this.block.to)
    dom.dataset.tableSource = this.block.source

    if (!this.isEditing) return false
    if (this.showTableActions !== Boolean(dom.querySelector('.me-table-actions'))) return false

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
          if (!isInProgressEdgeWhitespace && input.dataset.composing !== 'true') {
            const selection = document.activeElement === input ? inputSelection(input) : null
            input.value = value
            syncTableInputSizer(input)
            if (selection) {
              const start = Math.max(0, Math.min(selection.start, input.value.length))
              const end = Math.max(start, Math.min(selection.end, input.value.length))
              input.setSelectionRange(start, end, selection.direction ?? 'none')
            }
          }
        }
      }
    }

    restoreTableInteraction(view, dom, block)
    syncTableControlsAvailability(dom, block)
    return true
  }

  override destroy(dom: HTMLElement): void {
    tableMenuCleanups.get(dom)?.()
    tableMenuCleanups.delete(dom)
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
  input.setAttribute(
    'aria-label',
    `${rowIndex === 0 ? 'Header' : `Body row ${rowIndex}`}, column ${colIndex + 1}`,
  )
  input.spellcheck = false
  input.autocomplete = 'off'
  input.autocapitalize = 'off'
  input.setAttribute('autocorrect', 'off')
  input.setAttribute('data-form-type', 'other')
  input.setAttribute('data-lpignore', 'true')
  input.setAttribute('data-1p-ignore', 'true')
  input.addEventListener('mousedown', (event) => {
    event.stopPropagation()
    const finishPointerSelection = () => {
      document.removeEventListener('mouseup', finishPointerSelection, true)
      document.removeEventListener('pointercancel', finishPointerSelection, true)
      stopTableSelection(wrapper)
    }
    document.addEventListener('mouseup', finishPointerSelection, { capture: true, once: true })
    document.addEventListener('pointercancel', finishPointerSelection, { capture: true, once: true })
    if (event.shiftKey) {
      wrapper.dataset.shiftSelecting = 'true'
      wrapper.dataset.pendingShiftAnchorRow = wrapper.dataset.shiftAnchorRow ?? String(rowIndex)
      wrapper.dataset.pendingShiftAnchorCol = wrapper.dataset.shiftAnchorCol ?? String(colIndex)
    } else {
      delete wrapper.dataset.shiftSelecting
      delete wrapper.dataset.pendingShiftAnchorRow
      delete wrapper.dataset.pendingShiftAnchorCol
    }
    startTableSelection(wrapper, rowIndex, colIndex)
  })
  input.addEventListener('mouseup', () => stopTableSelection(wrapper))
  input.addEventListener('pointercancel', () => stopTableSelection(wrapper))
  input.addEventListener('click', (event) => {
    event.stopPropagation()
    wrapper.dataset.activeRowIndex = String(rowIndex)
    wrapper.dataset.activeColIndex = String(colIndex)
    if (!event.shiftKey) {
      wrapper.dataset.shiftAnchorRow = String(rowIndex)
      wrapper.dataset.shiftAnchorCol = String(colIndex)
    }
    const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
    if (block) syncTableControlsAvailability(wrapper, block)
    if (event.shiftKey) {
      const anchorRow = wrapper.dataset.selectionAnchorRow
      const anchorCol = wrapper.dataset.selectionAnchorCol
      if (anchorRow != null && anchorCol != null) {
        setTableSelection(wrapper, Number(anchorRow), Number(anchorCol), rowIndex, colIndex)
      } else {
        // A same-shape update clears transient range attributes. This durable
        // origin remains independent from the active cell and visible range.
        const shiftAnchorRow = Number(
          wrapper.dataset.pendingShiftAnchorRow ?? wrapper.dataset.shiftAnchorRow ?? rowIndex,
        )
        const shiftAnchorCol = Number(
          wrapper.dataset.pendingShiftAnchorCol ?? wrapper.dataset.shiftAnchorCol ?? colIndex,
        )
        setTableSelection(wrapper, shiftAnchorRow, shiftAnchorCol, rowIndex, colIndex)
      }
      persistTableInteraction(view, wrapper, blockFrom)
      delete wrapper.dataset.shiftSelecting
      delete wrapper.dataset.pendingShiftAnchorRow
      delete wrapper.dataset.pendingShiftAnchorCol
      return
    }
    clearTableSelection(wrapper)
    wrapper.dataset.selectionAnchorRow = String(rowIndex)
    wrapper.dataset.selectionAnchorCol = String(colIndex)
    persistTableInteraction(view, wrapper, blockFrom)
  })
  input.addEventListener('mouseenter', () => {
    if (wrapper.dataset.selectionDragging !== 'true') return
    updateTableSelection(wrapper, rowIndex, colIndex)
    persistTableInteraction(view, wrapper, blockFrom)
  })
  input.addEventListener('focus', () => {
    if (wrapper.dataset.shiftSelecting !== 'true') {
      wrapper.dataset.activeRowIndex = String(rowIndex)
      wrapper.dataset.activeColIndex = String(colIndex)
    }
    const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
    if (block) syncTableControlsAvailability(wrapper, block)
    if (
      wrapper.dataset.shiftSelecting !== 'true' &&
      (wrapper.dataset.selectionAnchorRow == null || wrapper.dataset.selectionAnchorCol == null)
    ) {
      wrapper.dataset.selectionAnchorRow = String(rowIndex)
      wrapper.dataset.selectionAnchorCol = String(colIndex)
    }
    if (wrapper.dataset.shiftSelecting !== 'true') persistTableInteraction(view, wrapper, blockFrom)
  })
  input.addEventListener('compositionstart', () => {
    input.dataset.composing = 'true'
  })
  input.addEventListener('compositionend', () => {
    delete input.dataset.composing
  })
  input.addEventListener('contextmenu', (event) => {
    // Shift+F10 may synthesize a contextmenu event after keydown. Suppress only
    // that keyboard event; pointer right-click remains fully native.
    if (wrapper.dataset.keyboardTableMenu !== 'true') return
    event.preventDefault()
    event.stopPropagation()
  })
  input.addEventListener('copy', (event) => {
    if (!copySelectedTableCells(event, view, blockFrom, wrapper)) return
    event.preventDefault()
    event.stopPropagation()
    announceTableStatus(wrapper, 'Selected cells copied.')
  })
  input.addEventListener('cut', (event) => {
    if (!copySelectedTableCells(event, view, blockFrom, wrapper)) return
    event.preventDefault()
    event.stopPropagation()
    if (clearSelectedCells(view, blockFrom, wrapper)) {
      clearTableSelection(wrapper)
      announceTableStatus(wrapper, 'Selected cells cut.')
    }
  })
  input.addEventListener('paste', (event) => {
    // An input is a cell editor, never a document-paste target. Stop the
    // parent rich-paste extension from turning spreadsheet data into a new
    // Markdown table elsewhere in the document.
    event.stopPropagation()
    const plainText = event.clipboardData?.getData('text/plain') ?? ''
    const parsed = parseTableClipboard(
      plainText,
      event.clipboardData?.getData('text/html') ?? '',
    )
    if (parsed.status === 'not-tabular' || parsed.status === 'empty') {
      if (/\r|\n/.test(plainText)) {
        event.preventDefault()
        announceTableStatus(wrapper, 'Multiline text is unsupported in table cells; edit source to preserve it.')
      }
      return
    }
    event.preventDefault()
    if (parsed.status !== 'valid') {
      const messages = {
        invalid: 'Clipboard table is not valid TSV.',
        'multiline-cell': 'Clipboard table contains unsupported multiline cells.',
        oversize: 'Clipboard table exceeds the supported limits.',
      }
      announceTableStatus(wrapper, messages[parsed.status])
      return
    }

    const bounds = tableSelectionBounds(wrapper)
    const target = tableCellTarget(
      wrapper,
      blockFrom,
      blockTo,
      bounds?.rowStart ?? rowIndex,
      bounds?.colStart ?? colIndex,
    )
    const preview = previewTableCellPaste(view, target, parsed.cells)
    if (!preview.canApply) {
      announceTableStatus(wrapper, preview.reason === 'out-of-bounds'
        ? 'Clipboard table exceeds the supported table limits.'
        : 'Clipboard table cannot be pasted here.')
      return
    }
    if (preview.requiresOverwriteConfirmation) {
      showTablePasteConfirmation(view, wrapper, input, target, parsed.cells, preview.overwriteCount)
      return
    }
    if (!pasteTableCellRange(view, target, parsed.cells)) {
      announceTableStatus(wrapper, 'Clipboard table could not be pasted.')
      return
    }
    clearTableSelection(wrapper)
  })
  input.addEventListener('input', () => {
    syncTableInputSizer(input)
    updateTableCell(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), input.value)
    const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
    if (block) syncTableControlsAvailability(wrapper, block)
  })
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.altKey) {
      const submit = view.state.facet(tableSubmitHandler)
      if (submit) {
        event.preventDefault()
        event.stopPropagation()
        submit()
      }
      return
    }
    event.stopPropagation()
    if (event.key === 'F10' && event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const openTableMenu = tableMenuOpeners.get(wrapper)
      if (!openTableMenu) return
      event.preventDefault()
      wrapper.dataset.keyboardTableMenu = 'true'
      openTableMenu()
      window.setTimeout(() => { delete wrapper.dataset.keyboardTableMenu }, 0)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (tableSelectionBounds(wrapper)) {
        clearTableSelection(wrapper)
        persistTableInteraction(view, wrapper, blockFrom)
      } else {
        deactivateTable(view, Number(wrapper.dataset.tableFrom ?? blockFrom))
      }
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
    if ((event.key === 'Backspace' || event.key === 'Delete') && clearSelectedCells(view, blockFrom, wrapper)) {
      event.preventDefault()
      return
    }
    // Shift-arrow belongs to the native text input. Rectangular keyboard
    // selection will require a separate, explicit cell-selection mode.
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
    if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault()
      if (event.shiftKey) return
      const block = getTableBlockByStart(
        view.state,
        Number(wrapper.dataset.tableFrom ?? blockFrom),
      )
      if (!block) return
      if (focusTableInput(wrapper, rowIndex + 1, colIndex, inputSelection(input))) return
      clearTableSelection(wrapper)
      exitWidgetWithArrowKey(
        view,
        { from: block.from, to: block.to },
        'after',
        [setActiveTable.of(null), setTableInteraction.of(null)],
      )
      return
    }
    if (event.key === 'ArrowDown') {
      const selection = inputSelection(input)
      if (focusTableInput(wrapper, rowIndex + 1, colIndex, selection)) {
        event.preventDefault()
        return
      }

      const block = getTableBlockByStart(
        view.state,
        Number(wrapper.dataset.tableFrom ?? blockFrom),
      )
      if (!block) return
      event.preventDefault()
      clearTableSelection(wrapper)
      exitWidgetWithArrowKey(
        view,
        { from: block.from, to: block.to },
        'after',
        [setActiveTable.of(null), setTableInteraction.of(null)],
      )
      return
    }
    if (event.key === 'ArrowUp') {
      const selection = inputSelection(input)
      if (focusTableInput(wrapper, rowIndex - 1, colIndex, selection)) {
        event.preventDefault()
        return
      }

      const block = getTableBlockByStart(
        view.state,
        Number(wrapper.dataset.tableFrom ?? blockFrom),
      )
      if (!block) return
      event.preventDefault()
      clearTableSelection(wrapper)
      exitWidgetWithArrowKey(
        view,
        { from: block.from, to: block.to },
        'before',
        [setActiveTable.of(null), setTableInteraction.of(null)],
      )
      return
    }
    if (event.key === 'Tab') {
      const block = getTableBlockByStart(view.state, Number(wrapper.dataset.tableFrom ?? blockFrom))
      if (!block) return
      const selection = inputSelection(input)

      if (event.shiftKey) {
        if (focusTableInput(wrapper, rowIndex, colIndex - 1, selection)) {
          event.preventDefault()
          return
        }
        if (focusTableInput(wrapper, rowIndex - 1, block.rows[0].length - 1, selection)) {
          event.preventDefault()
          return
        }
        event.preventDefault()
        clearTableSelection(wrapper)
        exitWidgetWithArrowKey(
          view,
          { from: block.from, to: block.to },
          'before',
          [setActiveTable.of(null), setTableInteraction.of(null)],
        )
        return
      }

      if (focusTableInput(wrapper, rowIndex, colIndex + 1, selection)) {
        event.preventDefault()
        return
      }
      if (focusTableInput(wrapper, rowIndex + 1, 0, selection)) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      if (insertTableRow(view, tableCellTarget(wrapper, blockFrom, blockTo, rowIndex, colIndex), 'below')) return
      clearTableSelection(wrapper)
      exitWidgetWithArrowKey(
        view,
        { from: block.from, to: block.to },
        'after',
        [setActiveTable.of(null), setTableInteraction.of(null)],
      )
    }
  })
  sizer.appendChild(input)
  return sizer
}

export function buildTableDecorations(state: EditorState): DecorationSet {
  const ranges: ReturnType<Decoration['range']>[] = []
  const activeFrom = state.field(activeTableField, false)
  const showTableActions = state.facet(tableConfiguration).actions

  for (const block of findTableBlocks(state)) {
    ranges.push(
      Decoration.replace({
        widget: new TableWidget(block, activeFrom === block.from, showTableActions),
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
