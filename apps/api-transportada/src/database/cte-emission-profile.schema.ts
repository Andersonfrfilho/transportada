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
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { freightRules } from './freight.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { inList } from './schema-check.constant.js'

export const CTE_EMISSION_PROFILE_STATUSES = ['draft', 'active', 'inactive'] as const
export type CteEmissionProfileStatus = (typeof CTE_EMISSION_PROFILE_STATUSES)[number]

export const CTE_EMISSION_PROFILE_MATCH_MODES = ['sender_tax_id', 'manual'] as const
export type CteEmissionProfileMatchMode = (typeof CTE_EMISSION_PROFILE_MATCH_MODES)[number]

export const CTE_EMISSION_GROUPING_MODES = ['per_invoice', 'sender_recipient'] as const
export type CteEmissionGroupingMode = (typeof CTE_EMISSION_GROUPING_MODES)[number]

/** toma3/toma — quem paga o frete. */
export const CTE_TAKERS = ['0', '1', '2', '3'] as const
export type CteTaker = (typeof CTE_TAKERS)[number]

/** tpServ — 0 normal, 1 subcontratação, 2 redespacho, 3 redespacho intermediário, 4 sem desempenho. */
export const CTE_SERVICE_TYPES = ['0', '1', '2', '3', '4'] as const
export type CteServiceType = (typeof CTE_SERVICE_TYPES)[number]

export const CTE_MODALS = ['01', '02', '03', '04', '05'] as const
export type CteModal = (typeof CTE_MODALS)[number]

/** indIEToma — 1 contribuinte, 2 isento, 9 não contribuinte. */
export const CTE_RECEIVER_IE_INDICATORS = ['1', '2', '9'] as const
export type CteReceiverIeIndicator = (typeof CTE_RECEIVER_IE_INDICATORS)[number]

export const CTE_PICKUP_INDICATORS = ['0', '1'] as const
export type CtePickupIndicator = (typeof CTE_PICKUP_INDICATORS)[number]

export const CTE_PREDOMINANT_PRODUCT_MODES = [
  'highest_value',
  'highest_weight',
  'highest_quantity',
  'fixed',
] as const
export type CtePredominantProductMode = (typeof CTE_PREDOMINANT_PRODUCT_MODES)[number]

export const CTE_ICMS_CSTS = ['00', '20', '40', '41', '51', '60', '90'] as const
export type CteIcmsCst = (typeof CTE_ICMS_CSTS)[number]

export const CTE_EMISSION_MATCH_ROLES = ['sender', 'recipient'] as const
export type CteEmissionMatchRole = (typeof CTE_EMISSION_MATCH_ROLES)[number]

export const CTE_CHARGE_CALCULATION_TYPES = [
  'percentage_of_cargo',
  'percentage_of_freight',
  'fixed_amount',
] as const
export type CteChargeCalculationType = (typeof CTE_CHARGE_CALCULATION_TYPES)[number]

/** natOp cabe em 60 caracteres no layout 4.00 — o CT-e de referência chega truncado nesse limite. */
const OPERATION_NATURE_MAX_LENGTH = 60

/** xDetRetira aceita 160 caracteres no layout 4.00. */
export const PICKUP_DETAILS_MAX_LENGTH = 160

const moneyColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })
const rateColumn = (name: string) => numeric(name, { precision: 9, scale: 6 })

