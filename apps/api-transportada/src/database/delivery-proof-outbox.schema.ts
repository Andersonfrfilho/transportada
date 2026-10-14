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
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { tripDeliveryProofs } from './trip.schema.js'

/**
 * Spec 265 RF4/RF5: o pedido de tratamento do comprovante enviado sem redução (`variant = original`),
 * gravado na **mesma transação** que a linha do comprovante e o objeto (ADR-0053) — o mesmo desenho de
 * `aggregate_attachment_outbox` (070), com `proof_id` no lugar de `attachment_id`. A API só grava; o
 * relay e o consumidor são do worker.
 *
 * `payload` carrega **referência** (`companyId`, `proofId`, `attachmentKey`, `variant`, `objectKey`),
 * nunca bytes: foto de canhoto na fila seria dado de terceiro em repouso, sem prazo de descarte.
 */
export const DELIVERY_PROOF_OUTBOX_EVENT_TYPES = ['delivery-proof.processing.requested'] as const
export type DeliveryProofOutboxEventType = (typeof DELIVERY_PROOF_OUTBOX_EVENT_TYPES)[number]

export const deliveryProofOutbox = pgTable(
  'delivery_proof_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    proofId: uuid('proof_id').notNull(),
    eventType: text('event_type').$type<DeliveryProofOutboxEventType>().notNull(),
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
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'delivery_proof_outbox_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    /** O comprovante some junto com o evento da entrega (`cascade`): pedido sem comprovante não tem o que tratar. */
    foreignKey({
      columns: [table.companyId, table.proofId],
      foreignColumns: [tripDeliveryProofs.companyId, tripDeliveryProofs.id],
      name: 'delivery_proof_outbox_company_proof_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('delivery_proof_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('delivery_proof_outbox_company_id_event_id_unique').on(table.companyId, table.eventId),
    index('delivery_proof_outbox_company_pub_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    index('delivery_proof_outbox_company_proof_idx').on(table.companyId, table.proofId),
    check(
      'delivery_proof_outbox_event_type_check',
      sql`${table.eventType} in ('delivery-proof.processing.requested')`,
    ),
  ],
)

export type DeliveryProofOutboxRow = typeof deliveryProofOutbox.$inferSelect
