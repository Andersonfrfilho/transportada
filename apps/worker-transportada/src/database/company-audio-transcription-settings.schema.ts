/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor de `company_audio_transcription_settings` (spec 264 T3.1, contract.md §5.5). Só as colunas:
 * a FK e a migração moram na API. `test/occurrence-conversation/audio-transcription-schema-parity.contract.ts`
 * reprova se as colunas divergirem.
 */
import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

export const companyAudioTranscriptionSettings = pgTable('company_audio_transcription_settings', {
  companyId: uuid('company_id').primaryKey(),
  enabled: boolean().notNull().default(true),
  enabledSince: timestamp('enabled_since', { withTimezone: true }).notNull().defaultNow(),
  routineStartedAt: timestamp('routine_started_at', { withTimezone: true }),
  updatedByUserId: uuid('updated_by_user_id'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
