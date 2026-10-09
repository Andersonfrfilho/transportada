/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): a consulta da montagem. Junta a mesma cidade e data numa só consulta, devolve só os
 * dias que fecham por feriado, na ordem em que a cidade e a data apareceram, e trata calendário recusado como
 * recusa tipada (422): "sem aviso" por defeito do cadastro seria dizer que o dia está livre.
 */
import { BusinessCalendarError } from '../domain/business-calendar.error.js'
import type { CivilDate } from '../domain/business-calendar.types.js'
import type { HolidayWarning } from '../domain/holiday-warning.policy.js'
import type { HolidayWarningItem, HolidayWarningPort } from './holiday-warning.port.js'

export type DayCheckItem = {
  readonly cityIbgeCode: string
  readonly date: CivilDate
}

type DayChecksParams = {
  readonly companyId: string
  readonly items: readonly DayCheckItem[]
}

export type DayChecksUseCase = {
  readonly execute: (params: DayChecksParams) => Promise<readonly HolidayWarning[]>
}

function toDistinctItems(items: readonly DayCheckItem[]): readonly HolidayWarningItem[] {
  const distinct = new Map<string, HolidayWarningItem>()
  for (const { cityIbgeCode, date } of items) {
    const key = `${cityIbgeCode}:${date}`
    if (!distinct.has(key)) distinct.set(key, { cityIbgeCode, date, key })
  }
  return [...distinct.values()]
}

export function createDayChecksUseCase(dependencies: {
  readonly repository: HolidayWarningPort
}): DayChecksUseCase {
  return {
    execute: async ({ companyId, items }) => {
      const requested = toDistinctItems(items)
      const { refusals, warnings } = await dependencies.repository.read({
        companyId,
        items: requested,
      })
      const refused = [...refusals.values()][0]
      if (refused !== undefined) {
        throw new BusinessCalendarError({
          code: refused,
          message: 'The calendar of a requested city could not be built',
        })
      }

      return requested.flatMap(({ key }) => {
        const warning = warnings.get(key)
        return warning === undefined ? [] : [warning]
      })
    },
  }
}
