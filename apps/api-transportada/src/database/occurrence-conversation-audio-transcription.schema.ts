/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.5): a transcrição de um áudio da conversa, uma linha por anexo. É dado derivado e
 * regenerável: o motor roda no worker, e a API só lê. Toda FK leva `company_id`.
 *
 * ⚠️ `disabled` nunca é gravado: a configuração da empresa é que o deriva na leitura.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  AUDIO_TRANSCRIPTION_FAILURE_CODES,
  AUDIO_TRANSCRIPTION_STATUSES,
  AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS,
} from '../shared/conversation-audio-transcription.constant.js'
import { companies } from './identity.schema.js'
import { inList } from './schema-check.constant.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversations,
} from './occurrence-conversation.schema.js'

export const occurrenceConversationAudioTranscriptions = pgTable(
  'occurrence_conversation_audio_transcriptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
    /** Desnormalizado: a leitura de `transcriptionUpdatedAt` da conversa não junta o anexo. */
    conversationId: uuid('conversation_id').notNull(),
    status: varchar({ length: 16 }).notNull(),
    /** Anulado quando o objeto é apagado (expurgo): `ready` sem texto é o estado "purged". */
    text: text(),
    language: varchar({ length: 8 }),
    audioDurationMs: integer('audio_duration_ms'),
    engine: varchar({ length: 64 }),
    model: varchar({ length: 64 }),
    processingMs: integer('processing_ms'),
    /** Sobe na reivindicação: um processo morto também conta como tentativa. */
    attempts: smallint().notNull().default(0),
    /** Só quem tem a posse grava (`where lease_token = $x`). */
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    /** Teto aplicado; só existe em `too_long`. */
    maxDurationMs: integer('max_duration_ms'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    failureCode: varchar('failure_code', { length: 32 }),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Nomes explícitos: os gerados passariam de 63 bytes e o drizzle os trocaria por hash. */
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'occurrence_conversation_audio_transcriptions_company_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.attachmentId],
      foreignColumns: [
        occurrenceConversationAttachments.companyId,
        occurrenceConversationAttachments.id,
      ],
      name: 'occurrence_conversation_audio_transcriptions_attachment_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.conversationId],
      foreignColumns: [occurrenceConversations.companyId, occurrenceConversations.id],
      name: 'occurrence_conversation_audio_transcriptions_conversation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('occurrence_conversation_audio_transcriptions_attachment_unique').on(
      table.companyId,
      table.attachmentId,
    ),
    index('occurrence_conversation_audio_transcriptions_conversation_idx').on(
      table.companyId,
      table.conversationId,
      table.updatedAt,
    ),
    index('occurrence_conversation_audio_transcriptions_claim_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = 'pending'`),
    index('occurrence_conversation_audio_transcriptions_purge_idx')
      .on(table.companyId, table.attachmentId)
      .where(sql`${table.status} = 'ready' and ${table.text} is not null`),
    check(
      'occurrence_conversation_audio_transcriptions_status_check',
      sql`${table.status} in (${sql.raw(inList(AUDIO_TRANSCRIPTION_STATUSES))})`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_failure_check',
      sql`${table.failureCode} is null or ${table.failureCode} in (${sql.raw(inList(AUDIO_TRANSCRIPTION_FAILURE_CODES))})`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_failed_code_check',
      sql`${table.status} <> 'failed' or ${table.failureCode} is not null`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_ready_gen_check',
      sql`(${table.status} = 'ready') = (${table.generatedAt} is not null)`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_too_long_check',
      sql`(coalesce(${table.failureCode}, '') = 'too_long') = (${table.maxDurationMs} is not null)`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_text_length_check',
      sql`${table.text} is null or char_length(${table.text}) <= ${sql.raw(String(AUDIO_TRANSCRIPTION_TEXT_MAX_CHARACTERS))}`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_duration_check',
      sql`${table.audioDurationMs} is null or ${table.audioDurationMs} > 0`,
    ),
  ],
)
