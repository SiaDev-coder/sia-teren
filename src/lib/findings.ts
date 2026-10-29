import type { Finding } from '../db/types'

/** Depășită = termen trecut și constatarea nu este închisă (Rezolvată / Verificată / Anulată). */
export function isOverdue(f: Pick<Finding, 'dueDate' | 'status'>, today: string): boolean {
  return !!f.dueDate && f.dueDate < today && !['Rezolvată', 'Verificată', 'Anulată'].includes(f.status)
}
