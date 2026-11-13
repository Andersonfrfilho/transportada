/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.5 (ADR-0116 §4): o que o resultado do mês lê, sobre Drizzle. Nada do rateio é gravado: só a configuração
 * do critério (`company_expense_allocation_settings`). Toda consulta carrega `company_id`.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, gte, lte, sql } from 'drizzle-orm'

import {
  COMPANY_EXPENSE_ALLOCATABLE_GROUPS,
  COMPANY_EXPENSE_ALLOCATION_CRITERIA,
  companyExpenseAllocationSettings,
  companyExpenseCategories,
  companyExpenseOccurrences,
  companyExpenseOccurrenceTrips,
  companyExpenses,
} from '../../database/company-expense.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import type { TripListFinancialsPort } from '../../trips/application/read-trip-list-financials.use-case.js'
import type {
  ExpenseAllocationSettingsPorts,
  ExpenseResultPorts,
} from '../application/expense-result.port.js'
import type {
  AllocatableCostGroup,
  AllocationCriterion,
} from '../domain/expense-allocation.policy.js'
import { createAllocationTripQuery } from './allocation-trip.query.js'
import { toCostGroup } from './drizzle-expenses.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const AUDIT_PERMISSION = 'expenses.manage'

function isAllocatableGroup(value: string): value is AllocatableCostGroup {
  return (COMPANY_EXPENSE_ALLOCATABLE_GROUPS as readonly string[]).includes(value)
}

function isCriterion(value: string): value is AllocationCriterion {
  return (COMPANY_EXPENSE_ALLOCATION_CRITERIA as readonly string[]).includes(value)
}

export function createDrizzleExpenseResultPorts(
  database: Database,
  financials: TripListFinancialsPort,
): ExpenseAllocationSettingsPorts & ExpenseResultPorts {
  const readSettings = async (
    companyId: string,
  ): Promise<Partial<Record<AllocatableCostGroup, AllocationCriterion>>> => {
    const rows = await database
      .select({
        costGroup: companyExpenseAllocationSettings.costGroup,
        criterion: companyExpenseAllocationSettings.criterion,
      })
      .from(companyExpenseAllocationSettings)
      .where(eq(companyExpenseAllocationSettings.companyId, companyId))
    const settings: Partial<Record<AllocatableCostGroup, AllocationCriterion>> = {}
    for (const row of rows) {
      if (isAllocatableGroup(row.costGroup) && isCriterion(row.criterion)) {
        settings[row.costGroup] = row.criterion
      }
    }
    return settings
  }

  return {
    allocationSettings: {
      get: ({ companyId }) => readSettings(companyId),
      save: async ({ companyId, correlationId, settings, updatedBy }) => {
        await database.transaction(async (transaction) => {
          for (const [costGroup, criterion] of Object.entries(settings)) {
            await transaction
              .insert(companyExpenseAllocationSettings)
              .values({ companyId, costGroup, criterion, updatedByUserId: updatedBy })
              .onConflictDoUpdate({
                set: { criterion, updatedAt: new Date(), updatedByUserId: updatedBy },
                target: [
                  companyExpenseAllocationSettings.companyId,
                  companyExpenseAllocationSettings.costGroup,
                ],
              })
          }
          await transaction.insert(auditLogs).values({
            action: 'expense_allocation_settings.update',
            actorUserId: updatedBy,
            companyId,
            correlationId,
            entityId: companyId,
            entityType: 'expense_allocation_settings',
            metadata: { settings },
            permission: AUDIT_PERMISSION,
            targetId: companyId,
            targetType: 'expense_allocation_settings',
          })
        })
        return readSettings(companyId)
      },
    },
    occurrences: {
      listForPeriod: async ({ companyId, from, to }) => {
        const includedTotal = sql<string>`coalesce((select sum(${companyExpenseOccurrenceTrips.amount})
          from ${companyExpenseOccurrenceTrips}
          where ${companyExpenseOccurrenceTrips.companyId} = ${companyExpenseOccurrences.companyId}
            and ${companyExpenseOccurrenceTrips.occurrenceId} = ${companyExpenseOccurrences.id}), 0)::numeric(14,2)::text`
        const rows = await database
          .select({
            costGroup: companyExpenseCategories.costGroup,
            expectedAmount: companyExpenseOccurrences.expectedAmount,
            expenseId: companyExpenses.id,
            includedTripsAmount: includedTotal,
            name: companyExpenses.name,
            occurrenceId: companyExpenseOccurrences.id,
            paidAmount: companyExpenseOccurrences.paidAmount,
            payeeDriverId: companyExpenses.payeeDriverId,
            status: companyExpenseOccurrences.status,
            vehicleId: companyExpenses.vehicleId,
          })
          .from(companyExpenseOccurrences)
          .innerJoin(
            companyExpenses,
            and(
              eq(companyExpenses.companyId, companyExpenseOccurrences.companyId),
              eq(companyExpenses.id, companyExpenseOccurrences.expenseId),
            ),
          )
          .innerJoin(
            companyExpenseCategories,
            and(
              eq(companyExpenseCategories.companyId, companyExpenses.companyId),
              eq(companyExpenseCategories.id, companyExpenses.categoryId),
            ),
          )
          .where(
            and(
              eq(companyExpenseOccurrences.companyId, companyId),
              gte(companyExpenseOccurrences.competence, from.slice(0, 7)),
              lte(companyExpenseOccurrences.competence, to.slice(0, 7)),
            ),
          )
          .orderBy(companyExpenseOccurrences.dueDate, companyExpenseOccurrences.id)
        return rows.map((row) => ({
          costGroup: toCostGroup(row.costGroup),
          expectedAmount: row.expectedAmount,
          expenseId: row.expenseId,
          includedTripsAmount: row.includedTripsAmount,
          name: row.name,
          occurrenceId: row.occurrenceId,
          paidAmount: row.paidAmount,
          payeeDriverId: row.payeeDriverId,
          status: row.status,
          vehicleId: row.vehicleId,
        }))
      },
    },
    trips: createAllocationTripQuery(database, financials),
  }
}
