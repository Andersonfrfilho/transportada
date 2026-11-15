/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/** O que uma chave de integração pode fazer. Duas capacidades, e a chave leva só as que o admin marcou. */
export const INTEGRATION_KEY_SCOPES = ['quote', 'pickup'] as const
export type IntegrationKeyScope = (typeof INTEGRATION_KEY_SCOPES)[number]

/**
 * Spec 340: chave de API de um terceiro que integra orçamento e pedido de coleta. É da empresa (a instalação é
 * dedicada, mas a empresa segue sendo a fronteira). Só o **hash** SHA-256 fica no banco: a chave inteira aparece
 * uma vez, na criação, e nunca mais. `revoked_at` encerra a chave sem apagá-la, para o rastro de quem pediu o quê.
 *
 * ⚠️ `created_by_user_id` sem chave estrangeira de propósito (rastro, como nas demais configurações).
 */
export const integrationApiKeys = pgTable(
  'integration_api_keys',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    name: text().notNull(),
    /** Primeiros caracteres da chave, só para o admin reconhecer qual é qual na lista. */
    keyPrefix: text('key_prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    scopes: text().$type<IntegrationKeyScope>().array().notNull(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('integration_api_keys_hash_unique').on(table.keyHash),
    index('integration_api_keys_company_idx').on(table.companyId, table.createdAt),
    check('integration_api_keys_name_check', sql`length(btrim(${table.name})) > 0`),
    check(
      'integration_api_keys_scopes_check',
      sql`cardinality(${table.scopes}) > 0 and ${table.scopes} <@ array['quote', 'pickup']::text[]`,
    ),
  ],
)
