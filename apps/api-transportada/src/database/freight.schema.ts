/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { nfeDocuments } from './nfe.schema.js'

export const FREIGHT_RULE_TYPES = ['percentage_of_invoice_total'] as const
export type FreightRuleType = (typeof FREIGHT_RULE_TYPES)[number]

export const FREIGHT_RULE_STATUSES = ['draft', 'active', 'inactive'] as const
export type FreightRuleStatus = (typeof FREIGHT_RULE_STATUSES)[number]

export const FREIGHT_CALCULATION_STATUSES = ['snapshotted', 'rejected'] as const
export type FreightCalculationStatus = (typeof FREIGHT_CALCULATION_STATUSES)[number]

const moneyColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })
const percentageColumn = (name: string) => numeric(name, { precision: 9, scale: 6 })

export const freightRules = pgTable(
  'freight_rules',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    name: text().notNull(),
    description: text(),
    type: text().$type<FreightRuleType>().notNull(),
    status: text().$type<FreightRuleStatus>().notNull(),
    priority: bigint({ mode: 'bigint' }).notNull(),
    currentVersion: bigint('current_version', { mode: 'bigint' }).notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('freight_rules_company_id_id_unique').on(table.companyId, table.id),
    unique('freight_rules_company_id_name_unique').on(table.companyId, table.name),
    index('freight_rules_company_id_status_type_priority_idx').on(
      table.companyId,
      table.status,
      table.type,
      table.priority,
    ),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'freight_rules_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('freight_rules_type_check', sql`${table.type} in ('percentage_of_invoice_total')`),
    check('freight_rules_status_check', sql`${table.status} in ('draft', 'active', 'inactive')`),
    check('freight_rules_priority_check', sql`${table.priority} > 0`),
    check('freight_rules_current_version_check', sql`${table.currentVersion} > 0`),
  ],
)

export const freightRuleVersions = pgTable(
  'freight_rule_versions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    freightRuleId: uuid('freight_rule_id').notNull(),
    version: bigint({ mode: 'bigint' }).notNull(),
    status: text().$type<FreightRuleStatus>().notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    percentage: percentageColumn('percentage').notNull(),
    minimumAmount: moneyColumn('minimum_amount'),
    maximumAmount: moneyColumn('maximum_amount'),
    filters: jsonb().notNull(),
    snapshot: jsonb().notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('freight_rule_versions_company_id_id_unique').on(table.companyId, table.id),
    unique('freight_rule_versions_company_rule_version_unique').on(
      table.companyId,
      table.freightRuleId,
      table.version,
    ),
    index('freight_rule_versions_company_rule_validity_idx').on(
      table.companyId,
      table.freightRuleId,
      table.status,
      table.validFrom,
      table.validUntil,
    ),
    foreignKey({
      columns: [table.companyId, table.freightRuleId],
      foreignColumns: [freightRules.companyId, freightRules.id],
      name: 'freight_rule_versions_company_rule_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'freight_rule_versions_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'freight_rule_versions_status_check',
      sql`${table.status} in ('draft', 'active', 'inactive')`,
    ),
    check('freight_rule_versions_version_check', sql`${table.version} > 0`),
    check(
      'freight_rule_versions_percentage_check',
      sql`${table.percentage} >= 0 and ${table.percentage} <= 1`,
    ),
    check(
      'freight_rule_versions_amounts_check',
      sql`(${table.minimumAmount} is null or ${table.minimumAmount} >= 0) and (${table.maximumAmount} is null or ${table.maximumAmount} >= 0) and (${table.minimumAmount} is null or ${table.maximumAmount} is null or ${table.minimumAmount} <= ${table.maximumAmount})`,
    ),
    check(
      'freight_rule_versions_validity_check',
      sql`${table.validUntil} is null or ${table.validUntil} >= ${table.validFrom}`,
    ),
  ],
)

export const freightCalculations = pgTable(
  'freight_calculations',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    freightRuleId: uuid('freight_rule_id').notNull(),
    freightRuleVersionId: uuid('freight_rule_version_id').notNull(),
    ruleVersion: bigint('rule_version', { mode: 'bigint' }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    status: text().$type<FreightCalculationStatus>().notNull(),
    baseAmount: moneyColumn('base_amount').notNull(),
    percentage: percentageColumn('percentage').notNull(),
    calculatedAmount: moneyColumn('calculated_amount').notNull(),
    minimumAmount: moneyColumn('minimum_amount'),
    maximumAmount: moneyColumn('maximum_amount'),
    totalAmount: moneyColumn('total_amount').notNull(),
    adjustments: jsonb().notNull(),
    ruleSnapshot: jsonb('rule_snapshot').notNull(),
    calculationDetails: jsonb('calculation_details').notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('freight_calculations_company_id_id_unique').on(table.companyId, table.id),
    unique('freight_calculations_company_id_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    index('freight_calculations_company_nfe_created_at_idx').on(
      table.companyId,
      table.nfeDocumentId,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'freight_calculations_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightRuleId],
      foreignColumns: [freightRules.companyId, freightRules.id],
      name: 'freight_calculations_company_rule_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightRuleId, table.ruleVersion],
      foreignColumns: [
        freightRuleVersions.companyId,
        freightRuleVersions.freightRuleId,
        freightRuleVersions.version,
      ],
      name: 'freight_calculations_company_rule_version_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightRuleVersionId],
      foreignColumns: [freightRuleVersions.companyId, freightRuleVersions.id],
      name: 'freight_calculations_company_rule_version_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'freight_calculations_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('freight_calculations_status_check', sql`${table.status} in ('snapshotted', 'rejected')`),
    check('freight_calculations_rule_version_check', sql`${table.ruleVersion} > 0`),
    check(
      'freight_calculations_percentage_check',
      sql`${table.percentage} >= 0 and ${table.percentage} <= 1`,
    ),
    check(
      'freight_calculations_amounts_check',
      sql`${table.baseAmount} >= 0 and ${table.calculatedAmount} >= 0 and ${table.totalAmount} >= 0 and (${table.minimumAmount} is null or ${table.minimumAmount} >= 0) and (${table.maximumAmount} is null or ${table.maximumAmount} >= 0) and (${table.minimumAmount} is null or ${table.maximumAmount} is null or ${table.minimumAmount} <= ${table.maximumAmount})`,
    ),
  ],
)
