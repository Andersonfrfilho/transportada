/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API (spec 265, migration aditiva de `trip_delivery_proofs` e
 * `delivery_proof_outbox`) — migrations só rodam lá. Mudou a tabela do outro lado, mude aqui.
 * `trip-execution.schema.ts` já declara uma cópia **menor** de `trip_delivery_proofs` (só o que o
 * expurgo de posição lê, com paridade de colunas própria): esta é a do tratamento do arquivo, com um
 * nome de export distinto de propósito. `test/delivery-proof-processing/schema-parity.contract.ts`
 * reprova se as colunas divergirem da lista da API.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const DELIVERY_PROOF_PROCESSING_STATES = [
  'received',
  'processing',
  'ready',
  'processing_failed',
] as const
export type DeliveryProofProcessingState = (typeof DELIVERY_PROOF_PROCESSING_STATES)[number]

/** Só as colunas que o tratamento lê ou escreve; a ordem acompanha a tabela da API. */
export const deliveryProofProcessingProofs = pgTable('trip_delivery_proofs', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  stopEventId: uuid('stop_event_id').notNull(),
  kind: text().notNull(),
  objectId: uuid('object_id').notNull(),
  thumbnailObjectId: uuid('thumbnail_object_id'),
  attachmentKey: text('attachment_key').notNull().default(''),
  canhotoReview: varchar('canhoto_review', { length: 16 }).notNull(),
  canhotoReadSource: varchar('canhoto_read_source', { length: 16 }),
  canhotoReadAttemptedAt: timestamp('canhoto_read_attempted_at', { withTimezone: true }),
  processingState: varchar('processing_state', {
    length: 16,
  }).$type<DeliveryProofProcessingState>(),
  originalObjectId: uuid('original_object_id'),
  processingError: varchar('processing_error', { length: 64 }),
})

export const deliveryProofOutbox = pgTable('delivery_proof_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  proofId: uuid('proof_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
