/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O adaptador Drizzle da aplicação. Uma transação por empresa, sob a trava de calendário da API
 * (`acquireBusinessCalendarLock`): o operador que desliga um feriado e a rotina que o importa nunca
 * escrevem o calendário da mesma empresa ao mesmo tempo.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import type { HolidayApplyStore } from '../application/holiday-apply.port.js'

import { acquireBusinessCalendarLock } from './business-calendar-lock.support.js'
import {
  buildApplyMunicipalQuery,
  buildApplyStateQuery,
  buildReadNationalDatesQuery,
  LIST_APPLY_COMPANIES_QUERY,
} from './holiday-apply.query.js'

export type HolidayApplyDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleHolidayApplyStore(database: HolidayApplyDatabase): HolidayApplyStore {
  return {
    async applyCompany({ companyId, today }) {
      return database.transaction(async (transaction) => {
        await acquireBusinessCalendarLock({ companyId, transaction })
        const municipal = await transaction.execute(buildApplyMunicipalQuery({ companyId, today }))
        const state = await transaction.execute(buildApplyStateQuery({ companyId, today }))

        return { municipalInserted: [...municipal].length, stateInserted: [...state].length }
      })
    },

    async listCompanies() {
      const rows = await database.execute<{ company_id: string }>(LIST_APPLY_COMPANIES_QUERY)
      return [...rows].map((row) => row.company_id)
    },

    async readNationalDates({ years }) {
      const byYear = new Map<number, string[]>()
      if (years.length === 0) return byYear

      const rows = await database.execute<{ holiday_on: string; year: number }>(
        buildReadNationalDatesQuery(years),
      )
      for (const row of rows) {
        const dates = byYear.get(Number(row.year)) ?? []
        dates.push(row.holiday_on)
        byYear.set(Number(row.year), dates)
      }

      return byYear
    },
  }
}
