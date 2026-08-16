/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia por valor do schema da API — as apps não importam código-fonte uma da outra e as migrations
 * rodam só na API. Só as colunas que a reconciliação lê ou escreve. Mudou a tabela lá? mude aqui.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
export type NfseAttemptKind = 'issue' | 'cancel'
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
export type StorageObjectStatus = 'staging' | 'final' | 'deleted'
export type StorageObjectPurpose =
  | 'import_source'
  | 'nfe_document'
  | 'nfe_event'
  | 'billing_document'
  | 'cte_document'
  | 'mdfe_document'
  | 'nfse_document'

export const nfseServiceInvoices = pgTable('nfse_service_invoices', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  status: text().$type<NfseServiceInvoiceStatus>().notNull(),
  providerDocumentId: text('provider_document_id'),
  providerNumber: text('provider_number'),
  verificationCode: text('verification_code'),
  rejectionCode: text('rejection_code'),
  rejectionMessage: text('rejection_message'),
  nextStatusCheckAt: timestamp('next_status_check_at', { withTimezone: true }),
  authorizedAt: timestamp('authorized_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const nfseIssuanceAttempts = pgTable('nfse_issuance_attempts', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attemptKind: text('attempt_kind').$type<NfseAttemptKind>().notNull(),
  attemptNumber: bigint('attempt_number', { mode: 'bigint' }).notNull(),
  status: text().$type<NfseIssuanceStatus>().notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
  lastErrorCode: text('last_error_code'),
  lastErrorCause: text('last_error_cause'),
  lastErrorMessage: text('last_error_message'),
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

/** Só leitura: o segredo é aberto pelo gateway e zerado depois do uso. */
export const nfseProviderCredentials = pgTable('nfse_provider_credentials', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  provider: text().notNull(),
  fiscalEnvironment: text('fiscal_environment').$type<NfseFiscalEnvironment>().notNull(),
  municipalRegistration: text('municipal_registration').notNull(),
  secretEnvelope: jsonb('secret_envelope').notNull(),
  status: text().$type<NfseCredentialStatus>().notNull(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Só o que o aviso de rejeição precisa: a tentativa guarda quem pediu a emissão. */
export const nfseIssuanceOutbox = pgTable('nfse_issuance_outbox', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
})
