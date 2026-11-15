/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4: as portas do módulo Contas sobre Drizzle. Toda consulta carrega `company_id`; o que é de outra
 * empresa simplesmente não aparece (o caso de uso responde 404, sem revelar existência).
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import {
  COMPANY_EXPENSE_DRIVER_CATEGORY_NAME,
  companyExpenseAmountChanges,
  companyExpenseCategories,
  companyExpenseOccurrences,
  companyExpenseOccurrenceTrips,
  companyExpenses,
} from '../../database/company-expense.schema.js'
import { fleetDrivers } from '../../database/fleet.schema.js'
import { identityUserProfiles } from '../../database/identity-user-profile.schema.js'
import { userCompanyMemberships } from '../../database/identity.schema.js'
import { auditLogs } from '../../database/fiscal-operation.schema.js'
import { formatFiscalDay } from '../../shared/fiscal-day.service.js'
import type {
  CompanyExpense,
  CompanyExpenseCategory,
  CompanyExpenseOccurrence,
  ExpenseAmountChange,
  ExpenseDriverRef,
  ExpenseOccurrenceListItem,
  ExpensePerson,
  ExpensesPorts,
} from '../application/expense.port.js'
import { resolveExpensePayeeProfile } from '../domain/expense-payee.policy.js'

/** Spec 328: a ficha de quem causou a conta, ao lado da do favorecido (`fleetDrivers`). */
const causedByDriver = alias(fleetDrivers, 'expense_caused_by_driver')
const causedByUserProfile = alias(identityUserProfiles, 'expense_caused_by_user')

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** RF2 + spec 329: as 14 categorias da semente (8 da migration inicial + consumo, internet/telefone, financiamentos e funcionários). */
const SEED_CATEGORIES = [
  ['Aluguel', false, 'administrative'],
  ['Folha', false, 'administrative'],
  ['Impostos', false, 'administrative'],
  ['Seguro', false, 'vehicle_fixed'],
  ['Manutenção', false, 'per_km'],
  ['Combustível', false, 'per_km'],
  [COMPANY_EXPENSE_DRIVER_CATEGORY_NAME, true, 'in_trip'],
  ['Outros', false, 'administrative'],
  ['Água e esgoto', false, 'administrative'],
  ['Energia elétrica', false, 'administrative'],
  ['Gás', false, 'administrative'],
  ['Internet e telefone', false, 'administrative'],
  ['Financiamentos', false, 'administrative'],
  ['Funcionários', false, 'administrative'],
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
    costGroup: toCostGroup(row.costGroup),
    id: row.id,
    name: row.name,
    requiresDriver: row.requiresDriver,
  }
}

function toExpense(row: ExpenseRow): CompanyExpense {
  return {
    active: row.active,
    anchorCompetence: formatFiscalDay(row.createdAt).slice(0, 7),
    billLocation: row.billLocation,
    billUrl: row.billUrl,
    causedByDriverId: row.causedByDriverId,
    causedByName: row.causedByName,
    causedByUserId: row.causedByUserId,
    categoryId: row.categoryId,
    companyId: row.companyId,
    dueDay: row.dueDay,
    expectedAmount: row.expectedAmount,
    id: row.id,
    installmentsTotal: row.installmentsTotal,
    kind: row.kind,
    name: row.name,
    payeeDriverId: row.payeeDriverId,
    recurrence: row.recurrence,
    vehicleId: row.vehicleId,
  }
}

