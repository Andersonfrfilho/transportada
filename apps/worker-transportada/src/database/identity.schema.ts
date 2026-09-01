/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia das tabelas de identidade que a API versiona. Migration só roda na API — mudou lá, mude
 * aqui. Só as colunas que a resolução de destinatário lê estão declaradas.
 */
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export type CompanyStatus = 'active' | 'disabled'

/** Só o status: a rotina de distribuição precisa saber se a empresa está de pé, e nada além disso. */
export const companies = pgTable('companies', {
  id: uuid().defaultRandom().primaryKey(),
  status: text().$type<CompanyStatus>().notNull().default('active'),
})

export const identityUserProfiles = pgTable('identity_user_profiles', {
  userId: uuid('user_id').primaryKey(),
  name: text().notNull(),
  contactAddress: text('contact_address').notNull(),
  contactChannel: text('contact_channel').notNull(),
  /** Lido pelo backfill do documento no realm — nunca escrito daqui. */
  taxId: text('tax_id').notNull(),
})

/** O vínculo entre o usuário da base e o `sub` do provedor: é por ele que o backfill endereça. */
export const externalIdentities = pgTable('external_identities', {
  userId: uuid('user_id').notNull(),
  issuer: text().notNull(),
  subject: text().notNull(),
})

export const userCompanyMemberships = pgTable('user_company_memberships', {
  userId: uuid('user_id').notNull(),
  companyId: uuid('company_id').notNull(),
  status: text().notNull(),
})
