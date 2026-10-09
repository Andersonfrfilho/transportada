/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { BusinessCalendarActor } from './business-calendar-actor.types.js'

/** Só a flag: o cursor da descoberta é do worker e nunca passa por aqui. */
export type HolidayImportEnablementRecord = { readonly isEnabled: boolean }

/**
 * Sem linha é resposta válida (`null`): a importação está ligada por padrão. O `save` devolve `null` quando o
 * valor efetivo não mudou e não havia linha — nada foi gravado nem auditado.
 */
export type HolidayImportEnablementPort = {
  find(input: { readonly companyId: string }): Promise<HolidayImportEnablementRecord | null>
  save(
    input: BusinessCalendarActor & { readonly isEnabled: boolean },
  ): Promise<HolidayImportEnablementRecord | null>
}

export type HolidayImportEnablementUseCases = {
  readonly get: {
    readonly execute: (input: {
      readonly companyId: string
    }) => Promise<HolidayImportEnablementRecord | null>
  }
  readonly save: {
    readonly execute: (
      input: BusinessCalendarActor & { readonly isEnabled: boolean },
    ) => Promise<HolidayImportEnablementRecord | null>
  }
}

export function createHolidayImportEnablementUseCases(dependencies: {
  readonly repository: HolidayImportEnablementPort
}): HolidayImportEnablementUseCases {
  return {
    get: { execute: (input) => dependencies.repository.find(input) },
    save: { execute: (input) => dependencies.repository.save(input) },
  }
}
