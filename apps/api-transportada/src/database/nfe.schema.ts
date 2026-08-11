/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, identityUsers, userCompanyMemberships } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'

export const NFE_IMPORT_SOURCES = ['upload', 'distribution'] as const
export type NfeImportSource = (typeof NFE_IMPORT_SOURCES)[number]

export const NFE_ORIGIN_TRIGGERS = ['user', 'automation'] as const
export type NfeOriginTrigger = (typeof NFE_ORIGIN_TRIGGERS)[number]

export const NFE_IMPORT_STATUSES = [
  'pending',
  'queued',
  'processing',
  'completed',
  'partially_processed',
  'failed',
  'cancelled',
] as const
export type NfeImportStatus = (typeof NFE_IMPORT_STATUSES)[number]

export const NFE_ITEM_STATUSES = [
  'pending',
  'validating',
  'imported',
  'duplicated',
  'invalid',
  'rejected',
  'failed',
] as const
export type NfeItemStatus = (typeof NFE_ITEM_STATUSES)[number]

export const NFE_ITEM_VARIANTS = ['complete', 'summary', 'event'] as const
export type NfeItemVariant = (typeof NFE_ITEM_VARIANTS)[number]

export const NFE_FISCAL_ENVIRONMENTS = ['homologation', 'production'] as const
export type NfeFiscalEnvironment = (typeof NFE_FISCAL_ENVIRONMENTS)[number]

export const NFE_DOCUMENT_STATUSES = ['authorized', 'cancelled', 'denied', 'unsigned'] as const
export type NfeDocumentStatus = (typeof NFE_DOCUMENT_STATUSES)[number]

const decimalColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })

