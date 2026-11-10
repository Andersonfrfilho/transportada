/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 322: a empresa liga ou desliga o **e-mail** do aviso "ocorrência registrada pelo motorista" (spec 275).
 * Sem linha vale ligado: nenhuma empresa muda de comportamento até alguém desligar. A caixa de entrada (o sino)
 * não depende desta linha.
 *
 * ⚠️ `updated_by_user_id` fica sem chave estrangeira de propósito, como em `company_audio_transcription_settings`:
 * é rastro de quem decidiu, e apagar o usuário não pode apagar o rastro nem travar a linha.
 */
import { boolean, foreignKey, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const companyDriverOccurrenceEmailSettings = pgTable(
  'company_driver_occurrence_email_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    enabled: boolean().notNull().default(true),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedByUserId: uuid('updated_by_user_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_driver_occurrence_email_settings_company_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)
