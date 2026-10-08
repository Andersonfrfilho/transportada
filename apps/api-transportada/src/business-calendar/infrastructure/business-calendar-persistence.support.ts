/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { BusinessCalendarPersistenceError } from '../domain/business-calendar-rule.error.js'

/** `INSERT ... RETURNING` devolve a linha e o CHECK de forma garante os campos; o tipo não sabe, e a falta é defeito. */
export function requirePersistedRow<TRow>(row: TRow | null | undefined): TRow {
  if (row === undefined || row === null) throw new BusinessCalendarPersistenceError()
  return row
}