export const nfeImports = pgTable(
  'nfe_imports',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    source: text().$type<NfeImportSource>().notNull(),
    triggeredBy: text('triggered_by').$type<NfeOriginTrigger>().notNull().default('user'),
    automationJob: text('automation_job'),
    requestedByUserId: uuid('requested_by_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    status: text().$type<NfeImportStatus>().notNull(),
    receivedCount: bigint('received_count', { mode: 'bigint' }).notNull().default(0n),
    processedCount: bigint('processed_count', { mode: 'bigint' }).notNull().default(0n),
    importedCount: bigint('imported_count', { mode: 'bigint' }).notNull().default(0n),
    duplicatedCount: bigint('duplicated_count', { mode: 'bigint' }).notNull().default(0n),
    invalidCount: bigint('invalid_count', { mode: 'bigint' }).notNull().default(0n),
    rejectedCount: bigint('rejected_count', { mode: 'bigint' }).notNull().default(0n),
    failedCount: bigint('failed_count', { mode: 'bigint' }).notNull().default(0n),
    terminalError: jsonb('terminal_error'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_imports_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_imports_company_id_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.requestedByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfe_imports_requested_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('nfe_imports_source_check', sql`${table.source} in ('upload', 'distribution')`),
    check(
      'nfe_imports_origin_ck',
      sql`(${table.triggeredBy} = 'user' and ${table.automationJob} is null) or (${table.triggeredBy} = 'automation' and ${table.automationJob} is not null)`,
    ),
    check(
      'nfe_imports_status_check',
      sql`${table.status} in ('pending', 'queued', 'processing', 'completed', 'partially_processed', 'failed', 'cancelled')`,
    ),
    check(
      'nfe_imports_counters_check',
      sql`${table.receivedCount} >= 0 and ${table.processedCount} >= 0 and ${table.importedCount} >= 0 and ${table.duplicatedCount} >= 0 and ${table.invalidCount} >= 0 and ${table.rejectedCount} >= 0 and ${table.failedCount} >= 0 and ${table.processedCount} <= ${table.receivedCount} and ${table.processedCount} = ${table.importedCount} + ${table.duplicatedCount} + ${table.invalidCount} + ${table.rejectedCount} + ${table.failedCount}`,
    ),
    check('nfe_imports_version_check', sql`${table.version} > 0`),
  ],
)

export const nfeImportItems = pgTable(
  'nfe_import_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    importId: uuid('import_id').notNull(),
    previousItemId: uuid('previous_item_id'),
    previousAttempt: bigint('previous_attempt', { mode: 'bigint' }),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    sourceName: text('source_name').notNull(),
    sourceObjectId: uuid('source_object_id').notNull(),
    sourceSha256: text('source_sha256').notNull(),
    sourceEntry: text('source_entry').notNull(),
    variant: text().$type<NfeItemVariant>(),
    accessKey: text('access_key'),
    sourceNsu: text('source_nsu'),
    environment: text().$type<NfeFiscalEnvironment>(),
    status: text().$type<NfeItemStatus>().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(1n),
    error: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_import_items_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_import_items_company_id_import_id_ordinal_attempt_unique').on(
      table.companyId,
      table.importId,
      table.ordinal,
      table.attempt,
    ),
    unique('nfe_import_items_company_id_import_id_source_attempt_unique').on(
      table.companyId,
      table.importId,
      table.sourceSha256,
      table.sourceEntry,
      table.attempt,
    ),
    unique('nfe_import_items_lineage_target_unique').on(
      table.companyId,
      table.id,
      table.sourceObjectId,
      table.sourceSha256,
      table.sourceEntry,
      table.attempt,
    ),
    uniqueIndex('nfe_import_items_company_environment_source_nsu_unique')
      .on(table.companyId, table.environment, table.sourceNsu)
      .where(sql`${table.sourceNsu} is not null`),
    uniqueIndex('nfe_import_items_company_previous_item_unique')
      .on(table.companyId, table.previousItemId)
      .where(sql`${table.previousItemId} is not null`),
    foreignKey({
      columns: [table.companyId, table.importId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'nfe_import_items_company_import_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.sourceObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfe_import_items_company_source_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [
        table.companyId,
        table.previousItemId,
        table.sourceObjectId,
        table.sourceSha256,
        table.sourceEntry,
        table.previousAttempt,
      ],
      foreignColumns: [
        table.companyId,
        table.id,
        table.sourceObjectId,
        table.sourceSha256,
        table.sourceEntry,
        table.attempt,
      ],
      name: 'nfe_import_items_lineage_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('nfe_import_items_ordinal_check', sql`${table.ordinal} > 0`),
    check('nfe_import_items_attempt_check', sql`${table.attempt} > 0`),
    check('nfe_import_items_sha256_check', sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      'nfe_import_items_status_check',
      sql`${table.status} in ('pending', 'validating', 'imported', 'duplicated', 'invalid', 'rejected', 'failed')`,
    ),
    check(
      'nfe_import_items_variant_check',
      sql`${table.variant} is null or ${table.variant} in ('complete', 'summary', 'event')`,
    ),
    check(
      'nfe_import_items_access_key_check',
      sql`${table.accessKey} is null or ${table.accessKey} ~ '^[0-9]{44}$'`,
    ),
    check(
      'nfe_import_items_distribution_source_presence_check',
      sql`(${table.sourceNsu} is null) = (${table.environment} is null)`,
    ),
    check(
      'nfe_import_items_source_nsu_check',
      sql`${table.sourceNsu} is null or ${table.sourceNsu} ~ '^[0-9]{15}$'`,
    ),
    check(
      'nfe_import_items_environment_check',
      sql`${table.environment} is null or ${table.environment} in ('homologation', 'production')`,
    ),
    check(
      'nfe_import_items_attempt_history_check',
      sql`(${table.attempt} = 1 and ${table.previousItemId} is null and ${table.previousAttempt} is null) or (${table.attempt} > 1 and ${table.previousItemId} is not null and ${table.previousAttempt} is not null and ${table.attempt} = ${table.previousAttempt} + 1)`,
    ),
    check(
      'nfe_import_items_previous_item_check',
      sql`${table.previousItemId} is null or ${table.previousItemId} <> ${table.id}`,
    ),
  ],
)

export const nfeDocuments = pgTable(
  'nfe_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    accessKey: text('access_key').notNull(),
    model: text().notNull(),
    number: text().notNull(),
    series: text().notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    operationNature: text('operation_nature').notNull(),
    operationType: text('operation_type').notNull(),
    status: text().$type<NfeDocumentStatus>().notNull(),
    source: text().$type<NfeImportSource>().notNull(),
    totalValue: decimalColumn('total_value').notNull(),
    productsValue: decimalColumn('products_value').notNull(),
    freightValue: decimalColumn('freight_value').default('0'),
    insuranceValue: decimalColumn('insurance_value').default('0'),
    discountValue: decimalColumn('discount_value').default('0'),
    otherExpensesValue: decimalColumn('other_expenses_value').default('0'),
    additionalInformation: text('additional_information'),
    authorizationProtocol: text('authorization_protocol'),
    xmlObjectId: uuid('xml_object_id').notNull(),
    xmlSha256: text('xml_sha256').notNull(),
    importId: uuid('import_id').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_documents_company_id_access_key_unique').on(table.companyId, table.accessKey),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfe_documents_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.importId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'nfe_documents_company_import_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.createdByUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'nfe_documents_created_by_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('nfe_documents_access_key_check', sql`${table.accessKey} ~ '^[0-9]{44}$'`),
    check('nfe_documents_model_check', sql`${table.model} = '55'`),
    check('nfe_documents_number_check', sql`${table.number} ~ '^[0-9]{1,9}$'`),
    check('nfe_documents_series_check', sql`${table.series} ~ '^[0-9]{1,3}$'`),
    check('nfe_documents_operation_type_check', sql`${table.operationType} in ('0', '1')`),
    check(
      'nfe_documents_status_check',
      sql`${table.status} in ('authorized', 'cancelled', 'denied', 'unsigned')`,
    ),
    check(
      'nfe_documents_authorization_protocol_presence_check',
      sql`(${table.status} = 'unsigned') or (${table.authorizationProtocol} is not null)`,
    ),
    check('nfe_documents_source_check', sql`${table.source} in ('upload', 'distribution')`),
    check(
      'nfe_documents_values_check',
      sql`${table.totalValue} >= 0 and ${table.productsValue} >= 0 and ${table.freightValue} >= 0 and ${table.insuranceValue} >= 0 and ${table.discountValue} >= 0 and ${table.otherExpensesValue} >= 0`,
    ),
    check('nfe_documents_sha256_check', sql`${table.xmlSha256} ~ '^[0-9a-f]{64}$'`),
  ],
)

