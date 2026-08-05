/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { COMPANY_ROLES, companies, userCompanyMemberships } from './identity.schema.js'

/**
 * `superseded` é o convite que um reenvio invalidou. Expiração não é situação: sai de
 * `expires_at`, e duplicá-la em coluna abriria a chance de os dois discordarem.
 */
export const USER_INVITATION_STATUSES = ['pending', 'accepted', 'superseded', 'revoked'] as const
export type UserInvitationStatus = (typeof USER_INVITATION_STATUSES)[number]

const USER_INVITATION_STATUS_LIST = sql.raw(
  USER_INVITATION_STATUSES.map((status) => `'${status}'`).join(', '),
)

const COMPANY_ROLE_LIST = sql.raw(COMPANY_ROLES.map((role) => `'${role}'`).join(', '))

export const userInvitations = pgTable(
  'user_invitations',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    userId: uuid('user_id').notNull(),
    /** SHA-256 do código em hexadecimal. O código em claro nunca é persistido. */
    codeHash: text('code_hash').notNull(),
    status: text().$type<UserInvitationStatus>().notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'user_invitations_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    // O alvo do convite é um vínculo daquela empresa por construção: o banco recusa convidar
    // usuário de outro tenant, sem depender de a query lembrar do filtro.
    foreignKey({
      columns: [table.userId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'user_invitations_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('user_invitations_company_id_id_unique').on(table.companyId, table.id),
    // A rota de ativação não é autenticada e não tem empresa no contexto: ela chega ao convite
    // pelo hash, então o hash precisa ser determinístico no banco inteiro.
    unique('user_invitations_code_hash_unique').on(table.codeHash),
    // Reenvio invalida o anterior — a regra vive no banco, não só no domínio.
    uniqueIndex('user_invitations_company_id_user_id_pending_unique')
      .on(table.companyId, table.userId)
      .where(sql`${table.status} = 'pending'`),
    index('user_invitations_company_id_status_idx').on(table.companyId, table.status),
    check(
      'user_invitations_status_check',
      sql`${table.status} in (${USER_INVITATION_STATUS_LIST})`,
    ),
    check('user_invitations_code_hash_check', sql`${table.codeHash} ~ '^[0-9a-f]{64}$'`),
    check('user_invitations_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check('user_invitations_expires_at_check', sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      'user_invitations_accepted_at_check',
      sql`(${table.status} = 'accepted') = (${table.acceptedAt} is not null)`,
    ),
  ],
)

/**
 * Perfis pretendidos: só viram `membership_roles` quando a pessoa troca o código por senha.
 * Convite pendente não concede permissão nenhuma.
 */
export const userInvitationRoles = pgTable(
  'user_invitation_roles',
  {
    invitationId: uuid('invitation_id').notNull(),
    companyId: uuid('company_id').notNull(),
    role: text().$type<(typeof COMPANY_ROLES)[number]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.invitationId, table.companyId],
      foreignColumns: [userInvitations.id, userInvitations.companyId],
      name: 'user_invitation_roles_invitation_fk',
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    primaryKey({
      columns: [table.invitationId, table.role],
      name: 'user_invitation_roles_invitation_id_role_pk',
    }),
    index('user_invitation_roles_company_id_idx').on(table.companyId),
    check('user_invitation_roles_role_check', sql`${table.role} in (${COMPANY_ROLE_LIST})`),
  ],
)
