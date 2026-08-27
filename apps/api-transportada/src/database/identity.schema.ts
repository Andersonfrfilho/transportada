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
export const COMPANY_ROLES = [
  'company-admin',
  'finance',
  'fiscal',
  'operator',
  'viewer',
  'driver',
  'aggregate',
  'separator',
  /**
   * ADR-0050: o **contratante** — quem paga o frete — com conta própria. Ele não é gente da
   * transportadora: o que ele alcança são os documentos amarrados em `contractor_portal_bindings`,
   * e nada da empresa fora deles.
   */
  'contractor',
  /**
   * ADR-0047: o papel do **serviço**, não de gente. Ele existe para a membership sintética do worker
   * — é ela que a API valida quando o token de máquina diz em que empresa está agindo — e concede uma
   * permissão só. Um serviço que pode tudo o que um operador pode é um operador com senha que
   * ninguém troca.
   *
   * Ele **não** entra no CHECK de `user_invitation_roles`: não se convida um robô.
   */
  'automation',
] as const
export type CompanyRole = (typeof COMPANY_ROLES)[number]

/**
 * ADR-0047: **não se convida um robô.** `automation` é papel de service account, atribuído pelo
 * provisionamento da membership sintética — nunca por convite. Derivar o CHECK do convite de
 * `COMPANY_ROLES` inteiro deixaria alguém convidar uma pessoa para o papel do worker, com a
 * permissão que dispara emissão fiscal.
 */
export const SERVICE_COMPANY_ROLES: readonly CompanyRole[] = ['automation']

export const INVITABLE_COMPANY_ROLES = COMPANY_ROLES.filter(
  (role) => !SERVICE_COMPANY_ROLES.includes(role),
)

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
    unique('user_company_memberships_id_company_id_unique').on(table.id, table.companyId),
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
      // `automation` é o papel do service account (ADR-0047) — cabe aqui e **não** no CHECK do convite
      sql`${table.role} in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate', 'separator', 'contractor', 'automation')`,
    ),
    primaryKey({
      columns: [table.membershipId, table.role],
      name: 'membership_roles_membership_id_role_pk',
    }),
  ],
)
