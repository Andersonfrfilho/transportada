/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

export type BusinessCalendarSettingsRecord = {
  readonly saturdayIsBusinessDay: boolean
  readonly updatedAt: Date
}

/** Sem linha é resposta válida: o sábado não é dia útil. A escrita audita na mesma transação. */
export type BusinessCalendarSettingsPort = {
  find(input: { readonly companyId: string }): Promise<BusinessCalendarSettingsRecord | null>
  save(
    input: BusinessCalendarActor & { readonly saturdayIsBusinessDay: boolean },
  ): Promise<BusinessCalendarSettingsRecord>
}
