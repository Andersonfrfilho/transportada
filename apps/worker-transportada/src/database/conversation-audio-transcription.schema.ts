/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor das duas tabelas que a API versiona (spec 264, contract.md §5.5). Quem migra é a API; aqui
 * ficam as colunas que a rotina `conversation.audio.transcribe` lê e grava, sem CHECKs nem FKs.
 * `test/conversation-audio-transcription-schema/parity.contract.ts` confere colunas, vocabulário e teto contra a API.
 * Coluna renomeada lá e não aqui é `UPDATE` que falha em produção, e a transcrição fica `pending` para sempre.
 */
import {
  boolean,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES = [
  'pending',
  'ready',
  'failed',
  'purged',
] as const
export type ConversationAudioTranscriptionStatus =
  (typeof CONVERSATION_AUDIO_TRANSCRIPTION_STATUSES)[number]

/** RF14 + `company_disabled` (contract.md §5.7). */
export const CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES = [
  'unsupported_format',
  'too_long',
  'empty_audio',
  'object_missing',
  'sha256_mismatch',
  'engine_timeout',
  'engine_failed',
  'attempts_exhausted',
  'company_disabled',
] as const
export type ConversationAudioTranscriptionFailureCode =
  (typeof CONVERSATION_AUDIO_TRANSCRIPTION_FAILURE_CODES)[number]

/** 20 000 code points (`char_length`): o texto é cortado por code point antes de gravar. */
export const CONVERSATION_AUDIO_TRANSCRIPTION_TEXT_MAX_LENGTH = 20_000

export const occurrenceConversationAudioTranscriptions = pgTable(
  'occurrence_conversation_audio_transcriptions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    status: varchar({ length: 16 }).$type<ConversationAudioTranscriptionStatus>().notNull(),
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
    failureCode: varchar('failure_code', {
      length: 32,
    }).$type<ConversationAudioTranscriptionFailureCode>(),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
)

export const companyAudioTranscriptionSettings = pgTable('company_audio_transcription_settings', {
  companyId: uuid('company_id').primaryKey(),
  enabled: boolean().notNull().default(true),
  enabledSince: timestamp('enabled_since', { withTimezone: true }).notNull().defaultNow(),
  routineStartedAt: timestamp('routine_started_at', { withTimezone: true }),
  updatedByUserId: uuid('updated_by_user_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
