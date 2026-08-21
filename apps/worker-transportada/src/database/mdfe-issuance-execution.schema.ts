/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 * Cópia por valor do schema da API. Só as colunas que o trilho MDF-e lê ou escreve.
 */
import { bigint, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type MdfeFiscalEnvironment = 'homologation' | 'production'
export type MdfeManifestStatus =
  | 'draft'
  | 'issuing'
  | 'authorized'
  | 'rejected'
  | 'closed'
  | 'cancelled'
  | 'discarded'
export type MdfeAttemptKind = 'issue' | 'close' | 'cancel'
export type MdfeIssuanceStatus =
  | 'pending'
  | 'in_flight'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'reconciliation_required'
  | 'closed'
  | 'cancelled'
export type MdfeDocumentStatus = 'authorized' | 'closed' | 'cancelled'

export const mdfeManifests = pgTable('mdfe_manifests', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  vehicleId: uuid('vehicle_id').notNull(),
  status: text().$type<MdfeManifestStatus>().notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<MdfeFiscalEnvironment>().notNull(),
  emitterType: text('emitter_type').notNull(),
  transporterType: text('transporter_type').notNull(),
  originState: text('origin_state').notNull(),
  destinationState: text('destination_state').notNull(),
  cargoType: text('cargo_type').notNull(),
  cargoProduct: text('cargo_product').notNull(),
  cargoProductNcm: text('cargo_product_ncm').notNull(),
  cargoUnit: text('cargo_unit').notNull(),
  cteCount: bigint('cte_count', { mode: 'bigint' }).notNull(),
  cargoValue: numeric('cargo_value', { precision: 15, scale: 2 }).notNull(),
  cargoWeight: numeric('cargo_weight', { precision: 15, scale: 4 }).notNull(),
  rntrc: text().notNull(),
  fiscalSeries: text('fiscal_series').notNull(),
  fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }),
  tripStartedAt: timestamp('trip_started_at', { withTimezone: true }),
  additionalInformation: text('additional_information').notNull(),
  version: bigint({ mode: 'bigint' }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const mdfeManifestDrivers = pgTable('mdfe_manifest_drivers', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  driverId: uuid('driver_id').notNull(),
  driverName: text('driver_name').notNull(),
  driverTaxId: text('driver_tax_id').notNull(),
  position: bigint({ mode: 'bigint' }).notNull(),
})

export const mdfeManifestItems = pgTable('mdfe_manifest_items', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  cteFiscalDocumentId: uuid('cte_fiscal_document_id').notNull(),
  accessKey: text('access_key').notNull(),
  dischargeCityCode: text('discharge_city_code').notNull(),
  dischargeCityName: text('discharge_city_name').notNull(),
  cargoValue: numeric('cargo_value', { precision: 15, scale: 2 }).notNull(),
  cargoWeight: numeric('cargo_weight', { precision: 15, scale: 4 }).notNull(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
})

export const mdfeManifestLoadingCities = pgTable('mdfe_manifest_loading_cities', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  cityCode: text('city_code').notNull(),
  cityName: text('city_name').notNull(),
  position: bigint({ mode: 'bigint' }).notNull(),
})

export const mdfeIssuancePayloads = pgTable('mdfe_issuance_payloads', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  payload: jsonb().notNull(),
  providerConfig: jsonb('provider_config').notNull(),
  payloadSha256: text('payload_sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mdfeIssuanceAttempts = pgTable('mdfe_issuance_attempts', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  attemptKind: text('attempt_kind').$type<MdfeAttemptKind>().notNull(),
  attemptNumber: bigint('attempt_number', { mode: 'bigint' }).notNull(),
  status: text().$type<MdfeIssuanceStatus>().notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<MdfeFiscalEnvironment>().notNull(),
  fiscalSeries: text('fiscal_series').notNull(),
  fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }),
  lastErrorCode: text('last_error_code'),
  lastErrorCause: text('last_error_cause'),
  lastErrorMessage: text('last_error_message'),
  correlationId: text('correlation_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const mdfeIssuanceEvents = pgTable('mdfe_issuance_events', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})

export const mdfeFiscalDocuments = pgTable('mdfe_fiscal_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  accessKey: text('access_key').notNull(),
  authorizationProtocol: text('authorization_protocol').notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<MdfeFiscalEnvironment>().notNull(),
  fiscalSeries: text('fiscal_series').notNull(),
  fiscalNumber: bigint('fiscal_number', { mode: 'bigint' }).notNull(),
  status: text().$type<MdfeDocumentStatus>().notNull(),
  xmlObjectId: uuid('xml_object_id').notNull(),
  xmlSha256: text('xml_sha256').notNull(),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  closureProtocol: text('closure_protocol'),
  closureState: text('closure_state'),
  closureCityCode: text('closure_city_code'),
  closureXmlObjectId: uuid('closure_xml_object_id'),
  closureXmlSha256: text('closure_xml_sha256'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  cancellationJustification: text('cancellation_justification'),
  cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
  cancellationProtocol: text('cancellation_protocol'),
  cancellationXmlObjectId: uuid('cancellation_xml_object_id'),
  cancellationXmlSha256: text('cancellation_xml_sha256'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
