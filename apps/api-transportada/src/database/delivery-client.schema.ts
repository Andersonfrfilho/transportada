/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * CPF de onze dígitos ou CNPJ alfanumérico (IN RFB 2229/2024): letra só nas doze posições da base,
 * dígitos verificadores sempre numéricos. Mesma forma canônica do resto do produto — sem máscara e
 * em caixa alta.
 */
const TAX_ID_OR_CNPJ_PATTERN = '^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$'
const IBGE_CITY_PATTERN = '^[0-9]{7}$'

export const DELIVERY_CLIENT_STATUSES = ['active', 'inactive'] as const
export type DeliveryClientStatus = (typeof DELIVERY_CLIENT_STATUSES)[number]

/**
 * ADR-0048 §1: o cadastro **nasce da nota**, com identidade e sem regra. `requires_scheduling`,
 * `delivery_fee_amount` e `default_service_time_minutes` ficam vazios até alguém preenchê-los —
 * e é essa distinção que deixa "ausência de janela" ser ausência, e não "janela não preenchida".
 *
 * ⚠️ `tax_id` é dado de pessoa quando é CPF: nunca em log (`security.md` §1), e a busca é por
 * igualdade exata — nunca `LIKE`, que permitiria varrer a base documento a documento.
 */
export const deliveryClients = pgTable(
  'delivery_clients',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: text('tax_id').notNull(),
    /** O nome visto na última nota. A criação automática atualiza este; nunca as regras. */
    displayName: text('display_name').notNull().default(''),
    requiresScheduling: boolean('requires_scheduling').notNull().default(false),
    /** Expectativa, não fato: alimenta o solver e a previsão. O que aconteceu vive em `delivery_charges`. */
    deliveryFeeAmount: numeric('delivery_fee_amount', { precision: 14, scale: 4 }),
    defaultServiceTimeMinutes: bigint('default_service_time_minutes', { mode: 'number' }),
    notes: text().notNull().default(''),
    status: text().$type<DeliveryClientStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'delivery_clients_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('delivery_clients_company_tax_id_unique').on(table.companyId, table.taxId),
    unique('delivery_clients_company_id_id_unique').on(table.companyId, table.id),
    check(
      'delivery_clients_status_check',
      sql`${table.status} in (${sql.raw(inList(DELIVERY_CLIENT_STATUSES))})`,
    ),
    check(
      'delivery_clients_tax_id_check',
      sql`${table.taxId} ~ ${sql.raw(`'${TAX_ID_OR_CNPJ_PATTERN}'`)}`,
    ),
    check(
      'delivery_clients_fee_check',
      sql`${table.deliveryFeeAmount} is null or ${table.deliveryFeeAmount} >= 0`,
    ),
    check(
      'delivery_clients_service_time_check',
      sql`${table.defaultServiceTimeMinutes} is null or ${table.defaultServiceTimeMinutes} > 0`,
    ),
  ],
)

export const CONTRACTOR_CLOSING_PERIODS = ['fortnightly', 'monthly'] as const
export type ContractorClosingPeriod = (typeof CONTRACTOR_CLOSING_PERIODS)[number]

/**
 * ADR-0048 §1: o **contratante** é o embarcador — quem descarrega a carga no barracão e contratou o
 * frete. Ele já está em toda nota (é o emitente), e por isso nasce sozinho pelo mesmo caminho.
 *
 * O que ele guarda é diferente do cliente de entrega: o cliente guarda hora e taxa; o contratante
 * guarda o **período de fechamento** e para quem o relatório vai.
 */
export const contractors = pgTable(
  'contractors',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    taxId: text('tax_id').notNull(),
    displayName: text('display_name').notNull().default(''),
    closingPeriod: text('closing_period')
      .$type<ContractorClosingPeriod>()
      .notNull()
      .default('monthly'),
    /** Para onde o relatório do lote vai. Vazio é lote que se exporta à mão. */
    reportEmail: text('report_email').notNull().default(''),
    notes: text().notNull().default(''),
    status: text().$type<DeliveryClientStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'contractors_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('contractors_company_tax_id_unique').on(table.companyId, table.taxId),
    unique('contractors_company_id_id_unique').on(table.companyId, table.id),
    check(
      'contractors_status_check',
      sql`${table.status} in (${sql.raw(inList(DELIVERY_CLIENT_STATUSES))})`,
    ),
    check('contractors_tax_id_check', sql`${table.taxId} ~ ${sql.raw(`'${TAX_ID_OR_CNPJ_PATTERN}'`)}`),
    check(
      'contractors_closing_period_check',
      sql`${table.closingPeriod} in (${sql.raw(inList(CONTRACTOR_CLOSING_PERIODS))})`,
    ),
  ],
)