export const cteEmissionProfiles = pgTable(
  'cte_emission_profiles',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    status: text().$type<CteEmissionProfileStatus>().notNull().default('draft'),
    priority: bigint({ mode: 'bigint' }).notNull().default(10n),
    matchMode: text('match_mode').$type<CteEmissionProfileMatchMode>().notNull(),
    groupingMode: text('grouping_mode').$type<CteEmissionGroupingMode>().notNull(),
    freightRuleId: uuid('freight_rule_id').notNull(),
    taker: text().$type<CteTaker>().notNull(),
    serviceType: text('service_type').$type<CteServiceType>().notNull().default('0'),
    modal: text().$type<CteModal>().notNull().default('01'),
    cfopInternal: text('cfop_internal').notNull(),
    cfopInterstate: text('cfop_interstate').notNull(),
    operationNature: text('operation_nature').notNull(),
    receiverIeIndicator: text('receiver_ie_indicator')
      .$type<CteReceiverIeIndicator>()
      .notNull()
      .default('1'),
    pickupIndicator: text('pickup_indicator').$type<CtePickupIndicator>().notNull().default('1'),
    pickupDetails: text('pickup_details').notNull().default(''),
    predominantProductMode: text('predominant_product_mode')
      .$type<CtePredominantProductMode>()
      .notNull()
      .default('highest_value'),
    predominantProductName: text('predominant_product_name').notNull().default(''),
    deliveryDays: bigint('delivery_days', { mode: 'bigint' }).notNull().default(0n),
    chargeComponentLabel: text('charge_component_label').notNull(),
    observations: text().notNull().default(''),
    icmsCst: text('icms_cst').$type<CteIcmsCst>().notNull(),
    icmsRate: rateColumn('icms_rate').notNull().default('0'),
    icmsBaseReductionRate: rateColumn('icms_base_reduction_rate').notNull().default('0'),
    cargoInsuranceDeclared: boolean('cargo_insurance_declared').notNull().default(true),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_emission_profiles_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightRuleId],
      foreignColumns: [freightRules.companyId, freightRules.id],
      name: 'cte_emission_profiles_company_freight_rule_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cte_emission_profiles_author_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_emission_profiles_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_emission_profiles_company_id_name_unique').on(table.companyId, table.name),
    index('cte_emission_profiles_company_status_priority_idx').on(
      table.companyId,
      table.status,
      table.priority,
    ),
    check(
      'cte_emission_profiles_status_check',
      sql`${table.status} in (${sql.raw(inList(CTE_EMISSION_PROFILE_STATUSES))})`,
    ),
    check(
      'cte_emission_profiles_match_mode_check',
      sql`${table.matchMode} in (${sql.raw(inList(CTE_EMISSION_PROFILE_MATCH_MODES))})`,
    ),
    check(
      'cte_emission_profiles_grouping_mode_check',
      sql`${table.groupingMode} in (${sql.raw(inList(CTE_EMISSION_GROUPING_MODES))})`,
    ),
    check(
      'cte_emission_profiles_taker_check',
      sql`${table.taker} in (${sql.raw(inList(CTE_TAKERS))})`,
    ),
    check(
      'cte_emission_profiles_service_type_check',
      sql`${table.serviceType} in (${sql.raw(inList(CTE_SERVICE_TYPES))})`,
    ),
    check(
      'cte_emission_profiles_modal_check',
      sql`${table.modal} in (${sql.raw(inList(CTE_MODALS))})`,
    ),
    check(
      'cte_emission_profiles_cfop_check',
      sql`${table.cfopInternal} ~ '^[0-9]{4}$' and ${table.cfopInterstate} ~ '^[0-9]{4}$'`,
    ),
    check(
      'cte_emission_profiles_receiver_ie_indicator_check',
      sql`${table.receiverIeIndicator} in (${sql.raw(inList(CTE_RECEIVER_IE_INDICATORS))})`,
    ),
    check(
      'cte_emission_profiles_pickup_indicator_check',
      sql`${table.pickupIndicator} in (${sql.raw(inList(CTE_PICKUP_INDICATORS))})`,
    ),
    check(
      'cte_emission_profiles_pickup_details_check',
      sql`length(${table.pickupDetails}) <= ${sql.raw(String(PICKUP_DETAILS_MAX_LENGTH))} and (${table.pickupIndicator} = '0' or length(${table.pickupDetails}) = 0)`,
    ),
    check(
      'cte_emission_profiles_predominant_product_mode_check',
      sql`${table.predominantProductMode} in (${sql.raw(inList(CTE_PREDOMINANT_PRODUCT_MODES))})`,
    ),
    check(
      'cte_emission_profiles_predominant_product_check',
      sql`(${table.predominantProductMode} = 'fixed') = (length(${table.predominantProductName}) > 0)`,
    ),
    check(
      'cte_emission_profiles_icms_cst_check',
      sql`${table.icmsCst} in (${sql.raw(inList(CTE_ICMS_CSTS))})`,
    ),
    check(
      'cte_emission_profiles_icms_rate_check',
      sql`${table.icmsRate} >= 0 and ${table.icmsRate} <= 1 and ${table.icmsBaseReductionRate} >= 0 and ${table.icmsBaseReductionRate} <= 1`,
    ),
    check(
      'cte_emission_profiles_operation_nature_check',
      sql`length(${table.operationNature}) > 0 and length(${table.operationNature}) <= ${sql.raw(String(OPERATION_NATURE_MAX_LENGTH))}`,
    ),
    check(
      'cte_emission_profiles_charge_component_label_check',
      sql`length(${table.chargeComponentLabel}) > 0`,
    ),
    check('cte_emission_profiles_delivery_days_check', sql`${table.deliveryDays} >= 0`),
    check('cte_emission_profiles_priority_check', sql`${table.priority} > 0`),
    check('cte_emission_profiles_version_check', sql`${table.version} > 0`),
    check('cte_emission_profiles_name_check', sql`length(${table.name}) > 0`),
  ],
)

