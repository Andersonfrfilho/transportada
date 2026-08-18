/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 * Cópia por valor do schema da API. Só as colunas que o trilho NFS-e lê ou escreve.
 */
import { jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type NfseFiscalEnvironment = 'homologation' | 'production'
export type NfseServiceInvoiceStatus =
  | 'requested'
  | 'issuing'
  | 'pending_authorization'
  | 'authorized'
  | 'cancellation_requested'
  | 'rejected'
  | 'cancelled'
  | 'failed'
  | 'discarded'
export type NfseAttemptKind = 'issue' | 'cancel'
/**
 * O `motivo` do `/cancelar-nota` é **código**: `2` serviço não prestado, `4` nota duplicada. Quem
 * cobra o conjunto é a fronteira Zod da API e o CHECK do banco — aqui a linha só é lida.
 */
export type NfseCancellationMotive = '2' | '4'
export type NfseIssuanceStatus =
  | 'pending'
  | 'in_flight'
  | 'accepted'
  | 'authorized'
  | 'rejected'
  | 'retry_scheduled'
  | 'failed'
  | 'reconciliation_required'
  | 'cancelled'
export type NfseDocumentStatus = 'authorized' | 'cancelled'
export type NfseCredentialStatus = 'active' | 'inactive'

export const nfseServiceInvoices = pgTable('nfse_service_invoices', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  emissionProfileId: uuid('emission_profile_id').notNull(),
  takerTaxId: text('taker_tax_id').notNull(),
  takerLegalName: text('taker_legal_name').notNull(),
  status: text().$type<NfseServiceInvoiceStatus>().notNull(),
  serviceAmount: numeric('service_amount', { precision: 19, scale: 4 }).notNull(),
  issAmount: numeric('iss_amount', { precision: 19, scale: 4 }).notNull(),
  description: text().notNull(),
  providerDocumentId: text('provider_document_id'),
  providerNumber: text('provider_number'),
  verificationCode: text('verification_code'),
  rejectionCode: text('rejection_code'),
  rejectionMessage: text('rejection_message'),
  nextStatusCheckAt: timestamp('next_status_check_at', { withTimezone: true }),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancellationMotive: text('cancellation_motive').$type<NfseCancellationMotive>(),
  cancellationReason: text('cancellation_reason'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const nfseIssuanceAttempts = pgTable('nfse_issuance_attempts', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attemptKind: text('attempt_kind').$type<NfseAttemptKind>().notNull(),
  status: text().$type<NfseIssuanceStatus>().notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
  lastErrorCode: text('last_error_code'),
  lastErrorCause: text('last_error_cause'),
  lastErrorMessage: text('last_error_message'),
  correlationId: text('correlation_id').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const nfseIssuanceEvents = pgTable('nfse_issuance_events', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  eventName: text('event_name').notNull(),
  payload: jsonb().notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
})

export const nfseIssuancePayloads = pgTable('nfse_issuance_payloads', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  payload: jsonb().notNull(),
  providerConfig: jsonb('provider_config').notNull(),
  payloadSha256: text('payload_sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const nfseFiscalDocuments = pgTable('nfse_fiscal_documents', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  providerDocumentId: text('provider_document_id').notNull(),
  fiscalNumber: text('fiscal_number').notNull(),
  verificationCode: text('verification_code').notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
  status: text().$type<NfseDocumentStatus>().notNull(),
  xmlObjectId: uuid('xml_object_id').notNull(),
  xmlSha256: text('xml_sha256').notNull(),
  pdfObjectId: uuid('pdf_object_id'),
  pdfSha256: text('pdf_sha256'),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }).notNull(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

/** O trilho só lê: o segredo é aberto pelo gateway e zerado depois do uso. */
export const nfseProviderCredentials = pgTable('nfse_provider_credentials', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  provider: text().notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
  taxId: text('tax_id').notNull(),
  municipalRegistration: text('municipal_registration').notNull(),
  secretEnvelope: jsonb('secret_envelope').notNull(),
  status: text().$type<NfseCredentialStatus>().notNull(),
})
