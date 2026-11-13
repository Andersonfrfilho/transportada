/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import { fleetDrivers, fleetVehicles } from './fleet.schema.js'
import { companies, identityUsers } from './identity.schema.js'

export const COMPANY_EXPENSE_KINDS = ['fixed', 'variable'] as const
export type CompanyExpenseKind = (typeof COMPANY_EXPENSE_KINDS)[number]

/** `fortnightly` (quinzenal) é a recorrência do pagamento de motorista (RF1b): vence nos dias 15 e último. */
export const COMPANY_EXPENSE_RECURRENCES = [
  'monthly',
  'bimonthly',
  'quarterly',
  'yearly',
  'fortnightly',
] as const
export type CompanyExpenseRecurrence = (typeof COMPANY_EXPENSE_RECURRENCES)[number]

export const COMPANY_EXPENSE_OCCURRENCE_STATUSES = ['open', 'paid', 'canceled'] as const
export type CompanyExpenseOccurrenceStatus = (typeof COMPANY_EXPENSE_OCCURRENCE_STATUSES)[number]

/** Nomes semeados por empresa (RF2). "Pagamento de motorista/agregado" é a única com `requires_driver`. */
export const COMPANY_EXPENSE_DRIVER_CATEGORY_NAME = 'Pagamento de motorista/agregado'

const inList = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ')

/** Spec 325 RF2: categorias de conta, cadastro da empresa (nome único; desativa em vez de apagar). */
export const companyExpenseCategories = pgTable(
  'company_expense_categories',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    /** RF1b: a categoria exige `payee_driver_id` na conta; as demais o recusam. */
    requiresDriver: boolean('requires_driver').notNull().default(false),
    active: boolean().notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_expense_categories_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_categories_company_id_id_unique').on(table.companyId, table.id),
    unique('company_expense_categories_company_name_unique').on(table.companyId, table.name),
  ],
)

/** Spec 325 RF1: a conta (fixa recorrente ou variável avulsa). */
export const companyExpenses = pgTable(
  'company_expenses',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    kind: varchar({ length: 16 }).$type<CompanyExpenseKind>().notNull(),
    categoryId: uuid('category_id').notNull(),
    expectedAmount: numeric('expected_amount', { precision: 14, scale: 2 }).notNull(),
    active: boolean().notNull().default(true),
    /** Só da fixa; nula na variável. */
    recurrence: varchar({ length: 16 }).$type<CompanyExpenseRecurrence>(),
    /** 1–31; mês curto cai no último dia. Quinzenal ignora (vence 15 e último). */
    dueDay: smallint('due_day'),
    /** RF1b: motorista/agregado pago pela conta (`fleet_drivers`, da mesma empresa). */
    payeeDriverId: uuid('payee_driver_id'),
    /** Dúvida 2: veículo opcional (seguro, IPVA, pneu), sem rateio. */
    vehicleId: uuid('vehicle_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_expenses_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.categoryId],
      foreignColumns: [companyExpenseCategories.companyId, companyExpenseCategories.id],
      name: 'company_expenses_category_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.payeeDriverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'company_expenses_payee_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.vehicleId],
      foreignColumns: [fleetVehicles.companyId, fleetVehicles.id],
      name: 'company_expenses_vehicle_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expenses_company_id_id_unique').on(table.companyId, table.id),
    index('company_expenses_company_idx').on(table.companyId, table.active, table.kind),
    index('company_expenses_payee_driver_idx')
      .on(table.companyId, table.payeeDriverId)
      .where(sql`${table.payeeDriverId} is not null`),
    check(
      'company_expenses_kind_check',
      sql`${table.kind} in (${sql.raw(inList(COMPANY_EXPENSE_KINDS))})`,
    ),
    check(
      'company_expenses_recurrence_check',
      sql`${table.recurrence} is null or ${table.recurrence} in (${sql.raw(inList(COMPANY_EXPENSE_RECURRENCES))})`,
    ),
    check('company_expenses_amount_check', sql`${table.expectedAmount} >= 0`),
    check(
      'company_expenses_due_day_check',
      sql`${table.dueDay} is null or ${table.dueDay} between 1 and 31`,
    ),
    /** Fixa tem recorrência (e dia, salvo a quinzenal); variável não tem nenhuma das duas. */
    check(
      'company_expenses_schedule_check',
      sql`(${table.kind} = 'fixed' and ${table.recurrence} is not null and (${table.recurrence} = 'fortnightly' or ${table.dueDay} is not null)) or (${table.kind} = 'variable' and ${table.recurrence} is null and ${table.dueDay} is null)`,
    ),
  ],
)

/**
 * Spec 325 RF3: o que vence. Chave natural `(expense_id, competence, slot)`: `slot` é 1 para toda
 * recorrência e 1/2 na quinzenal (dia 15 e último dia), então a mesma competência comporta as duas datas.
 * A variável tem exatamente uma ocorrência (`competence` do vencimento, `slot` 1).
 */
export const companyExpenseOccurrences = pgTable(
  'company_expense_occurrences',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    expenseId: uuid('expense_id').notNull(),
    /** `yyyy-mm`. */
    competence: varchar({ length: 7 }).notNull(),
    slot: smallint().notNull().default(1),
    /** Data civil de America/Sao_Paulo, sem hora. */
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    expectedAmount: numeric('expected_amount', { precision: 14, scale: 2 }).notNull(),
    status: varchar({ length: 16 })
      .$type<CompanyExpenseOccurrenceStatus>()
      .notNull()
      .default('open'),
    paidAmount: numeric('paid_amount', { precision: 14, scale: 2 }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    paidByUserId: uuid('paid_by_user_id'),
    settlementNote: text('settlement_note'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    canceledByUserId: uuid('canceled_by_user_id'),
    cancelReason: text('cancel_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.expenseId],
      foreignColumns: [companyExpenses.companyId, companyExpenses.id],
      name: 'company_expense_occurrences_expense_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.paidByUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_occurrences_paid_by_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.canceledByUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_occurrences_canceled_by_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_occurrences_company_id_id_unique').on(table.companyId, table.id),
    /** RF3/RF4: geração idempotente (`ON CONFLICT DO NOTHING`) mesmo com o cron rodando duas vezes. */
    unique('company_expense_occurrences_expense_competence_slot_unique').on(
      table.expenseId,
      table.competence,
      table.slot,
    ),
    index('company_expense_occurrences_due_idx').on(table.companyId, table.dueDate, table.status),
    check(
      'company_expense_occurrences_status_check',
      sql`${table.status} in (${sql.raw(inList(COMPANY_EXPENSE_OCCURRENCE_STATUSES))})`,
    ),
    check('company_expense_occurrences_slot_check', sql`${table.slot} in (1, 2)`),
    check(
      'company_expense_occurrences_competence_check',
      sql`${table.competence} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check('company_expense_occurrences_amount_check', sql`${table.expectedAmount} >= 0`),
    /** Baixa só com valor > 0, data e autor; os demais estados não carregam baixa. */
    check(
      'company_expense_occurrences_paid_check',
      sql`(${table.status} = 'paid' and ${table.paidAmount} > 0 and ${table.paidAt} is not null and ${table.paidByUserId} is not null) or (${table.status} <> 'paid' and ${table.paidAmount} is null and ${table.paidAt} is null and ${table.paidByUserId} is null)`,
    ),
    check(
      'company_expense_occurrences_canceled_check',
      sql`(${table.status} = 'canceled') = (${table.canceledAt} is not null)`,
    ),
  ],
)
