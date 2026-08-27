/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/database/delivery-client.schema.ts`, com as colunas
 * que a importação escreve e nada mais. As duas apps não importam código uma da outra, e migration
 * só roda na API. Mudou a tabela lá? confira aqui.
 *
 * O que este worker **não** escreve é tão importante quanto o que ele escreve: janela, taxa esperada
 * e `requires_scheduling` não estão sequer declarados aqui, porque o cadastro nasce **sem regra**
 * (ADR-0048 §1) e a criação automática nunca sobrescreve o que gente preencheu.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const deliveryClients = pgTable('delivery_clients', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  taxId: text('tax_id').notNull(),
  displayName: text('display_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const contractors = pgTable('contractors', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  taxId: text('tax_id').notNull(),
  displayName: text('display_name').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
