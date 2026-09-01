/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'
import { GEOCODING_PRECISIONS } from './geocoding.schema.js'
import { inList } from './schema-check.constant.js'

export const GEOCODING_REFINEMENT_OUTCOMES = [
  'refined',
  'not_improved',
  'provider_not_configured',
] as const
export type GeocodingRefinementOutcome = (typeof GEOCODING_REFINEMENT_OUTCOMES)[number]

/**
 * A trilha da marca (spec 069, RF10) — quem marcou, qual endereço, o que o provedor devolveu e se
 * substituiu. Append-only, mesmo padrão de `audit_logs`.
 *
 * Ela responde a pergunta que a ADR-0044 §5 pede para afinar o produto: **comprar precisão fina
 * valeu a pena?** Sem registro, a resposta seria opinião. E a frequência dela diz outra coisa
 * também: se a marca é usada toda hora, precisão de CEP não basta para esta operação.
 *
 * ⚠️ Ela tem `company_id`, ao contrário de `geocoded_addresses`. A coordenada não é de ninguém, mas
 * **o gasto é**: é por esta tabela que o teto por janela (RF11) conta.
 */
export const geocodingRefinementRequests = pgTable(
  'geocoding_refinement_requests',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    addressKey: text('address_key').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    outcome: text().$type<GeocodingRefinementOutcome>().notNull(),
    /** Nula quando nada foi comprado: `not_improved` e `provider_not_configured` não têm precisão. */
    precision: text(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('geocoding_refinement_requests_address_key_check', sql`length(${table.addressKey}) > 0`),
    check(
      'geocoding_refinement_requests_outcome_check',
      sql`${table.outcome} in (${sql.raw(inList(GEOCODING_REFINEMENT_OUTCOMES))})`,
    ),
    check(
      'geocoding_refinement_requests_precision_check',
      sql`${table.precision} is null or ${table.precision} in (${sql.raw(inList(GEOCODING_PRECISIONS))})`,
    ),
    /** O teto por janela conta por aqui: empresa e instante, nada mais. */
    index('geocoding_refinement_requests_company_created_idx').on(table.companyId, table.createdAt),
  ],
)
