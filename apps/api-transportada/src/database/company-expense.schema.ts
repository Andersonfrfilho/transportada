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

/** Spec 325 RF26/RF29 (T7.2): canais do lembrete e canais de onde vem a baixa por resposta. */
export const COMPANY_EXPENSE_REMINDER_KINDS = ['before', 'due_today', 'overdue'] as const
export const COMPANY_EXPENSE_REMINDER_CHANNELS = ['email', 'push', 'whatsapp'] as const
export const COMPANY_EXPENSE_REPLY_CHANNELS = ['email', 'whatsapp'] as const

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
    /** RF24 (T7.2): quem recebe os lembretes de vencimento; nulo → os administradores da empresa. */
    responsibleUserId: uuid('responsible_user_id'),
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
      columns: [table.responsibleUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expenses_responsible_user_fk',
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
    /** RF30 (T7.2): canal e hora da baixa por resposta ("paguei"); nulos quando a baixa foi dada pelo painel (RF5). */
    settledViaChannel: varchar('settled_via_channel', { length: 16 }).$type<
      (typeof COMPANY_EXPENSE_REPLY_CHANNELS)[number]
    >(),
    settledByReplyAt: timestamp('settled_by_reply_at', { withTimezone: true }),
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
    /** RF30/RF31: canal e hora andam juntos e só existem em ocorrência paga (o desfazer os zera ao reabrir). */
    check(
      'company_expense_occurrences_reply_check',
      sql`(${table.settledViaChannel} is null) = (${table.settledByReplyAt} is null) and (${table.settledViaChannel} is null or ${table.status} = 'paid') and (${table.settledViaChannel} is null or ${table.settledViaChannel} in (${sql.raw(inList(COMPANY_EXPENSE_REPLY_CHANNELS))}))`,
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

/**
 * Spec 325 RF25/RF26/RF27 (T7.2): a configuração dos lembretes, uma linha por empresa. Sem linha vale o padrão
 * (`DEFAULT_REMINDER_SETTINGS`: 3 dias antes, até 3 avisos de atraso, só e-mail, sem resumo). E-mail é sempre o
 * padrão (RF26) e por isso não tem coluna de desligar além da `email_enabled`, que nasce ligada.
 */
export const companyExpenseReminderSettings = pgTable(
  'company_expense_reminder_settings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    daysBefore: smallint('days_before').notNull().default(3),
    maxOverdueNotices: smallint('max_overdue_notices').notNull().default(3),
    emailEnabled: boolean('email_enabled').notNull().default(true),
    whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
    pushEnabled: boolean('push_enabled').notNull().default(false),
    /** RF27: resumo diário opcional; hora cheia em America/Sao_Paulo (padrão 08:00). */
    dailySummaryEnabled: boolean('daily_summary_enabled').notNull().default(false),
    dailySummaryHour: smallint('daily_summary_hour').notNull().default(8),
    updatedByUserId: uuid('updated_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_expense_reminder_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.updatedByUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_reminder_settings_updated_by_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_reminder_settings_company_unique').on(table.companyId),
    check(
      'company_expense_reminder_settings_days_check',
      sql`${table.daysBefore} between 0 and 30 and ${table.maxOverdueNotices} between 0 and 10`,
    ),
    check(
      'company_expense_reminder_settings_summary_hour_check',
      sql`${table.dailySummaryHour} between 0 and 23`,
    ),
  ],
)

/**
 * Spec 325 RF26 (T7.3): o canal que **a pessoa** quer, além do e-mail. Uma linha por pessoa e empresa; sem linha,
 * só e-mail. WhatsApp e push nascem desligados (opt-in): aviso de dinheiro no celular de alguém só sai porque ela
 * pediu. Não há coluna de e-mail de propósito: o e-mail é o canal que garante que o aviso chega (RF26), e quem não
 * quer recebê-lo pede ao administrador para trocar o responsável da conta. O canal ainda precisa estar ligado na
 * empresa (`company_expense_reminder_settings`) e o WhatsApp, de um número verificado (`user_whatsapp_phones`).
 */
export const companyExpenseReminderPreferences = pgTable(
  'company_expense_reminder_preferences',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
    pushEnabled: boolean('push_enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_expense_reminder_preferences_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_reminder_preferences_user_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_reminder_preferences_company_user_unique').on(
      table.companyId,
      table.userId,
    ),
  ],
)

/**
 * Spec 325 RF28 (T7.2): o registro dos avisos enviados. A chave única `(ocorrência, responsável, dia, tipo)` é o que
 * torna a rotina idempotente: gravar com `ON CONFLICT DO NOTHING` e só enviar quando a linha entrou (a porta
 * `sent.record` devolve `false` na repetição). O canal não entra na chave: um aviso por pessoa e dia (T7.1).
 */
export const companyExpenseRemindersSent = pgTable(
  'company_expense_reminders_sent',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    recipientUserId: uuid('recipient_user_id').notNull(),
    /** Dia civil de America/Sao_Paulo em que o aviso saiu. */
    day: date({ mode: 'string' }).notNull(),
    kind: varchar({ length: 16 }).notNull(),
    channel: varchar({ length: 16 }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [companyExpenseOccurrences.companyId, companyExpenseOccurrences.id],
      name: 'company_expense_reminders_sent_occurrence_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.recipientUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_reminders_sent_recipient_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_reminders_sent_key_unique').on(
      table.occurrenceId,
      table.recipientUserId,
      table.day,
      table.kind,
    ),
    index('company_expense_reminders_sent_day_idx').on(table.companyId, table.day),
    check(
      'company_expense_reminders_sent_kind_check',
      sql`${table.kind} in (${sql.raw(inList(COMPANY_EXPENSE_REMINDER_KINDS))})`,
    ),
    check(
      'company_expense_reminders_sent_channel_check',
      sql`${table.channel} in (${sql.raw(inList(COMPANY_EXPENSE_REMINDER_CHANNELS))})`,
    ),
  ],
)

/** Spec 325 RF27/RF28 (T7.2): o resumo diário enviado, um por pessoa e dia (idempotência da rotina). */
export const companyExpenseSummariesSent = pgTable(
  'company_expense_summaries_sent',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    recipientUserId: uuid('recipient_user_id').notNull(),
    day: date({ mode: 'string' }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_expense_summaries_sent_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.recipientUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_summaries_sent_recipient_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_summaries_sent_key_unique').on(
      table.companyId,
      table.recipientUserId,
      table.day,
    ),
  ],
)

/**
 * Spec 325 RF29 (T7.2): o link assinado do botão "Já paguei" do e-mail. Uso único, com validade; guarda só o **hash**
 * do token (SHA-256, hex), nunca o token. `used_at` é gravado por `consume` na mesma transação da baixa.
 */
export const companyExpenseReplyLinks = pgTable(
  'company_expense_reply_links',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    occurrenceId: uuid('occurrence_id').notNull(),
    recipientUserId: uuid('recipient_user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.occurrenceId],
      foreignColumns: [companyExpenseOccurrences.companyId, companyExpenseOccurrences.id],
      name: 'company_expense_reply_links_occurrence_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.recipientUserId],
      foreignColumns: [identityUsers.id],
      name: 'company_expense_reply_links_recipient_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_expense_reply_links_token_hash_unique').on(table.tokenHash),
    index('company_expense_reply_links_occurrence_idx').on(table.occurrenceId),
    check(
      'company_expense_reply_links_token_hash_check',
      sql`${table.tokenHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
)
