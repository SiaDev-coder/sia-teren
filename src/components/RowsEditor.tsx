import type { ReactNode } from 'react'
import { newId } from '../lib/ids'
import { IconPlus, IconTrash } from './icons'

/** Listă editabilă de rânduri (personal, utilaje, activități, materiale). */
export function RowsEditor<T extends { id: string }>({
  rows,
  onChange,
  make,
  render,
  addLabel,
  itemLabel,
  disabled,
}: {
  rows: T[]
  onChange: (rows: T[]) => void
  make: () => Omit<T, 'id'>
  render: (row: T, set: (patch: Partial<T>) => void, index: number) => ReactNode
  addLabel: string
  itemLabel: string
  disabled?: boolean
}) {
  return (
    <div>
      <div className="rows">
        {rows.map((row, i) => (
          <div className="rowcard" key={row.id}>
            <div className="row-head">
              <span>
                {itemLabel} {i + 1}
              </span>
              {!disabled && (
                <button type="button" className="icon-btn" aria-label={`Șterge ${itemLabel.toLowerCase()} ${i + 1}`} onClick={() => onChange(rows.filter((r) => r.id !== row.id))}>
                  <IconTrash />
                </button>
              )}
            </div>
            {render(row, (patch) => onChange(rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r))), i)}
          </div>
        ))}
      </div>
      {!disabled && (
        <button type="button" className="btn block" onClick={() => onChange([...rows, { ...(make() as object), id: newId() } as T])}>
          <IconPlus /> {addLabel}
        </button>
      )}
    </div>
  )
}
