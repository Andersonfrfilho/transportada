/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.5–5.6, D9): a empresa liga ou desliga a transcrição das conversas. A ausência da
 * linha não é o padrão: a rotina cria a linha ligada na primeira passagem, e `enabled_since` marca quando a
 * empresa passou a valer, para que o histórico anterior não seja transcrito sem aviso (sem backfill).
 *
 * ⚠️ `updated_by_user_id` fica sem chave estrangeira de propósito, como na configuração do calendário: é
 * rastro de quem decidiu, e apagar o usuário não pode apagar o rastro nem travar a linha. Nulo = criada pela
 * rotina.
 */
import { boolean, foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const companyAudioTranscriptionSettings = pgTable(
  'company_audio_transcription_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    enabled: boolean().notNull().default(true),
    enabledSince: timestamp('enabled_since', { withTimezone: true }).notNull().defaultNow(),
    /** Nulo até a rotina enxergar a empresa: o marco que separa o que existia do que chega depois. */
    routineStartedAt: timestamp('routine_started_at', { withTimezone: true }),
    updatedByUserId: uuid('updated_by_user_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_audio_transcription_settings_company_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)