function toAmountChange(row: typeof companyExpenseAmountChanges.$inferSelect): ExpenseAmountChange {
  return {
    changedByUserId: row.changedByUserId,
    createdAt: row.createdAt.toISOString(),
    effectiveCompetence: row.effectiveCompetence,
    expenseId: row.expenseId,
    id: row.id,
    kind: row.kind === 'correction' ? 'correction' : 'adjustment',
    newAmount: row.newAmount,
    previousAmount: row.previousAmount,
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
    installmentNumber: row.installmentNumber,
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
    amountChanges: {
      append: async (input) => {
        const [row] = await database
          .insert(companyExpenseAmountChanges)
          .values({
            changedByUserId: input.changedByUserId,
            companyId: input.companyId,
            effectiveCompetence: input.effectiveCompetence,
            expenseId: input.expenseId,
            kind: input.kind,
            newAmount: input.newAmount,
            previousAmount: input.previousAmount,
          })
          .returning()
        if (row === undefined)
          throw new Error('company_expense_amount_changes insert returned no row')
        return toAmountChange(row)
      },
      list: async ({ companyId, expenseId }) => {
        const rows = await database
          .select()
          .from(companyExpenseAmountChanges)
          .where(
            and(
              eq(companyExpenseAmountChanges.companyId, companyId),
              eq(companyExpenseAmountChanges.expenseId, expenseId),
            ),
          )
          .orderBy(
            asc(companyExpenseAmountChanges.effectiveCompetence),
            asc(companyExpenseAmountChanges.createdAt),
          )
        return rows.map(toAmountChange)
      },
    },
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
        const rows = SEED_CATEGORIES.map(([name, requiresDriver, costGroup], index) => ({
          companyId,
          costGroup,
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
      setCostGroup: async ({ categoryId, companyId, costGroup }) => {
        const [row] = await database
          .update(companyExpenseCategories)
          .set({ costGroup, updatedAt: new Date() })
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
    people: {
      isActiveMember: async ({ companyId, userId }) => {
        const [row] = await database
          .select({ id: userCompanyMemberships.id })
          .from(userCompanyMemberships)
          .where(
            and(
              eq(userCompanyMemberships.companyId, companyId),
              eq(userCompanyMemberships.userId, userId),
              eq(userCompanyMemberships.status, 'active'),
            ),
          )
          .limit(1)
        return row !== undefined
      },
      list: async ({ companyId }): Promise<readonly ExpensePerson[]> => {
        const drivers = await database
          .select({ id: fleetDrivers.id, name: fleetDrivers.name })
          .from(fleetDrivers)
          .where(and(eq(fleetDrivers.companyId, companyId), eq(fleetDrivers.status, 'active')))
        const users = await database
          .select({ id: identityUserProfiles.userId, name: identityUserProfiles.name })
          .from(userCompanyMemberships)
          .innerJoin(
            identityUserProfiles,
            eq(identityUserProfiles.userId, userCompanyMemberships.userId),
          )
          .where(
            and(
              eq(userCompanyMemberships.companyId, companyId),
              eq(userCompanyMemberships.status, 'active'),
            ),
          )
        return [
          ...drivers.map((row): ExpensePerson => ({ id: row.id, kind: 'driver', name: row.name })),
          ...users.map((row): ExpensePerson => ({ id: row.id, kind: 'user', name: row.name })),
        ].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      },
    },
    expenses: {
      create: async (input) => {
        const [created] = await database
          .insert(companyExpenses)
          .values({
            billLocation: input.billLocation ?? null,
            billUrl: input.billUrl ?? null,
            causedByDriverId: input.causedByDriverId ?? null,
            causedByName: input.causedByName ?? null,
            causedByUserId: input.causedByUserId ?? null,
            categoryId: input.categoryId,
            companyId: input.companyId,
            dueDay: input.dueDay,
            expectedAmount: input.expectedAmount,
            installmentsTotal: input.installmentsTotal ?? null,
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
      applyAmountFrom: async ({
        amount,
        companyId,
        expenseId,
        fromCompetence,
        onlyNotDue,
        today,
        untilCompetence,
      }) => {
        const rows = await database
          .update(companyExpenseOccurrences)
          .set({ expectedAmount: amount, updatedAt: new Date() })
          .where(
            and(
              eq(companyExpenseOccurrences.companyId, companyId),
              eq(companyExpenseOccurrences.expenseId, expenseId),
              eq(companyExpenseOccurrences.status, 'open'),
              sql`${companyExpenseOccurrences.competence} >= ${fromCompetence}`,
              ...(untilCompetence === null
                ? []
                : [sql`${companyExpenseOccurrences.competence} < ${untilCompetence}`]),
              ...(onlyNotDue ? [sql`${companyExpenseOccurrences.dueDate} >= ${today}::date`] : []),
              sql`not exists (select 1 from ${companyExpenseOccurrenceTrips} where ${companyExpenseOccurrenceTrips.occurrenceId} = ${companyExpenseOccurrences.id})`,
            ),
          )
          .returning({ id: companyExpenseOccurrences.id })
        return rows.length
      },
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
        // Spec 329: o valor da competência é o da última mudança com início até ela; sem mudança, o que veio.
        const inserted = await database
          .insert(companyExpenseOccurrences)
          .values({
            ...input,
            expectedAmount: sql`coalesce((
              select ${companyExpenseAmountChanges.newAmount} from ${companyExpenseAmountChanges}
              where ${companyExpenseAmountChanges.expenseId} = ${input.expenseId}::uuid
                and ${companyExpenseAmountChanges.effectiveCompetence} <= ${input.competence}
              order by ${companyExpenseAmountChanges.effectiveCompetence} desc, ${companyExpenseAmountChanges.createdAt} desc
              limit 1
            ), ${input.expectedAmount}::numeric)`,
          })
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
            causedByDriverId: companyExpenses.causedByDriverId,
            causedByDriverName: causedByDriver.name,
            causedByName: companyExpenses.causedByName,
            causedByUserId: companyExpenses.causedByUserId,
            causedByUserName: causedByUserProfile.name,
            billLocation: companyExpenses.billLocation,
            billUrl: companyExpenses.billUrl,
            categoryId: companyExpenses.categoryId,
            categoryName: companyExpenseCategories.name,
            driverCanDrive: fleetDrivers.canDrive,
            driverName: fleetDrivers.name,
            driverPaymentModel: fleetDrivers.paymentModel,
            expenseKind: companyExpenses.kind,
            expenseName: companyExpenses.name,
            installmentsTotal: companyExpenses.installmentsTotal,
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
          .leftJoin(
            causedByDriver,
            and(
              eq(causedByDriver.companyId, companyExpenses.companyId),
              eq(causedByDriver.id, companyExpenses.causedByDriverId),
            ),
          )
          .leftJoin(
            causedByUserProfile,
            eq(causedByUserProfile.userId, companyExpenses.causedByUserId),
          )
          .where(
            and(
              eq(companyExpenseOccurrences.companyId, companyId),
              filters.causedByUserId === undefined
                ? undefined
                : eq(companyExpenses.causedByUserId, filters.causedByUserId),
              filters.causedByName === undefined
                ? undefined
                : sql`lower(${companyExpenses.causedByName}) = lower(${filters.causedByName})`,
              filters.causedByDriverId === undefined
                ? undefined
                : eq(companyExpenses.causedByDriverId, filters.causedByDriverId),
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
            causedByDriverId: row.causedByDriverId,
            causedByDriverName: row.causedByDriverName,
            causedByName: row.causedByName,
            causedByUserId: row.causedByUserId,
            causedByUserName: row.causedByUserName,
            billLocation: row.billLocation,
            billUrl: row.billUrl,
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            expenseKind: row.expenseKind,
            expenseName: row.expenseName,
            installmentsTotal: row.installmentsTotal,
            payeeDriverId: row.payeeDriverId,
            payeeDriverName: row.driverName,
            payeeDriverPaymentModel:
              row.driverPaymentModel === null
                ? null
                : row.driverPaymentModel === 'route_table'
                  ? 'route_table'
                  : 'fixed',
            payeeProfile:
              row.driverCanDrive === null || row.driverPaymentModel === null
                ? null
                : resolveExpensePayeeProfile({
                    canDrive: row.driverCanDrive,
                    paymentModel: row.driverPaymentModel,
                  }),
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

/** O CHECK do banco só deixa os quatro grupos; qualquer outro valor é defeito e vira o padrão da categoria nova. */
export function toCostGroup(value: string): NonNullable<CompanyExpenseCategory['costGroup']> {
  return value === 'vehicle_fixed' || value === 'per_km' || value === 'in_trip'
    ? value
    : 'administrative'
}
