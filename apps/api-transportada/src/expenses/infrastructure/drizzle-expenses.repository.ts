/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4: as portas do módulo Contas sobre Drizzle. Toda consulta carrega `company_id`; o que é de outra
 * empresa simplesmente não aparece (o caso de uso responde 404, sem revelar existência).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, sql } from 'drizzle-orm'

import {
  COMPANY_EXPENSE_DRIVER_CATEGORY_NAME,
  companyExpenseCategories,
  companyExpenseOccurrences,
  companyExpenses,
} from '../../database/company-expense.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'
import type {
  CompanyExpense,
  CompanyExpenseCategory,
  CompanyExpenseOccurrence,
  ExpenseDriverRef,
  ExpenseOccurrenceListItem,
  ExpensesPorts,
} from '../application/expense.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** RF2: as 8 categorias da semente, na ordem da migration. */
const SEED_CATEGORIES = [
  ['Aluguel', false],
  ['Folha', false],
  ['Impostos', false],
  ['Seguro', false],
  ['Manutenção', false],
  ['Combustível', false],
  [COMPANY_EXPENSE_DRIVER_CATEGORY_NAME, true],
  ['Outros', false],
] as const

const AUDIT_PERMISSION = 'expenses.manage'
/** A baixa grava a data civil como meio-dia de São Paulo: nenhum fuso a empurra para o dia vizinho. */
const NOON_SAO_PAULO = 'T12:00:00-03:00'

type CategoryRow = typeof companyExpenseCategories.$inferSelect
type ExpenseRow = typeof companyExpenses.$inferSelect
type OccurrenceRow = typeof companyExpenseOccurrences.$inferSelect

function toCategory(row: CategoryRow): CompanyExpenseCategory {
  return {
    active: row.active,
    id: row.id,
    name: row.name,
    requiresDriver: row.requiresDriver,
  }
}

function toExpense(row: ExpenseRow): CompanyExpense {
  return {
    active: row.active,
    anchorCompetence: formatFiscalDay(row.createdAt).slice(0, 7),
    categoryId: row.categoryId,
    companyId: row.companyId,
    dueDay: row.dueDay,
    expectedAmount: row.expectedAmount,
    id: row.id,
    kind: row.kind,
    name: row.name,
    payeeDriverId: row.payeeDriverId,
    recurrence: row.recurrence,
    vehicleId: row.vehicleId,
  }
}

function toOccurrence(row: OccurrenceRow): CompanyExpenseOccurrence {
  return {
    companyId: row.companyId,
    competence: row.competence,
    dueDate: row.dueDate,
    expectedAmount: row.expectedAmount,
    expenseId: row.expenseId,
    id: row.id,
    paidAmount: row.paidAmount,
    paidAt: row.paidAt === null ? null : formatFiscalDay(row.paidAt),
    paidBy: row.paidByUserId,
    settlementNote: row.settlementNote,
    slot: row.slot === 2 ? 2 : 1,
    status: row.status,
  }
}

