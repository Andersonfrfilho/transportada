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
import { trips } from './trip.schema.js'

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

/**
 * ADR-0116 §1: o grupo de custo da categoria. `in_trip` (pagamento de motorista/agregado) não é rateado: o custo já está
 * na viagem. Categoria nova nasce `administrative`.
 */
export const COMPANY_EXPENSE_COST_GROUPS = [
  'vehicle_fixed',
  'per_km',
  'administrative',
  'in_trip',
] as const
export type CompanyExpenseCostGroup = (typeof COMPANY_EXPENSE_COST_GROUPS)[number]

/** Os grupos que o rateio divide (todos menos `in_trip`) e os critérios possíveis (ADR-0116 §2). */
export const COMPANY_EXPENSE_ALLOCATABLE_GROUPS = [
  'vehicle_fixed',
  'per_km',
  'administrative',
] as const
export const COMPANY_EXPENSE_ALLOCATION_CRITERIA = [
  'per_km',
  'per_trip_day',
  'per_revenue',
  'equal',
] as const
export type CompanyExpenseAllocationCriterion = (typeof COMPANY_EXPENSE_ALLOCATION_CRITERIA)[number]

/** Padrão sem configuração (RF11), espelhado em `DEFAULT_ALLOCATION_SETTINGS` e na semente da migration. */
export const COMPANY_EXPENSE_DEFAULT_CRITERION: Readonly<
  Record<(typeof COMPANY_EXPENSE_ALLOCATABLE_GROUPS)[number], CompanyExpenseAllocationCriterion>
> = { administrative: 'per_revenue', per_km: 'per_km', vehicle_fixed: 'per_km' }

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
    /** ADR-0116 §1: grupo de custo do rateio; categoria nova nasce `administrative`. */
    costGroup: varchar('cost_group', { length: 16 }).notNull().default('administrative'),
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
    check(
      'company_expense_categories_cost_group_check',
      sql.raw(`"cost_group" in (${inList(COMPANY_EXPENSE_COST_GROUPS)})`),
    ),
  ],
)

/**
 * Spec 325 ADR-0116 §2: o critério de rateio da empresa, uma linha por grupo rateável. Sem linha vale o padrão
 * (`COMPANY_EXPENSE_DEFAULT_CRITERION`), então empresa nova não precisa de semente.
 */
export const companyExpenseAllocationSettings = pgTable(
  'company_expense_allocation_settings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    costGroup: varchar('cost_group', { length: 16 }).notNull(),
    criterion: varchar({ length: 16 }).notNull(),
    updatedByUserId: uuid('updated_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_expense_allocation_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.updatedByUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_allocation_settings_updated_by_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_allocation_settings_company_group_unique').on(
      table.companyId,
      table.costGroup,
    ),
    check(
      'company_expense_allocation_settings_cost_group_check',
      sql.raw(`"cost_group" in (${inList(COMPANY_EXPENSE_ALLOCATABLE_GROUPS)})`),
    ),
    check(
      'company_expense_allocation_settings_criterion_check',
      sql.raw(`"criterion" in (${inList(COMPANY_EXPENSE_ALLOCATION_CRITERIA)})`),
    ),
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

/**
 * Spec 325 RF1d/RF1e: qual parcela de pessoal da viagem o pagamento cobre. `driver` é a diária do condutor (143),
 * `helper` a do ajudante (149, T1.4c). São as duas parcelas de pessoa de `trip_financial_parcels`.
 */
export const COMPANY_EXPENSE_TRIP_PARCEL_KINDS = ['driver', 'helper'] as const
export type CompanyExpenseTripParcelKind = (typeof COMPANY_EXPENSE_TRIP_PARCEL_KINDS)[number]

/**
 * Spec 325 RF1d (T1.4b): as viagens que um pagamento de motorista/agregado/ajudante cobre. O valor é **copiado** da
 * linha da pessoa na parcela já calculada da viagem (diária × dias, 143/149) no momento da inclusão: a viagem continua
 * dona do custo, e este módulo nunca o soma de novo (ADR-0115).
 *
 * Chave `unique(trip_id, parcel_kind, driver_id)`: a parte de uma pessoa numa parcela da viagem é paga uma vez só.
 * `parcel_kind` já nasce aqui para a T1.4c (ajudante) entrar sem migration; `driver_id` entra na chave porque a
 * parcela soma a tripulação inteira daquele papel (dois condutores, ou dois ajudantes, são duas pessoas a pagar).
 */
export const companyExpenseOccurrenceTrips = pgTable(
  'company_expense_occurrence_trips',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    parcelKind: varchar('parcel_kind', { length: 16 })
      .$type<CompanyExpenseTripParcelKind>()
      .notNull(),
    /** A pessoa paga: o favorecido da conta, na tripulação da viagem com o papel da parcela. */
    driverId: uuid('driver_id').notNull(),
    /** A linha da pessoa na parcela, arredondada ao centavo (meio para cima) na cópia. */
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    dailyAmount: numeric('daily_amount', { precision: 19, scale: 4 }).notNull(),
    days: integer().notNull(),
    /** Data civil de America/Sao_Paulo em que a viagem foi concluída, copiada na inclusão. */
    completedOn: date('completed_on', { mode: 'string' }).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [companyExpenseOccurrences.companyId, companyExpenseOccurrences.id],
      name: 'company_expense_occurrence_trips_occurrence_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'company_expense_occurrence_trips_trip_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.driverId],
      foreignColumns: [fleetDrivers.companyId, fleetDrivers.id],
      name: 'company_expense_occurrence_trips_driver_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_occurrence_trips_created_by_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** CA05c: a parte de uma pessoa numa parcela da viagem entra em no máximo um pagamento. */
    unique('company_expense_occurrence_trips_trip_parcel_driver_unique').on(
      table.tripId,
      table.parcelKind,
      table.driverId,
    ),
    index('company_expense_occurrence_trips_occurrence_idx').on(
      table.companyId,
      table.occurrenceId,
    ),
    check(
      'company_expense_occurrence_trips_parcel_kind_check',
      sql`${table.parcelKind} in (${sql.raw(inList(COMPANY_EXPENSE_TRIP_PARCEL_KINDS))})`,
    ),
    check('company_expense_occurrence_trips_amount_check', sql`${table.amount} >= 0`),
    check('company_expense_occurrence_trips_daily_amount_check', sql`${table.dailyAmount} >= 0`),
    check('company_expense_occurrence_trips_days_check', sql`${table.days} >= 1`),
  ],
)