export const nfeParticipants = pgTable(
  'nfe_participants',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    role: text().notNull(),
    taxId: text('tax_id'),
    legalName: text('legal_name'),
    tradeName: text('trade_name'),
    stateRegistration: text('state_registration'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_participants_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_participants_company_document_role_unique').on(
      table.companyId,
      table.documentId,
      table.role,
    ),
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_participants_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

export const nfeAddresses = pgTable(
  'nfe_addresses',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    participantId: uuid('participant_id').notNull(),
    street: text(),
    number: text(),
    complement: text(),
    district: text(),
    cityCode: text('city_code'),
    city: text(),
    state: text(),
    postalCode: text('postal_code'),
    countryCode: text('country_code'),
    phone: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.participantId],
      foreignColumns: [nfeParticipants.companyId, nfeParticipants.id],
      name: 'nfe_addresses_company_participant_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)

export const nfeVolumes = pgTable(
  'nfe_volumes',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    quantity: decimalColumn('quantity').default('0'),
    species: text(),
    grossWeight: decimalColumn('gross_weight').default('0'),
    netWeight: decimalColumn('net_weight').default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_volumes_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_volumes_values_check',
      sql`${table.ordinal} > 0 and ${table.quantity} >= 0 and ${table.grossWeight} >= 0 and ${table.netWeight} >= 0`,
    ),
  ],
)

