/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `occurrence_conversation_audio_transcriptions` (spec 264 T3.1, contract.md §5.5). Só as
 * colunas: os CHECKs, as FKs e os índices moram na API, que migra. `disabled` nunca é gravado.
 * `test/occurrence-conversation/audio-transcription-schema-parity.contract.ts` reprova se as colunas divergirem.
 */
import { integer, pgTable, smallint, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const occurrenceConversationAudioTranscriptions = pgTable(
  'occurrence_conversation_audio_transcriptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    status: varchar({ length: 16 }).notNull(),
    text: text(),
    language: varchar({ length: 8 }),
    audioDurationMs: integer('audio_duration_ms'),
    engine: varchar({ length: 64 }),
    model: varchar({ length: 64 }),
    processingMs: integer('processing_ms'),
    attempts: smallint().notNull().default(0),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    maxDurationMs: integer('max_duration_ms'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    failureCode: varchar('failure_code', { length: 32 }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
)
