/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  bigint,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  CTE_RETRY_DEFAULT_BACKOFF_SECONDS,
  CTE_RETRY_DEFAULT_MAX_ATTEMPTS,
} from '../cte-issuance/domain/cte-retry.policy.js'

export type NfeImportSource = 'distribution' | 'upload'
export type NfeImportStatus =
  | 'cancelled'
  | 'completed'
  | 'failed'
  | 'partially_processed'
  | 'pending'
  | 'processing'
  | 'queued'
export type NfeItemStatus =
  | 'duplicated'
  | 'failed'
  | 'imported'
  | 'invalid'
  | 'pending'
  | 'rejected'
  | 'validating'
export type NfeItemVariant = 'complete' | 'event' | 'summary'
export type NfeFiscalEnvironment = 'homologation' | 'production'
export type NfeDocumentStatus = 'authorized' | 'cancelled' | 'denied' | 'unsigned'
export type StorageObjectStatus = 'staging' | 'final' | 'deleted'
export type StorageObjectPurpose =
  | 'import_source'
  | 'nfe_document'
  | 'nfe_event'
  | 'billing_document'
  | 'cte_document'
  | 'mdfe_document'

export type FiscalEnvironment = 'homologation' | 'production'
export type TaxRegime = '1' | '2' | '3'

export const NFE_ORIGIN_TRIGGERS = ['user', 'automation'] as const
export type NfeOriginTrigger = (typeof NFE_ORIGIN_TRIGGERS)[number]

const decimalColumn = (name: string) => numeric(name, { precision: 19, scale: 4 })

export const companyFiscalProfiles = pgTable('company_fiscal_profiles', {
  companyId: uuid('company_id').primaryKey(),
  legalName: text('legal_name').notNull(),
  tradeName: text('trade_name').notNull(),
  cnpj: text().notNull(),
  stateRegistration: text('state_registration').notNull(),
  municipalRegistration: text('municipal_registration').notNull(),
  taxRegime: text('tax_regime').$type<TaxRegime>().notNull(),
  rntrc: text().notNull(),
  street: text().notNull(),
  number: text().notNull(),
  complement: text().notNull(),
  district: text().notNull(),
  city: text().notNull(),
  state: text().notNull(),
  postalCode: text('postal_code').notNull(),
  cityIbgeCode: text('city_ibge_code').notNull(),
  phone: text().notNull(),
  email: text().notNull(),
  environment: text().$type<FiscalEnvironment>().notNull().default('homologation'),
  cteRetryMaxAttempts: integer('cte_retry_max_attempts')
    .notNull()
    .default(CTE_RETRY_DEFAULT_MAX_ATTEMPTS),
  cteRetryBackoffSeconds: integer('cte_retry_backoff_seconds')
    .array()
    .notNull()
    .default([...CTE_RETRY_DEFAULT_BACKOFF_SECONDS]),
  version: bigint({ mode: 'bigint' }).notNull().default(1n),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nfeImports = pgTable('nfe_imports', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  source: text().$type<NfeImportSource>().notNull(),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  triggeredBy: text('triggered_by').$type<NfeOriginTrigger>().notNull().default('user'),
  automationJob: text('automation_job'),
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
})

export const nfeImportItems = pgTable('nfe_import_items', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
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
})

export const nfeDocuments = pgTable('nfe_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
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
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nfeParticipants = pgTable('nfe_participants', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  documentId: uuid('document_id').notNull(),
  role: text().notNull(),
  taxId: text('tax_id'),
  legalName: text('legal_name'),
  tradeName: text('trade_name'),
  stateRegistration: text('state_registration'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nfeAddresses = pgTable('nfe_addresses', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
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
})

export const nfeVolumes = pgTable('nfe_volumes', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  documentId: uuid('document_id').notNull(),
  ordinal: bigint({ mode: 'bigint' }).notNull(),
  quantity: decimalColumn('quantity').default('0'),
  species: text(),
  grossWeight: decimalColumn('gross_weight').default('0'),
  netWeight: decimalColumn('net_weight').default('0'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nfeProducts = pgTable('nfe_products', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
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
})

export const nfeEvents = pgTable('nfe_events', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  targetAccessKey: text('target_access_key').notNull(),
  eventType: text('event_type').notNull(),
  eventSequence: bigint('event_sequence', { mode: 'bigint' }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  xmlObjectId: uuid('xml_object_id').notNull(),
  sourceNsu: text('source_nsu'),
  environment: text().$type<NfeFiscalEnvironment>(),
  metadata: jsonb(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const storedObjects = pgTable('stored_objects', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  provider: text().notNull(),
  bucket: text().notNull(),
  objectKey: text('object_key').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
  sha256: text().notNull(),
  status: text().$type<StorageObjectStatus>().notNull(),
  purpose: text().$type<StorageObjectPurpose>().notNull(),
  retentionUntil: timestamp('retention_until', { withTimezone: true }),
  leaseOwner: text('lease_owner'),
  leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nfeDistributionCursors = pgTable(
  'nfe_distribution_cursors',
  {
    companyId: uuid('company_id').notNull(),
    environment: text().$type<NfeFiscalEnvironment>().notNull(),
    ultNsu: text('ult_nsu').notNull().default('000000000000000'),
    maxNsu: text('max_nsu').notNull().default('000000000000000'),
    nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true }),
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
  ],
)
