/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import { trips } from './trip.schema.js'

/**
 * ADR-0049 §2: **nenhuma parcela ausente vira zero silencioso.** Uma margem de 18% que na verdade é
 * "18% se o combustível estiver certo, e ele foi estimado" leva a decisão errada com mais confiança
 * do que nenhum número levaria.
 */
export const TRIP_FINANCIAL_SOURCES = ['measured', 'estimated', 'missing', 'period'] as const
export type TripFinancialSource = (typeof TRIP_FINANCIAL_SOURCES)[number]

/**
 * `cost` sai do bolso; `tax` desce da receita. Separar as duas naturezas é o que deixa a tela dizer
 * "faturou X, pagou Y de imposto, gastou Z" — que é como quem opera pensa.
 */
export const TRIP_FINANCIAL_NATURES = ['cost', 'tax'] as const
export type TripFinancialNature = (typeof TRIP_FINANCIAL_NATURES)[number]

export const TRIP_FINANCIAL_PARCEL_KINDS = [
  'driver',
  'fuel',
  'other_per_kilometer',
  'delivery_charges',
  'toll',
  'manual',
  'icms',
  'pis_cofins',
] as const
export type TripFinancialParcelKind = (typeof TRIP_FINANCIAL_PARCEL_KINDS)[number]

/**
 * ADR-0049 §5: viagem aberta calcula ao vivo; viagem `completed` **congela**, com os valores e as
 * premissas. Sem isso a viagem de março mudaria de margem em julho, e o histórico deixaria de servir
 * para comparar.
 *
 * O recálculo não sobrescreve: nasce uma versão nova, e a anterior fica. Ele acontece quando um CT-e
 * é cancelado ou uma taxa entra atrasada — caso real, e é por isso que precisa de rastro.
 */
export const tripFinancialResults = pgTable(
  'trip_financial_results',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    /** Só a versão viva responde "qual é o resultado desta viagem"; as outras são histórico. */
    isCurrent: boolean('is_current').notNull().default(true),
    revenueAmount: numeric('revenue_amount', { precision: 19, scale: 4 }).notNull(),
    /** Quantas notas da viagem já viraram CT-e autorizado, e quantas deveriam. */
    revenueDocumentCount: bigint('revenue_document_count', { mode: 'number' }).notNull(),
    revenueExpectedCount: bigint('revenue_expected_count', { mode: 'number' }).notNull(),
    taxTotal: numeric('tax_total', { precision: 19, scale: 4 }).notNull(),
    costTotal: numeric('cost_total', { precision: 19, scale: 4 }).notNull(),
    /** Receita − imposto − custo. Pode ser negativo, e negativo aparece: esconder seria mentir. */
    netAmount: numeric('net_amount', { precision: 19, scale: 4 }).notNull(),
    /**
     * `null` quando não há receita: margem sobre zero é −100% e engana. A tela mostra a ausência,
     * não o número.
     */
    marginRate: numeric('margin_rate', { precision: 9, scale: 6 }),
    /** Falso quando falta CT-e ou alguma parcela é `missing`: o número não é final, e diz isso. */
    isComplete: boolean('is_complete').notNull(),
    /** As premissas usadas — preço do combustível, distância, alíquotas. É o que torna o congelado auditável. */
    assumptions: jsonb().notNull().default({}),
    frozenAt: timestamp('frozen_at', { withTimezone: true }).notNull().defaultNow(),
    recalculationReason: text('recalculation_reason').notNull().default(''),
    actorUserId: uuid('actor_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'trip_financial_results_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_financial_results_company_trip_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('trip_financial_results_company_id_id_unique').on(table.companyId, table.id),
    unique('trip_financial_results_trip_version_unique').on(
      table.companyId,
      table.tripId,
      table.version,
    ),
    /** Uma versão viva por viagem: duas seriam duas respostas para "quanto essa viagem deu". */
    uniqueIndex('trip_financial_results_current_unique')
      .on(table.companyId, table.tripId)
      .where(sql`${table.isCurrent}`),
    index('trip_financial_results_frozen_idx').on(table.companyId, table.frozenAt),
    check('trip_financial_results_version_check', sql`${table.version} > 0`),
    check(
      'trip_financial_results_counts_check',
      sql`${table.revenueDocumentCount} >= 0 and ${table.revenueExpectedCount} >= ${table.revenueDocumentCount}`,
    ),
    check(
      'trip_financial_results_amounts_check',
      sql`${table.revenueAmount} >= 0 and ${table.taxTotal} >= 0 and ${table.costTotal} >= 0`,
    ),
    /**
     * Recálculo **exige motivo**: a versão 2 sem explicação é a pergunta "por que esse número mudou?"
     * sem resposta, seis meses depois.
     */
    check(
      'trip_financial_results_reason_check',
      sql`${table.version} = 1 or length(${table.recalculationReason}) > 0`,
    ),
  ],
)

