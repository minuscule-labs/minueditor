import { Facet, StateEffect, StateField, type EditorState } from '@codemirror/state'
import type { TableInsertionConfig } from '../../types'
import { getTableBlockByStart, validTableDimensions } from './model'

export type TableConfiguration = {
  actions: boolean
  insertion: Required<TableInsertionConfig>
}

export const DEFAULT_TABLE_CONFIGURATION: TableConfiguration = {
  actions: true,
  insertion: { columns: 2, bodyRows: 1 },
}

export function normalizeTableConfiguration(
  actions: boolean | undefined,
  insertion: TableInsertionConfig | undefined,
): TableConfiguration {
  const columns = insertion?.columns ?? DEFAULT_TABLE_CONFIGURATION.insertion.columns
  const bodyRows = insertion?.bodyRows ?? DEFAULT_TABLE_CONFIGURATION.insertion.bodyRows
  return {
    actions: actions !== false,
    insertion: validTableDimensions(columns, bodyRows)
      ? { columns, bodyRows }
      : DEFAULT_TABLE_CONFIGURATION.insertion,
  }
}

export const tableConfiguration = Facet.define<TableConfiguration, TableConfiguration>({
  combine: (configurations) => configurations[0] ?? DEFAULT_TABLE_CONFIGURATION,
})

export const tableSubmitHandler = Facet.define<() => void, (() => void) | null>({
  combine: (handlers) => handlers[0] ?? null,
})

export type TableCellCoordinates = {
  rowIndex: number
  colIndex: number
}

export type TableCellSelection = {
  anchor: TableCellCoordinates
  focus: TableCellCoordinates
}

/** Durable interaction state; the widget DOM mirrors this state, not vice versa. */
export type TableInteraction = {
  blockFrom: number
  activeCell: TableCellCoordinates
  /** Shift-click origin survives when no visible range is selected. */
  selectionAnchor: TableCellCoordinates
  selection: TableCellSelection | null
}

export const setActiveTable = StateEffect.define<number | null>()
export const setTableInteraction = StateEffect.define<TableInteraction | null>()

export const clearTableInteractionEffects = () => [
  setActiveTable.of(null),
  setTableInteraction.of(null),
]

/**
 * Controlled updates may map a table start, but coordinates are only safe when
 * the update is strictly separated from the table source. Any overlap or
 * line-concatenating boundary edit deactivates the widget instead of allowing
 * an old target to edit externally replaced data.
 */
export function externalChangeInvalidatesTableInteraction(
  state: EditorState,
  change: { from: number; to: number; insert: string },
): boolean {
  const activeFrom = state.field(activeTableField, false)
  const interaction = state.field(tableInteractionField, false)
  if (activeFrom == null && interaction == null) return false
  if (activeFrom == null || interaction == null || activeFrom !== interaction.blockFrom) return true

  const block = getTableBlockByStart(state, activeFrom)
  if (!block) return true

  if (change.from === change.to) {
    if (change.from === block.from) return !change.insert.endsWith('\n')
    if (change.from === block.to) return !change.insert.startsWith('\n')
    return change.from > block.from && change.from < block.to
  }
  // Boundary replacements can concatenate inserted text with the first or
  // last table line, so only wholly separated ranges are considered safe.
  return change.from <= block.to && change.to >= block.from
}

export const activeTableField = StateField.define<number | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value
    if (nextValue != null) nextValue = tr.changes.mapPos(nextValue, 1)
    for (const effect of tr.effects) {
      if (effect.is(setActiveTable)) nextValue = effect.value
    }
    return nextValue
  },
})

export const tableInteractionField = StateField.define<TableInteraction | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value && {
      ...value,
      blockFrom: tr.changes.mapPos(value.blockFrom, 1),
    }
    for (const effect of tr.effects) {
      if (effect.is(setTableInteraction)) nextValue = effect.value
    }
    return nextValue
  },
})
