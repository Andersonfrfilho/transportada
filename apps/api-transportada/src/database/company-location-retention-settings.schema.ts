/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import {
  LOCATION_RETENTION_MAX_DAYS,
  LOCATION_RETENTION_MIN_DAYS,
} from '../companies/domain/location-retention.policy.js'
import { companies } from './identity.schema.js'

/**
 * Spec 239 D1: se a empresa apaga a posição dos eventos da viagem, e depois de quantos dias. Uma
 * linha por empresa, com a empresa de chave, e a ausência da linha é resposta válida: desligado,
 * 90 dias — o padrão seguro, em que ninguém expurga. Não mora em `company_delivery_proof_settings`
 * para o "voltar ao padrão" de um painel não apagar o outro.
 *
 * `purge_effective_at` é a carência do D5: o worker só enxerga a empresa a partir dela. Fica anulável
 * porque desligado não lê o campo, mas ligado sem data seria a tela dizendo "ligado" com o worker
 * ignorando a empresa para sempre — o CHECK barra essa mentira.
 *
 * ⚠️ `updated_by_user_id` fica sem chave estrangeira de propósito, como na diária: é rastro de quem
 * decidiu apagar dado pessoal, e apagar o usuário não pode apagar o rastro nem travar a linha.
 */
export const companyLocationRetentionSettings = pgTable(
  'company_location_retention_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    purgeEnabled: boolean('purge_enabled').notNull().default(false),
    /** D6: o padrão é o teto — 90 dias, o número da ADR-0045 §3.3. */
    retentionDays: integer('retention_days').notNull().default(LOCATION_RETENTION_MAX_DAYS),
    purgeEffectiveAt: timestamp('purge_effective_at', { withTimezone: true }),
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    /** Nome explícito: o gerado passaria de 63 caracteres e o drizzle o trocaria por um hash. */
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_location_retention_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'company_location_retention_settings_retention_days_check',
      sql`${table.retentionDays} between ${sql.raw(String(LOCATION_RETENTION_MIN_DAYS))} and ${sql.raw(String(LOCATION_RETENTION_MAX_DAYS))}`,
    ),
    check(
      'company_location_retention_settings_effective_at_check',
      sql`not ${table.purgeEnabled} or ${table.purgeEffectiveAt} is not null`,
    ),
  ],
)