export const tripFinancialParcels = pgTable(
  'trip_financial_parcels',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    resultId: uuid('result_id').notNull(),
    kind: text().$type<TripFinancialParcelKind>().notNull(),
    nature: text().$type<TripFinancialNature>().notNull(),
    amount: numeric({ precision: 19, scale: 4 }).notNull(),
    source: text().$type<TripFinancialSource>().notNull(),
    /** O porquê da origem, em uma linha: "consumo cadastrado × distância aproximada". */
    note: text().notNull().default(''),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.resultId],
      foreignColumns: [tripFinancialResults.companyId, tripFinancialResults.id],
      name: 'trip_financial_parcels_result_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('trip_financial_parcels_result_kind_unique').on(table.resultId, table.kind),
    check(
      'trip_financial_parcels_kind_check',
      sql`${table.kind} in (${sql.raw(inList(TRIP_FINANCIAL_PARCEL_KINDS))})`,
    ),
    check(
      'trip_financial_parcels_nature_check',
      sql`${table.nature} in (${sql.raw(inList(TRIP_FINANCIAL_NATURES))})`,
    ),
    check(
      'trip_financial_parcels_source_check',
      sql`${table.source} in (${sql.raw(inList(TRIP_FINANCIAL_SOURCES))})`,
    ),
    /** Parcela desconhecida ou de período é **zero com nome**: valor ali seria contradição. */
    check(
      'trip_financial_parcels_amount_check',
      sql`(${table.source} in ('missing', 'period') and ${table.amount} = 0) or ${table.amount} >= 0`,
    ),
  ],
)

export const TRIP_COST_ENTRY_KINDS = ['toll', 'other'] as const
export type TripCostEntryKind = (typeof TRIP_COST_ENTRY_KINDS)[number]

/** Spec 061 D2 / P3: o pedágio e o gasto avulso, lançados à mão na viagem. */
export const tripCostEntries = pgTable(
  'trip_cost_entries',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    tripId: uuid('trip_id').notNull(),
    kind: text().$type<TripCostEntryKind>().notNull(),
    amount: numeric({ precision: 19, scale: 4 }).notNull(),
    description: text().notNull().default(''),
    actorUserId: uuid('actor_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.tripId],
      foreignColumns: [trips.companyId, trips.id],
      name: 'trip_cost_entries_company_trip_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('trip_cost_entries_trip_idx').on(table.companyId, table.tripId),
    check(
      'trip_cost_entries_kind_check',
      sql`${table.kind} in (${sql.raw(inList(TRIP_COST_ENTRY_KINDS))})`,
    ),
    check('trip_cost_entries_amount_check', sql`${table.amount} > 0`),
  ],
)

export const COMPANY_FEDERAL_REGIMES = ['presumed', 'real', 'simple'] as const
export type CompanyFederalRegime = (typeof COMPANY_FEDERAL_REGIMES)[number]

/**
 * ADR-0049 §4: PIS/COFINS **não existe no CT-e** — é tributo federal sobre a receita, e a alíquota
 * depende do regime. Sem esta linha, a margem sai marcada como "sem os federais"; assumir um regime
 * erraria em silêncio para metade das instalações, com cara de número certo.
 *
 * As alíquotas são gravadas explicitamente, e não derivadas do regime: quem sabe a alíquota é o
 * contador da transportadora, e o regime aqui serve para a tela explicar o que ela está mostrando.
 */
export const companyTaxSettings = pgTable(
  'company_tax_settings',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    federalRegime: text('federal_regime').$type<CompanyFederalRegime>().notNull(),
    pisRate: numeric('pis_rate', { precision: 9, scale: 6 }).notNull(),
    cofinsRate: numeric('cofins_rate', { precision: 9, scale: 6 }).notNull(),
    updatedByUserId: uuid('updated_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_tax_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('company_tax_settings_company_unique').on(table.companyId),
    check(
      'company_tax_settings_regime_check',
      sql`${table.federalRegime} in (${sql.raw(inList(COMPANY_FEDERAL_REGIMES))})`,
    ),
    /** Alíquota é fração (0.0065), não percentual: guardar 0,65 aqui multiplicaria a conta por cem. */
    check(
      'company_tax_settings_rates_check',
      sql`${table.pisRate} >= 0 and ${table.pisRate} < 1 and ${table.cofinsRate} >= 0 and ${table.cofinsRate} < 1`,
    ),
  ],
)
