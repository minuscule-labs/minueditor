import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { EditorView } from '@codemirror/view'
import { insertTableAt } from '../../internal/table-commands'
import { TABLE_LIMITS, validTableDimensions } from './model'

type TableInsertion = {
  from: number
  to?: number
  prefix?: string
  suffix?: string
}

type TablePickerRequest = {
  insertion: TableInsertion
  /** Reject stale positions instead of inserting at a shifted offset. */
  document: EditorView['state']['doc']
}

type TablePickerListener = (request: TablePickerRequest) => void

const pickerListeners = new Map<EditorView, TablePickerListener>()

/**
 * Opens the one shared table picker for a live editor. Callers retain their
 * insertion placement while the picker owns dimension validation and markup.
 */
export function openTablePicker(view: EditorView, insertion: TableInsertion): boolean {
  const listener = pickerListeners.get(view)
  if (!listener || !view.state.facet(EditorView.editable)) return false
  listener({ insertion, document: view.state.doc })
  return true
}

export function TablePickerHost({ view }: { view: EditorView | null }) {
  const [request, setRequest] = useState<TablePickerRequest | null>(null)

  useEffect(() => {
    if (!view) return
    const listener: TablePickerListener = (nextRequest) => setRequest(nextRequest)
    const previous = pickerListeners.get(view)
    pickerListeners.set(view, listener)
    return () => {
      if (pickerListeners.get(view) === listener) {
        if (previous) pickerListeners.set(view, previous)
        else pickerListeners.delete(view)
      }
    }
  }, [view])

  if (!view || !request) return null
  return <TablePicker
    view={view}
    insertion={request.insertion}
    initialDocument={request.document}
    onDismiss={() => setRequest(null)}
  />
}

function TablePicker({
  view,
  insertion,
  initialDocument,
  onDismiss,
}: {
  view: EditorView
  insertion: TableInsertion
  initialDocument: EditorView['state']['doc']
  onDismiss: () => void
}) {
  const [columns, setColumns] = useState(2)
  const [bodyRows, setBodyRows] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const columnsInput = useRef<HTMLInputElement>(null)
  const anchor = view.dom.getBoundingClientRect()

  useEffect(() => {
    columnsInput.current?.focus()
    columnsInput.current?.select()
  }, [])

  function setDimension(setter: (value: number) => void, value: string) {
    const next = Number(value)
    setter(next)
    setError(null)
  }

  function insert() {
    if (!validTableDimensions(columns, bodyRows)) {
      setError(`Choose 1–${TABLE_LIMITS.maxColumns} columns and 0–${TABLE_LIMITS.maxBodyRows} body rows.`)
      return
    }
    if (view.state.doc !== initialDocument) {
      setError('The document changed. Reopen the picker to choose a new insertion location.')
      return
    }
    if (!insertTableAt(view, { ...insertion, columns, bodyRows })) {
      setError('The table could not be inserted at this location.')
      return
    }
    onDismiss()
  }

  const previewColumns = Math.min(5, Math.max(1, Number.isInteger(columns) ? columns : 1))
  const previewRows = Math.min(5, Math.max(0, Number.isInteger(bodyRows) ? bodyRows : 1))

  return createPortal(
    <div
      className="me-table-picker"
      role="dialog"
      aria-modal="false"
      aria-label="Insert table"
      style={{
        top: Math.max(8, Math.min(window.innerHeight - 340, anchor.bottom + 8)),
        left: Math.max(8, anchor.left),
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onDismiss()
          view.focus()
        } else if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
          event.preventDefault()
          insert()
        }
      }}
    >
      <div className="me-table-picker__title">Insert table</div>
      <div className="me-table-picker__grid" role="group" aria-label="Table size preview">
        {Array.from({ length: 5 }, (_, row) => Array.from({ length: 5 }, (_, column) => {
          const selected = column < previewColumns && row < previewRows
          const nextColumns = column + 1
          const nextRows = row + 1
          return (
            <button
              key={`${row}-${column}`}
              type="button"
              className={`me-table-picker__cell${selected ? ' me-table-picker__cell--selected' : ''}`}
              aria-label={`${nextColumns} columns, ${nextRows} body rows`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setColumns(nextColumns)
                setBodyRows(nextRows)
                setError(null)
              }}
            />
          )
        }))}
      </div>
      <div className="me-table-picker__dimensions">
        <label>
          Columns
          <input
            ref={columnsInput}
            type="number"
            min="1"
            max={TABLE_LIMITS.maxColumns}
            value={Number.isFinite(columns) ? columns : ''}
            onChange={(event) => setDimension(setColumns, event.target.value)}
          />
        </label>
        <label>
          Body rows
          <input
            type="number"
            min="0"
            max={TABLE_LIMITS.maxBodyRows}
            value={Number.isFinite(bodyRows) ? bodyRows : ''}
            onChange={(event) => setDimension(setBodyRows, event.target.value)}
          />
        </label>
      </div>
      {error ? <p className="me-table-picker__error" role="alert">{error}</p> : null}
      <div className="me-table-picker__actions">
        <button type="button" onClick={() => { onDismiss(); view.focus() }}>Cancel</button>
        <button type="button" className="me-table-picker__insert" onClick={insert}>Insert</button>
      </div>
    </div>,
    document.body,
  )
}
