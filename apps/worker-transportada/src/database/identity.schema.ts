/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia das tabelas de identidade que a API versiona. Migration só roda na API — mudou lá, mude
 * aqui. Só as colunas que a resolução de destinatário lê estão declaradas.
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const identityUserProfiles = pgTable('identity_user_profiles', {
  userId: uuid('user_id').primaryKey(),
  name: text().notNull(),
  contactAddress: text('contact_address').notNull(),
  contactChannel: text('contact_channel').notNull(),
})

export const userCompanyMemberships = pgTable('user_company_memberships', {
  userId: uuid('user_id').notNull(),
  companyId: uuid('company_id').notNull(),
  status: text().notNull(),
})
