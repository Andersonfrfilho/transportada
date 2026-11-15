/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (RF21 a RF23): o que a previsão e o fora do padrão leem além do resultado, sobre Drizzle. Toda consulta
 * carrega `company_id`. O calendário é o da cidade do perfil fiscal da empresa (spec 238); sem perfil ou com calendário
 * recusado, o mês conta segunda a sexta, o que a spec 238 chama de premissa. O limite do alerta mora em
 * `company_expense_allocation_settings`, por empresa: a escrita grava o mesmo valor em todas as linhas dos grupos
 * rateáveis (criando a que faltar com o critério padrão).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray } from 'drizzle-orm'

import { buildBusinessCalendar } from '../../business-calendar/domain/business-calendar-build.policy.js'
import { BusinessCalendarError } from '../../business-calendar/domain/business-calendar.error.js'
import { countBusinessDays } from '../../business-calendar/domain/business-calendar.policy.js'
import type { BusinessCalendar } from '../../business-calendar/domain/business-calendar.types.js'
import { loadBusinessCalendarRules } from '../../business-calendar/infrastructure/business-calendar-rules.query.js'
import {
  COMPANY_EXPENSE_ALLOCATABLE_GROUPS,
  companyExpenseAllocationSettings,
  companyExpenseCategories,
} from '../../database/company-expense.schema.js'
import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type {
  ExpenseForecastPorts,
  ExpenseOutOfPatternSettingsPorts,
} from '../application/expense-forecast.port.js'
import type { ExpenseResultPorts } from '../application/expense-result.port.js'
import { DEFAULT_ALLOCATION_SETTINGS } from '../domain/expense-allocation.policy.js'
import { shiftMonth } from '../application/expense-forecast.use-case.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export const DEFAULT_OUT_OF_PATTERN_THRESHOLD = 10
const AUDIT_PERMISSION = 'expenses.manage'

function lastDayOf(month: string): string {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return `${month}-${String(day).padStart(2, '0')}`
}

/** Dias de segunda a sexta do mês, a contagem sem calendário. */
function weekdaysIn(month: string): number {
  const [year = 0, monthNumber = 1] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  let weekdays = 0
  for (let day = 1; day <= lastDay; day += 1) {
    const weekday = new Date(Date.UTC(year, monthNumber - 1, day)).getUTCDay()
    if (weekday !== 0 && weekday !== 6) weekdays += 1
  }
  return weekdays
}

function businessDaysOf(calendar: BusinessCalendar, month: string): number {
  const previous = shiftMonth(month, -1)
  const before = lastDayOf(previous)
  return countBusinessDays({ calendar, from: before, to: lastDayOf(month) }).businessDays
}

export function createDrizzleExpenseForecastPorts(
  database: Database,
  resultPorts: ExpenseResultPorts,
): ExpenseForecastPorts & ExpenseOutOfPatternSettingsPorts {
  return {
    ...resultPorts,
    calendar: {
      businessDaysByMonth: async ({ companyId, months }) => {
        const fallback = (): Map<string, number> =>
          new Map(months.map((month) => [month, weekdaysIn(month)]))
        const [profile] = await database
          .select({ cityIbgeCode: companyFiscalProfiles.cityIbgeCode })
          .from(companyFiscalProfiles)
          .where(eq(companyFiscalProfiles.companyId, companyId))
          .limit(1)
        if (profile === undefined || months.length === 0) return fallback()
        const years = months.map((month) => Number(month.slice(0, 4)))
        const coverage = { fromYear: Math.min(...years) - 1, toYear: Math.max(...years) }
        try {
          const rules = await loadBusinessCalendarRules(database, {
            cityCodes: [profile.cityIbgeCode],
            companyId,
            coverage,
          })
          const calendar = buildBusinessCalendar({
            ...rules,
            cityIbgeCode: profile.cityIbgeCode,
            coverage,
          })
          return new Map(months.map((month) => [month, businessDaysOf(calendar, month)]))
        } catch (error) {
          if (!(error instanceof BusinessCalendarError)) throw error
          return fallback()
        }
      },
    },
    labels: {
      categoryNames: async ({ companyId }) => {
        const rows = await database
          .select({ id: companyExpenseCategories.id, name: companyExpenseCategories.name })
          .from(companyExpenseCategories)
          .where(eq(companyExpenseCategories.companyId, companyId))
        return new Map(rows.map((row) => [row.id, row.name]))
      },
      vehiclePlates: async ({ companyId, vehicleIds }) => {
        if (vehicleIds.length === 0) return new Map()
        const rows = await database
          .select({ id: fleetVehicles.id, plate: fleetVehicles.plate })
          .from(fleetVehicles)
          .where(
            and(eq(fleetVehicles.companyId, companyId), inArray(fleetVehicles.id, [...vehicleIds])),
          )
        return new Map(rows.map((row) => [row.id, row.plate]))
      },
    },
    outOfPatternSettings: {
      get: async ({ companyId }) => {
        const [row] = await database
          .select({ value: companyExpenseAllocationSettings.outOfPatternThresholdPercent })
          .from(companyExpenseAllocationSettings)
          .where(eq(companyExpenseAllocationSettings.companyId, companyId))
          .limit(1)
        return row === undefined ? DEFAULT_OUT_OF_PATTERN_THRESHOLD : Number(row.value)
      },
      save: async ({ companyId, correlationId, thresholdPercent, updatedBy }) => {
        const value = thresholdPercent.toFixed(2)
        await database.transaction(async (transaction) => {
          // Uma linha por grupo rateável: a que faltar nasce com o critério padrão, que é o que valia sem ela.
          for (const costGroup of COMPANY_EXPENSE_ALLOCATABLE_GROUPS) {
            await transaction
              .insert(companyExpenseAllocationSettings)
              .values({
                companyId,
                costGroup,
                criterion: DEFAULT_ALLOCATION_SETTINGS[costGroup],
                outOfPatternThresholdPercent: value,
                updatedByUserId: updatedBy,
              })
              .onConflictDoUpdate({
                set: {
                  outOfPatternThresholdPercent: value,
                  updatedAt: new Date(),
                  updatedByUserId: updatedBy,
                },
                target: [
                  companyExpenseAllocationSettings.companyId,
                  companyExpenseAllocationSettings.costGroup,
                ],
              })
          }
          await transaction.insert(auditLogs).values({
            action: 'expense_out_of_pattern_settings.update',
            actorUserId: updatedBy,
            companyId,
            correlationId,
            entityId: companyId,
            entityType: 'expense_out_of_pattern_settings',
            metadata: { thresholdPercent },
            permission: AUDIT_PERMISSION,
            targetId: companyId,
            targetType: 'expense_out_of_pattern_settings',
          })
        })
        return thresholdPercent
      },
    },
  }
}