/**
 * Spec 060 D2: a janela é **lista**, não duas colunas — o cliente que recebe 8h–11h e 14h–16h tem o
 * almoço fechado no meio, e é esse buraco que duas colunas não representam.
 *
 * `weekday` é 0 (domingo) a 6 (sábado), a numeração de `EXTRACT(dow)` do Postgres — a mesma que a
 * consulta usa, para não haver conversão no meio do caminho.
 */
export const deliveryClientWindows = pgTable(
  'delivery_client_windows',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    deliveryClientId: uuid('delivery_client_id').notNull(),
    weekday: bigint({ mode: 'number' }).notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.deliveryClientId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.id],
      name: 'delivery_client_windows_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('delivery_client_windows_client_idx').on(table.companyId, table.deliveryClientId),
    check('delivery_client_windows_weekday_check', sql`${table.weekday} between 0 and 6`),
    /**
     * A janela que cruza a meia-noite (22h–02h) é gravada como **dois** intervalos, um em cada dia:
     * aceitar `closes_at < opens_at` faria toda consulta de "abre agora?" carregar a exceção.
     */
    check('delivery_client_windows_interval_check', sql`${table.opensAt} < ${table.closesAt}`),
  ],
)

export const DELIVERY_CLIENT_EXCEPTION_KINDS = ['closed', 'open'] as const
export type DeliveryClientExceptionKind = (typeof DELIVERY_CLIENT_EXCEPTION_KINDS)[number]

/**
 * Spec 060 D2/D2b: a data que foge da semana. `closed` fecha o dia inteiro (balanço, inventário);
 * `open` abre num horário próprio — e é ela que **vence o feriado do município** (ADR-0048 §3).
 */
export const deliveryClientExceptions = pgTable(
  'delivery_client_exceptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    deliveryClientId: uuid('delivery_client_id').notNull(),
    exceptionOn: date('exception_on').notNull(),
    kind: text().$type<DeliveryClientExceptionKind>().notNull(),
    opensAt: time('opens_at'),
    closesAt: time('closes_at'),
    reason: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.deliveryClientId],
      foreignColumns: [deliveryClients.companyId, deliveryClients.id],
      name: 'delivery_client_exceptions_client_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    index('delivery_client_exceptions_client_idx').on(
      table.companyId,
      table.deliveryClientId,
      table.exceptionOn,
    ),
    check(
      'delivery_client_exceptions_kind_check',
      sql`${table.kind} in (${sql.raw(inList(DELIVERY_CLIENT_EXCEPTION_KINDS))})`,
    ),
    /** `open` sem horário é uma exceção que não diz nada; `closed` com horário é contradição. */
    check(
      'delivery_client_exceptions_hours_check',
      sql`(${table.kind} = 'closed' and ${table.opensAt} is null and ${table.closesAt} is null) or (${table.kind} = 'open' and ${table.opensAt} is not null and ${table.closesAt} is not null and ${table.opensAt} < ${table.closesAt})`,
    ),
  ],
)

/**
 * ADR-0048 §3: o feriado é **do município**. Quando a cidade fecha, fecham os quarenta clientes de
 * lá, e repetir a data em quarenta cadastros é o caminho mais curto para trinta e nove ficarem
 * desatualizados.
 *
 * Alimentado à mão: nenhuma fonte pública de feriado municipal é confiável o bastante para virar
 * dependência. Data sem cadastro é dia útil.
 */
export const municipalHolidays = pgTable(
  'municipal_holidays',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    cityIbgeCode: text('city_ibge_code').notNull(),
    holidayOn: date('holiday_on').notNull(),
    name: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'municipal_holidays_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('municipal_holidays_company_city_day_unique').on(
      table.companyId,
      table.cityIbgeCode,
      table.holidayOn,
    ),
    check(
      'municipal_holidays_city_check',
      sql`${table.cityIbgeCode} ~ ${sql.raw(`'${IBGE_CITY_PATTERN}'`)}`,
    ),
    check('municipal_holidays_name_check', sql`length(${table.name}) > 0`),
  ],
)