export const nfeProducts = pgTable(
  'nfe_products',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    documentId: uuid('document_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    code: text().notNull(),
    description: text().notNull(),
    ncm: text().notNull(),
    cfop: text().notNull(),
    commercialUnit: text('commercial_unit').notNull(),
    quantity: decimalColumn('quantity').notNull(),
    unitValue: decimalColumn('unit_value').notNull(),
    totalValue: decimalColumn('total_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId, table.documentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'nfe_products_company_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'nfe_products_values_check',
      sql`${table.ordinal} > 0 and ${table.quantity} >= 0 and ${table.unitValue} >= 0 and ${table.totalValue} >= 0`,
    ),
  ],
)

export const nfeEvents = pgTable(
  'nfe_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    targetAccessKey: text('target_access_key').notNull(),
    eventType: text('event_type').notNull(),
    eventSequence: bigint('event_sequence', { mode: 'bigint' }).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    xmlObjectId: uuid('xml_object_id').notNull(),
    sourceNsu: text('source_nsu'),
    environment: text().$type<NfeFiscalEnvironment>(),
    metadata: jsonb(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('nfe_events_company_id_id_unique').on(table.companyId, table.id),
    unique('nfe_events_company_access_key_type_sequence_unique').on(
      table.companyId,
      table.targetAccessKey,
      table.eventType,
      table.eventSequence,
    ),
    uniqueIndex('nfe_events_company_environment_source_nsu_unique')
      .on(table.companyId, table.environment, table.sourceNsu)
      .where(sql`${table.sourceNsu} is not null`),
    foreignKey({
      columns: [table.companyId, table.xmlObjectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'nfe_events_company_xml_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('nfe_events_access_key_check', sql`${table.targetAccessKey} ~ '^[0-9]{44}$'`),
    check('nfe_events_sequence_check', sql`${table.eventSequence} > 0`),
    check(
      'nfe_events_distribution_source_presence_check',
      sql`(${table.sourceNsu} is null) = (${table.environment} is null)`,
    ),
    check(
      'nfe_events_source_nsu_check',
      sql`${table.sourceNsu} is null or ${table.sourceNsu} ~ '^[0-9]{15}$'`,
    ),
    check(
      'nfe_events_environment_check',
      sql`${table.environment} is null or ${table.environment} in ('homologation', 'production')`,
    ),
  ],
)

export const nfeDistributionCursors = pgTable(
  'nfe_distribution_cursors',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    environment: text().$type<NfeFiscalEnvironment>().notNull(),
    ultNsu: text('ult_nsu').notNull().default('000000000000000'),
    maxNsu: text('max_nsu').notNull().default('000000000000000'),
    nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true }),
    consecutiveRateLimits: integer('consecutive_rate_limits').notNull().default(0),
    lastSkippedFromNsu: text('last_skipped_from_nsu'),
    lastSkippedToNsu: text('last_skipped_to_nsu'),
    lastSkippedAt: timestamp('last_skipped_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.environment],
      name: 'nfe_distribution_cursors_company_environment_pk',
    }),
    check(
      'nfe_distribution_cursors_environment_check',
      sql`${table.environment} in ('homologation', 'production')`,
    ),
    check('nfe_distribution_cursors_ult_nsu_check', sql`${table.ultNsu} ~ '^[0-9]{15}$'`),
    check('nfe_distribution_cursors_max_nsu_check', sql`${table.maxNsu} ~ '^[0-9]{15}$'`),
    check(
      'nfe_distribution_cursors_monotonic_check',
      sql`${table.ultNsu}::numeric <= ${table.maxNsu}::numeric`,
    ),
    check('nfe_distribution_cursors_version_check', sql`${table.version} > 0`),
    check(
      'nfe_distribution_cursors_lease_check',
      sql`(${table.leaseOwner} is null) = (${table.leaseExpiresAt} is null)`,
    ),
  ],
)
