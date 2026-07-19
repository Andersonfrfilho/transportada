/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const IDENTITY_STATUSES = ['active', 'disabled'] as const
export type IdentityStatus = (typeof IDENTITY_STATUSES)[number]

export const COMPANY_STATUSES = ['active', 'disabled'] as const
export type CompanyStatus = (typeof COMPANY_STATUSES)[number]

export const MEMBERSHIP_STATUSES = ['active', 'disabled'] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]

/**
 * Platform roles are intentionally excluded. They create a PlatformContext and
 * must never be interpreted as company membership authorization.
 */
export const COMPANY_ROLES = ['company-admin', 'finance', 'fiscal', 'operator', 'viewer'] as const
export type CompanyRole = (typeof COMPANY_ROLES)[number]

export const identityUsers = pgTable(
  'identity_users',
  {
    id: uuid().defaultRandom().primaryKey(),
    status: text().$type<IdentityStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('identity_users_status_check', sql`${table.status} in ('active', 'disabled')`)],
)

export const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    issuer: text().notNull(),
    subject: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'external_identities_issuer_subject_not_blank_check',
      sql`${table.issuer} ~ U&'[^[:space:]\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]' and ${table.subject} ~ U&'[^[:space:]\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]'`,
    ),
    unique('external_identities_issuer_subject_unique').on(table.issuer, table.subject),
    index('external_identities_user_id_idx').on(table.userId),
  ],
)

export const companies = pgTable(
  'companies',
  {
    id: uuid().defaultRandom().primaryKey(),
    status: text().$type<CompanyStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('companies_status_check', sql`${table.status} in ('active', 'disabled')`)],
)

export const userCompanyMemberships = pgTable(
  'user_company_memberships',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    status: text().$type<MembershipStatus>().notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('user_company_memberships_status_check', sql`${table.status} in ('active', 'disabled')`),
    unique('user_company_memberships_user_company_unique').on(table.userId, table.companyId),
    index('user_company_memberships_company_id_idx').on(table.companyId),
    index('user_company_memberships_user_id_idx').on(table.userId),
  ],
)

export const membershipRoles = pgTable(
  'membership_roles',
  {
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => userCompanyMemberships.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),
    role: text().$type<CompanyRole>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'membership_roles_role_check',
      sql`${table.role} in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer')`,
    ),
    primaryKey({
      columns: [table.membershipId, table.role],
      name: 'membership_roles_membership_id_role_pk',
    }),
  ],
)
