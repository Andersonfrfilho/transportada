/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import {
  databaseSchema,
  USER_INVITATION_STATUSES,
  userInvitationRoles,
  userInvitations,
} from '../../src/database/database.schema.js'
import {
  USER_INVITATION_STATUSES as directStatuses,
  userInvitationRoles as directInvitationRoles,
  userInvitations as directInvitations,
} from '../../src/database/user-invitation.schema.js'
import { userCompanyMemberships } from '../../src/database/identity.schema.js'

const dialect = new PgDialect()

const columnNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).columns.map((column) => column.name)

const checkNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).checks.map((constraint) => constraint.name)

const checkSql = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
): string | undefined => {
  const constraint = getTableConfig(table)
    .checks.filter((candidate) => candidate.name === name)
    .at(0)

  return constraint === undefined ? undefined : dialect.sqlToQuery(constraint.value).sql
}

describe('user invitation schema', () => {
  test('keeps the database schema aggregator compatible with the invitation tables', () => {
    expect(USER_INVITATION_STATUSES).toBe(directStatuses)
    expect(userInvitations).toBe(directInvitations)
    expect(userInvitationRoles).toBe(directInvitationRoles)
    expect(databaseSchema).toMatchObject({
      userInvitationRoles: directInvitationRoles,
      userInvitations: directInvitations,
    })
  })

  test('names the two tables the invitation lifecycle needs', () => {
    expect(
      [userInvitations, userInvitationRoles].map((table) => getTableConfig(table).name),
    ).toEqual(['user_invitations', 'user_invitation_roles'])
  })

  test('carries the target, the company, the code hash, the validity and the attempts', () => {
    expect(columnNames(userInvitations)).toEqual([
      'id',
      'company_id',
      'user_id',
      'code_hash',
      'sealed_code',
      'delivered_at',
      'status',
      'attempt_count',
      'expires_at',
      'accepted_at',
      'created_at',
      'updated_at',
    ])
    expect(columnNames(userInvitationRoles)).toEqual([
      'invitation_id',
      'company_id',
      'role',
      'created_at',
    ])
  })

  test('stores only the hash of the code, never a column that could hold it in clear', () => {
    expect(columnNames(userInvitations)).not.toContain('code')
    expect(checkSql(userInvitations, 'user_invitations_code_hash_check')).toBe(
      `"user_invitations"."code_hash" ~ '^[0-9a-f]{64}$'`,
    )
  })

  test('generates the identifier and requires every business column', () => {
    const config = getTableConfig(userInvitations)
    const identifier = config.columns.filter((column) => column.name === 'id').at(0)

    expect(identifier?.primary).toBeTrue()
    expect(identifier?.hasDefault).toBeTrue()
    expect(identifier?.getSQLType()).toBe('uuid')

    for (const column of config.columns) {
      // O envelope do código e a marca de entrega nascem vazios: o convite existe antes de sair.
      const optional = ['accepted_at', 'sealed_code', 'delivered_at'].includes(column.name)
      expect(column.notNull).toBe(!optional)
    }
    for (const column of getTableConfig(userInvitationRoles).columns) {
      expect(column.notNull).toBeTrue()
    }
  })

  test('keeps every instant in UTC and defaults only the ones the database owns', () => {
    for (const table of [userInvitations, userInvitationRoles]) {
      for (const column of getTableConfig(table).columns.filter((candidate) =>
        candidate.name.endsWith('_at'),
      )) {
        expect(column.getSQLType()).toBe('timestamp with time zone')
      }
    }

    const config = getTableConfig(userInvitations)
    const defaulted = config.columns
      .filter((column) => column.hasDefault)
      .map((column) => column.name)

    expect(defaulted).toEqual(['id', 'status', 'attempt_count', 'created_at', 'updated_at'])
    expect(config.columns.filter((column) => column.name === 'expires_at').at(0)?.hasDefault).toBe(
      false,
    )
  })

  test('ties the invitation to a membership of that same company', () => {
    const foreignKeys = getTableConfig(userInvitations).foreignKeys.map((foreignKey) => ({
      columns: foreignKey.reference().columns.map((column) => column.name),
      foreignColumns: foreignKey.reference().foreignColumns.map((column) => column.name),
      foreignTable: getTableConfig(foreignKey.reference().foreignTable).name,
      onDelete: foreignKey.onDelete,
    }))

    expect(foreignKeys).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        onDelete: 'restrict',
      },
      {
        columns: ['user_id', 'company_id'],
        foreignColumns: ['user_id', 'company_id'],
        foreignTable: 'user_company_memberships',
        onDelete: 'restrict',
      },
    ])
    expect(getTableConfig(userInvitations).foreignKeys[1]?.reference().foreignTable).toBe(
      userCompanyMemberships,
    )
  })

  test('lets a single pending invitation exist per person and company', () => {
    const pending = getTableConfig(userInvitations)
      .indexes.filter(
        (index) => index.config.name === 'user_invitations_company_id_user_id_pending_unique',
      )
      .at(0)

    expect(pending?.config.unique).toBeTrue()
    expect(pending?.config.columns.map((column) => (column as { name?: string }).name)).toEqual([
      'company_id',
      'user_id',
    ])
    expect(
      pending?.config.where === undefined
        ? undefined
        : dialect.sqlToQuery(pending.config.where).sql,
    ).toBe(`"user_invitations"."status" = 'pending'`)
  })

  test('finds the invitation by hash alone, because activation has no company in context', () => {
    const uniqueConstraints = getTableConfig(userInvitations).uniqueConstraints.map(
      (constraint) => ({
        columns: constraint.columns.map((column) => column.name),
        name: constraint.name,
      }),
    )

    expect(uniqueConstraints).toEqual([
      { columns: ['company_id', 'id'], name: 'user_invitations_company_id_id_unique' },
      { columns: ['code_hash'], name: 'user_invitations_code_hash_unique' },
    ])
  })

  test('guards the lifecycle with checks instead of trusting the application', () => {
    expect(checkNames(userInvitations)).toEqual([
      'user_invitations_status_check',
      'user_invitations_code_hash_check',
      'user_invitations_attempt_count_check',
      'user_invitations_expires_at_check',
      'user_invitations_accepted_at_check',
    ])
    expect(USER_INVITATION_STATUSES).toEqual(['pending', 'accepted', 'superseded', 'revoked'])
    expect(checkSql(userInvitations, 'user_invitations_status_check')).toBe(
      `"user_invitations"."status" in ('pending', 'accepted', 'superseded', 'revoked')`,
    )
    expect(checkSql(userInvitations, 'user_invitations_attempt_count_check')).toBe(
      `"user_invitations"."attempt_count" >= 0`,
    )
    expect(checkSql(userInvitations, 'user_invitations_expires_at_check')).toBe(
      `"user_invitations"."expires_at" > "user_invitations"."created_at"`,
    )
    expect(checkSql(userInvitations, 'user_invitations_accepted_at_check')).toBe(
      `("user_invitations"."status" = 'accepted') = ("user_invitations"."accepted_at" is not null)`,
    )
  })

  test('holds the intended roles as rows, restricted to the company roles', () => {
    const config = getTableConfig(userInvitationRoles)

    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'invitation_id',
      'role',
    ])
    expect(config.foreignKeys[0]?.reference().foreignTable).toBe(userInvitations)
    expect(config.foreignKeys[0]?.onDelete).toBe('cascade')
    expect(checkSql(userInvitationRoles, 'user_invitation_roles_role_check')).toBe(
      `"user_invitation_roles"."role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate')`,
    )
  })
})