export function createDrizzleExpensesPorts(database: Database): ExpensesPorts {
  return {
    audit: {
      append: async (entry) => {
        await database.insert(auditLogs).values({
          action: entry.action,
          actorUserId: entry.actorUserId,
          companyId: entry.companyId,
          correlationId: entry.correlationId,
          entityId: entry.entityId,
          entityType: entry.entityType,
          metadata: entry.metadata,
          permission: AUDIT_PERMISSION,
          targetId: entry.entityId,
          targetType: entry.entityType,
        })
      },
    },
    categories: {
      create: async ({ companyId, name }) => {
        const [next] = await database
          .select({
            value: sql<number>`coalesce(max(${companyExpenseCategories.displayOrder}), 0) + 1`,
          })
          .from(companyExpenseCategories)
          .where(eq(companyExpenseCategories.companyId, companyId))
        const [created] = await database
          .insert(companyExpenseCategories)
          .values({ companyId, displayOrder: next?.value ?? 1, name })
          .onConflictDoNothing({
            target: [companyExpenseCategories.companyId, companyExpenseCategories.name],
          })
          .returning()
        return created === undefined ? 'name_taken' : toCategory(created)
      },
      // Só semeia a empresa que não tem categoria nenhuma; a conta de desativar não apaga, então "nenhuma" é inédita.
      ensureSeeded: async ({ companyId }) => {
        const rows = SEED_CATEGORIES.map(([name, requiresDriver], index) => ({
          companyId,
          displayOrder: index + 1,
          name,
          requiresDriver,
        }))
        const [existing] = await database
          .select({ id: companyExpenseCategories.id })
          .from(companyExpenseCategories)
          .where(eq(companyExpenseCategories.companyId, companyId))
          .limit(1)
        if (existing !== undefined) return
        await database
          .insert(companyExpenseCategories)
          .values(rows)
          .onConflictDoNothing({
            target: [companyExpenseCategories.companyId, companyExpenseCategories.name],
          })
      },
      findById: async ({ categoryId, companyId }) => {
        const [row] = await database
          .select()
          .from(companyExpenseCategories)
          .where(
            and(
              eq(companyExpenseCategories.companyId, companyId),
              eq(companyExpenseCategories.id, categoryId),
            ),
          )
          .limit(1)
        return row === undefined ? null : toCategory(row)
      },
      list: async ({ companyId }) => {
        const rows = await database
          .select()
          .from(companyExpenseCategories)
          .where(eq(companyExpenseCategories.companyId, companyId))
          .orderBy(asc(companyExpenseCategories.displayOrder), asc(companyExpenseCategories.name))
        return rows.map(toCategory)
      },
      setActive: async ({ active, categoryId, companyId }) => {
        const [row] = await database
          .update(companyExpenseCategories)
          .set({ active, updatedAt: new Date() })
          .where(
            and(
              eq(companyExpenseCategories.companyId, companyId),
              eq(companyExpenseCategories.id, categoryId),
            ),
          )
          .returning()
        return row === undefined ? null : toCategory(row)
      },
    },
    drivers: {
      findById: async ({ companyId, driverId }): Promise<ExpenseDriverRef | null> => {
        const [row] = await database
          .select({ id: fleetDrivers.id, paymentModel: fleetDrivers.paymentModel })
          .from(fleetDrivers)
          .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.id, driverId)))
          .limit(1)
        if (row === undefined) return null
        return {
          id: row.id,
          paymentModel: row.paymentModel === 'route_table' ? 'route_table' : 'fixed',
        }
      },
    },
    expenses: {
      create: async (input) => {
        const [created] = await database
          .insert(companyExpenses)
          .values({
            categoryId: input.categoryId,
            companyId: input.companyId,
            dueDay: input.dueDay,
            expectedAmount: input.expectedAmount,
            kind: input.kind,
            name: input.name,
            payeeDriverId: input.payeeDriverId,
            recurrence: input.recurrence,
            vehicleId: input.vehicleId ?? null,
          })
          .returning()
        if (created === undefined) throw new Error('company_expenses insert returned no row')
        return toExpense(created)
      },
      findById: async ({ companyId, expenseId }) => {
        const [row] = await database
          .select()
          .from(companyExpenses)
          .where(and(eq(companyExpenses.companyId, companyId), eq(companyExpenses.id, expenseId)))
          .limit(1)
        return row === undefined ? null : toExpense(row)
      },
      list: async ({ companyId }) => {
        const rows = await database
          .select()
          .from(companyExpenses)
          .where(eq(companyExpenses.companyId, companyId))
          .orderBy(asc(companyExpenses.name))
        return rows.map(toExpense)
      },
      listActiveFixed: async ({ companyId }) => {
        const rows = await database
          .select()
          .from(companyExpenses)
          .where(
            and(
              eq(companyExpenses.companyId, companyId),
              eq(companyExpenses.active, true),
              eq(companyExpenses.kind, 'fixed'),
            ),
          )
        return rows.map(toExpense)
      },
      update: async ({ companyId, expenseId, ...changes }) => {
        const [row] = await database
          .update(companyExpenses)
          .set({ ...changes, updatedAt: new Date() })
          .where(and(eq(companyExpenses.companyId, companyId), eq(companyExpenses.id, expenseId)))
          .returning()
        return row === undefined ? null : toExpense(row)
      },
    },
    occurrences: {
      cancel: async ({ canceledBy, companyId, occurrenceId, reason }) => {
        const now = new Date()
        const [row] = await database
          .update(companyExpenseOccurrences)
          .set({
            canceledAt: now,
            canceledByUserId: canceledBy,
            cancelReason: reason,
            status: 'canceled',
            updatedAt: now,
          })
          .where(
            and(
              eq(companyExpenseOccurrences.companyId, companyId),
              eq(companyExpenseOccurrences.id, occurrenceId),
              eq(companyExpenseOccurrences.status, 'open'),
            ),
          )
          .returning()
        return row === undefined ? null : toOccurrence(row)
      },
      findById: async ({ companyId, occurrenceId }) => {
        const [row] = await database
          .select()
          .from(companyExpenseOccurrences)
          .where(
            and(
              eq(companyExpenseOccurrences.companyId, companyId),
              eq(companyExpenseOccurrences.id, occurrenceId),
            ),
          )
          .limit(1)
        return row === undefined ? null : toOccurrence(row)
      },
      insertIfAbsent: async (input) => {
        const inserted = await database
          .insert(companyExpenseOccurrences)
          .values(input)
          .onConflictDoNothing({
            target: [
              companyExpenseOccurrences.expenseId,
              companyExpenseOccurrences.competence,
              companyExpenseOccurrences.slot,
            ],
          })
          .returning({ id: companyExpenseOccurrences.id })
        return inserted.length > 0
      },
      list: async ({ companyId, filters }) => {
        const rows = await database
          .select({
            categoryId: companyExpenses.categoryId,
            categoryName: companyExpenseCategories.name,
            driverName: fleetDrivers.name,
            driverPaymentModel: fleetDrivers.paymentModel,
            expenseKind: companyExpenses.kind,
            expenseName: companyExpenses.name,
            occurrence: companyExpenseOccurrences,
            payeeDriverId: companyExpenses.payeeDriverId,
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
          .leftJoin(
            fleetDrivers,
            and(
              eq(fleetDrivers.companyId, companyExpenses.companyId),
              eq(fleetDrivers.id, companyExpenses.payeeDriverId),
            ),
          )
          .where(
            and(
              eq(companyExpenseOccurrences.companyId, companyId),
              filters.competence === undefined
                ? undefined
                : eq(companyExpenseOccurrences.competence, filters.competence),
              filters.status === undefined
                ? undefined
                : eq(companyExpenseOccurrences.status, filters.status),
              filters.kind === undefined ? undefined : eq(companyExpenses.kind, filters.kind),
              filters.categoryId === undefined
                ? undefined
                : eq(companyExpenses.categoryId, filters.categoryId),
              filters.driverId === undefined
                ? undefined
                : eq(companyExpenses.payeeDriverId, filters.driverId),
            ),
          )
          .orderBy(asc(companyExpenseOccurrences.dueDate), desc(companyExpenseOccurrences.slot))
        return rows.map(
          (row): ExpenseOccurrenceListItem => ({
            ...toOccurrence(row.occurrence),
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            expenseKind: row.expenseKind,
            expenseName: row.expenseName,
            payeeDriverId: row.payeeDriverId,
            payeeDriverName: row.driverName,
            payeeDriverPaymentModel:
              row.driverPaymentModel === null
                ? null
                : row.driverPaymentModel === 'route_table'
                  ? 'route_table'
                  : 'fixed',
          }),
        )
      },
      markPaid: async ({ occurrenceId, paidAmount, paidAt, paidBy, settlementNote }) => {
        const now = new Date()
        const [row] = await database
          .update(companyExpenseOccurrences)
          .set({
            paidAmount,
            paidAt: new Date(`${paidAt}${NOON_SAO_PAULO}`),
            paidByUserId: paidBy,
            settlementNote,
            status: 'paid',
            updatedAt: now,
          })
          .where(
            and(
              eq(companyExpenseOccurrences.id, occurrenceId),
              eq(companyExpenseOccurrences.status, 'open'),
            ),
          )
          .returning()
        return row === undefined ? null : toOccurrence(row)
      },
    },
  }
}
