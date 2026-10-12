/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
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
  CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES,
  CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES,
  CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH,
  type ConversationAudioTranscriptionFailureCode,
  type ConversationAudioTranscriptionStatus,
} from '../shared/conversation-audio-transcription.constant.js'
import { companies } from './identity.schema.js'
import {
  occurrenceConversationAttachments,
  occurrenceConversations,
} from './occurrence-conversation.schema.js'
import { inList } from './schema-check.constant.js'

/**
 * Spec 264 (contract.md §5.5): a transcrição de cada áudio da conversa. Uma linha por anexo; o worker é o
 * único que grava (a API só lê). Toda FK leva `company_id`. `conversation_id` é desnormalizado da mensagem
 * do anexo para a consulta de 15 s do app (`max(updated_at)` por conversa, §5.3): toda escrita que muda o
 * que a API expõe faz `updated_at = now()`. `disabled` nunca é gravado (D4).
 */
export const occurrenceConversationAudioTranscriptions = pgTable(
  'occurrence_conversation_audio_transcriptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    status: varchar({ length: 16 }).$type<ConversationAudioTranscriptionStatus>().notNull(),
    /** Só em `ready`; anulado em `purged`. Nunca vai a log. */
    text: text(),
    language: varchar({ length: 8 }),
    audioDurationMs: integer('audio_duration_ms'),
    engine: varchar({ length: 64 }),
    model: varchar({ length: 64 }),
    processingMs: integer('processing_ms'),
    /** Sobe na reivindicação: processo morto também conta. */
    attempts: smallint().notNull().default(0),
    /** Só quem tem a posse grava (`where lease_token = $x`); nulo fora de posse. */
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    /** O teto aplicado, só em `too_long`. */
    maxDurationMs: integer('max_duration_ms'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    failureCode: varchar('failure_code', {
      length: 32,
    }).$type<ConversationAudioTranscriptionFailureCode>(),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('occurrence_conversation_audio_transcriptions_attachment_unique').on(
      table.companyId,
      table.attachmentId,
    ),
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
    check(
      'occurrence_conversation_audio_transcriptions_status_check',
      sql`${table.status} in (${sql.raw(inList(CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES))})`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_failure_code_check',
      sql`${table.failureCode} is null or ${table.failureCode} in (${sql.raw(inList(CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES))})`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_duration_check',
      sql`${table.audioDurationMs} is null or ${table.audioDurationMs} > 0`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_generated_check',
      sql`(${table.status} = 'ready') = (${table.generatedAt} is not null)`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_failed_code_check',
      sql`${table.status} <> 'failed' or ${table.failureCode} is not null`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_max_duration_check',
      sql`(coalesce(${table.failureCode}, '') = 'too_long') = (${table.maxDurationMs} is not null)`,
    ),
    check(
      'occurrence_conversation_audio_transcriptions_text_length_check',
      sql`${table.text} is null or char_length(${table.text}) <= ${sql.raw(String(CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH))}`,
    ),
    index('occurrence_conversation_audio_transcriptions_conv_updated_idx').on(
      table.companyId,
      table.conversationId,
      table.updatedAt,
    ),
    index('occurrence_conversation_audio_transcriptions_pending_idx')
      .on(table.nextAttemptAt)
      .where(sql`${table.status} = 'pending'`),
  ],
)

/**
 * Spec 264 D9: o interruptor por empresa e o marco de "sem backfill". `enabled_since` e `routine_started_at`
 * (nulo até a rotina ver a empresa) limitam o que a descoberta transcreve; `updated_by_user_id` nulo = linha
 * criada pela rotina, e fica sem FK de propósito (rastro de quem decidiu, como a retenção de posição).
 */
export const companyAudioTranscriptionSettings = pgTable(
  'company_audio_transcription_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    enabled: boolean().notNull().default(true),
    enabledSince: timestamp('enabled_since', { withTimezone: true }).notNull().defaultNow(),
    routineStartedAt: timestamp('routine_started_at', { withTimezone: true }),
    updatedByUserId: uuid('updated_by_user_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_audio_transcription_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)
