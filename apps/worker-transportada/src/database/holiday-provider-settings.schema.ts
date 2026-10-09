/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/database/holiday-provider-settings.schema.ts`, só com as
 * colunas (sem CHECK nem único: a migration roda na API). A paridade, coluna a coluna, é cobrada por
 * `test/holiday-provider-pull/schema-parity.contract.ts`. Mudou a tabela lá? confira aqui.
 *
 * A chave selada da FeriadosAPI e o orçamento mensal da instalação (spec 262, ADR-0102). Só leitura aqui:
 * quem grava é a API, e a rotina lê a linha a cada ciclo.
 */
import { bigint, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const holidayProviderSettings = pgTable('holiday_provider_settings', {
  id: uuid().defaultRandom().primaryKey(),
  provider: text().notNull().default('feriadosapi'),
  tokenEnvelope: jsonb('token_envelope'),
  tokenHint: text('token_hint'),
  tokenUpdatedAt: timestamp('token_updated_at', { withTimezone: true }),
  monthlyRequestBudget: integer('monthly_request_budget').notNull(),
  version: bigint({ mode: 'bigint' }).notNull().default(1n),
  updatedByUserId: uuid('updated_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