export const cteEmissionProfileMatchers = pgTable(
  'cte_emission_profile_matchers',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    profileId: uuid('profile_id').notNull(),
    taxId: text('tax_id').notNull(),
    matchRole: text('match_role').$type<CteEmissionMatchRole>().notNull().default('sender'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_emission_profile_matchers_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.profileId],
      foreignColumns: [cteEmissionProfiles.companyId, cteEmissionProfiles.id],
      name: 'cte_emission_profile_matchers_company_profile_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('cte_emission_profile_matchers_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_emission_profile_matchers_company_tax_id_role_unique').on(
      table.companyId,
      table.taxId,
      table.matchRole,
    ),
    check(
      'cte_emission_profile_matchers_tax_id_check',
      sql`${table.taxId} ~ '^[0-9]{8}$' or ${table.taxId} ~ '^[0-9]{14}$'`,
    ),
    check(
      'cte_emission_profile_matchers_match_role_check',
      sql`${table.matchRole} in (${sql.raw(inList(CTE_EMISSION_MATCH_ROLES))})`,
    ),
  ],
)

export const cteEmissionProfileComponents = pgTable(
  'cte_emission_profile_components',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    profileId: uuid('profile_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    label: text().notNull(),
    calculationType: text('calculation_type').$type<CteChargeCalculationType>().notNull(),
    rate: rateColumn('rate'),
    amount: moneyColumn('amount'),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_emission_profile_components_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.profileId],
      foreignColumns: [cteEmissionProfiles.companyId, cteEmissionProfiles.id],
      name: 'cte_emission_profile_components_company_profile_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('cte_emission_profile_components_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_emission_profile_components_profile_ordinal_unique').on(
      table.companyId,
      table.profileId,
      table.ordinal,
    ),
    index('cte_emission_profile_components_company_profile_valid_from_idx').on(
      table.companyId,
      table.profileId,
      table.validFrom,
    ),
    check(
      'cte_emission_profile_components_calculation_type_check',
      sql`${table.calculationType} in (${sql.raw(inList(CTE_CHARGE_CALCULATION_TYPES))})`,
    ),
    check(
      'cte_emission_profile_components_value_coherence_check',
      sql`case when ${table.calculationType} = 'fixed_amount' then ${table.amount} is not null and ${table.rate} is null else ${table.rate} is not null and ${table.amount} is null end`,
    ),
    check(
      'cte_emission_profile_components_rate_check',
      sql`${table.rate} is null or (${table.rate} >= 0 and ${table.rate} <= 1)`,
    ),
    check(
      'cte_emission_profile_components_amount_check',
      sql`${table.amount} is null or ${table.amount} >= 0`,
    ),
    check(
      'cte_emission_profile_components_validity_check',
      sql`${table.validUntil} is null or ${table.validUntil} >= ${table.validFrom}`,
    ),
    check('cte_emission_profile_components_ordinal_check', sql`${table.ordinal} > 0`),
    check('cte_emission_profile_components_label_check', sql`length(${table.label}) > 0`),
  ],
)
