/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Schema copy of the API identity tables. The cron never runs migrations
 * (only the API does); it reads companies + the synthetic membership that
 * owns automation imports. Kept in parity with
 * apps/api-transportada/src/database/identity.schema.ts.
 */
import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export type IdentityStatus = 'active' | 'disabled'
export type CompanyStatus = 'active' | 'disabled'
export type MembershipStatus = 'active' | 'disabled'

export const identityUsers = pgTable('identity_users', {
  id: uuid().defaultRandom().primaryKey(),
  status: text().$type<IdentityStatus>().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const companies = pgTable('companies', {
  id: uuid().defaultRandom().primaryKey(),
  status: text().$type<CompanyStatus>().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

/** Só as colunas que a resolução de destinatário do módulo de notificação lê. */
export const identityUserProfiles = pgTable('identity_user_profiles', {
  userId: uuid('user_id').primaryKey(),
  name: text().notNull(),
  contactAddress: text('contact_address').notNull(),
  contactChannel: text('contact_channel').notNull(),
})

export const userCompanyMemberships = pgTable('user_company_memberships', {
  id: uuid().defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  companyId: uuid('company_id').notNull(),
  status: text().$type<MembershipStatus>().notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
