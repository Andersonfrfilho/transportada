/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import {
  COMPANY_ROLES,
  companies,
  databaseSchema,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../src/database/database.schema.js'
import {
  COMPANY_ROLES as directCompanyRoles,
  companies as directCompanies,
  externalIdentities as directExternalIdentities,
  identityUsers as directIdentityUsers,
  membershipRoles as directMembershipRoles,
  userCompanyMemberships as directUserCompanyMemberships,
} from '../src/database/identity.schema.js'

const columnNames = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).columns.map((column) => column.name)

const indexNames = (table: Parameters<typeof getTableConfig>[0]): readonly (string | undefined)[] =>
  getTableConfig(table).indexes.map((index) => index.config.name)

const uniqueConstraintNames = (
  table: Parameters<typeof getTableConfig>[0],
): readonly (string | undefined)[] =>
  getTableConfig(table).uniqueConstraints.map((constraint) => constraint.name)

const dialect = new PgDialect()
const checkSql = (table: Parameters<typeof getTableConfig>[0]): readonly string[] =>
  getTableConfig(table).checks.map((constraint) => dialect.sqlToQuery(constraint.value).sql)

describe('tenant identity schema', () => {
  test('keeps the database schema aggregator compatible with the identity module', () => {
    expect(COMPANY_ROLES).toBe(directCompanyRoles)
    expect(companies).toBe(directCompanies)
    expect(externalIdentities).toBe(directExternalIdentities)
    expect(identityUsers).toBe(directIdentityUsers)
    expect(membershipRoles).toBe(directMembershipRoles)
    expect(userCompanyMemberships).toBe(directUserCompanyMemberships)

    expect(databaseSchema).toEqual({
      companies: directCompanies,
      externalIdentities: directExternalIdentities,
      identityUsers: directIdentityUsers,
      membershipRoles: directMembershipRoles,
      userCompanyMemberships: directUserCompanyMemberships,
    })
  })

  test('defines only company-scoped roles on memberships', () => {
    expect(COMPANY_ROLES).toEqual(['company-admin', 'finance', 'fiscal', 'operator', 'viewer'])
    expect(COMPANY_ROLES).not.toContain('platform-admin')
  })

  test('defines the five tables from the minimum identity schema', () => {
    expect(
      [identityUsers, externalIdentities, companies, userCompanyMemberships, membershipRoles].map(
        (table) => getTableConfig(table).name,
      ),
    ).toEqual([
      'identity_users',
      'external_identities',
      'companies',
      'user_company_memberships',
      'membership_roles',
    ])

    expect(columnNames(identityUsers)).toEqual(['id', 'status', 'created_at', 'updated_at'])
    expect(columnNames(externalIdentities)).toEqual([
      'id',
      'user_id',
      'issuer',
      'subject',
      'created_at',
      'updated_at',
    ])
    expect(columnNames(companies)).toEqual(['id', 'status', 'created_at', 'updated_at'])
    expect(columnNames(userCompanyMemberships)).toEqual([
      'id',
      'user_id',
      'company_id',
      'status',
      'created_at',
      'updated_at',
    ])
    expect(columnNames(membershipRoles)).toEqual([
      'membership_id',
      'role',
      'created_at',
      'updated_at',
    ])
  })

  test('uses generated UUID keys, required UTC timestamps, and status checks', () => {
    for (const table of [identityUsers, externalIdentities, companies, userCompanyMemberships]) {
      const id = getTableConfig(table).columns.find((column) => column.name === 'id')

      expect(id?.primary).toBeTrue()
      expect(id?.notNull).toBeTrue()
      expect(id?.hasDefault).toBeTrue()
      expect(id?.getSQLType()).toBe('uuid')
    }

    for (const table of [
      identityUsers,
      externalIdentities,
      companies,
      userCompanyMemberships,
      membershipRoles,
    ]) {
      const timestampColumns = getTableConfig(table).columns.filter((column) =>
        column.name.endsWith('_at'),
      )

      for (const column of timestampColumns) {
        expect(column.notNull).toBeTrue()
        expect(column.hasDefault).toBeTrue()
        expect(column.getSQLType()).toBe('timestamp with time zone')
      }
    }

    expect(getTableConfig(identityUsers).checks.map((constraint) => constraint.name)).toEqual([
      'identity_users_status_check',
    ])
    expect(getTableConfig(companies).checks.map((constraint) => constraint.name)).toEqual([
      'companies_status_check',
    ])
    expect(
      getTableConfig(userCompanyMemberships).checks.map((constraint) => constraint.name),
    ).toEqual(['user_company_memberships_status_check'])
    expect(getTableConfig(membershipRoles).checks.map((constraint) => constraint.name)).toEqual([
      'membership_roles_role_check',
    ])

    expect(checkSql(identityUsers)).toEqual([`"identity_users"."status" in ('active', 'disabled')`])
    expect(checkSql(companies)).toEqual([`"companies"."status" in ('active', 'disabled')`])
    expect(checkSql(userCompanyMemberships)).toEqual([
      `"user_company_memberships"."status" in ('active', 'disabled')`,
    ])
    expect(checkSql(membershipRoles)).toEqual([
      `"membership_roles"."role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer')`,
    ])
  })

  test('makes issuer and subject globally unique as one external identity', () => {
    const config = getTableConfig(externalIdentities)
    const identityUnique = config.uniqueConstraints.find(
      (constraint) => constraint.name === 'external_identities_issuer_subject_unique',
    )

    expect(identityUnique?.columns.map((column) => column.name)).toEqual(['issuer', 'subject'])
    expect(indexNames(externalIdentities)).toContain('external_identities_user_id_idx')
    expect(config.checks.map((constraint) => constraint.name)).toEqual([
      'external_identities_issuer_subject_not_blank_check',
    ])
    expect(checkSql(externalIdentities)).toEqual([
      `"external_identities"."issuer" ~ U&'[^[:space:]\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]' and "external_identities"."subject" ~ U&'[^[:space:]\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF]'`,
    ])
  })

  test('links memberships to users and companies without destructive cascades', () => {
    const requiredExternalIdentityColumns = getTableConfig(externalIdentities).columns.filter(
      (column) => ['user_id', 'issuer', 'subject'].includes(column.name),
    )
    const requiredMembershipColumns = getTableConfig(userCompanyMemberships).columns.filter(
      (column) => ['user_id', 'company_id', 'status'].includes(column.name),
    )
    const requiredRoleColumns = getTableConfig(membershipRoles).columns.filter((column) =>
      ['membership_id', 'role'].includes(column.name),
    )
    const externalIdentityForeignKey = getTableConfig(externalIdentities).foreignKeys[0]
    const membershipForeignKeys = getTableConfig(userCompanyMemberships).foreignKeys

    expect(requiredExternalIdentityColumns).toHaveLength(3)
    expect(requiredMembershipColumns).toHaveLength(3)
    expect(requiredRoleColumns).toHaveLength(2)
    expect(requiredExternalIdentityColumns.every((column) => column.notNull)).toBeTrue()
    expect(requiredMembershipColumns.every((column) => column.notNull)).toBeTrue()
    expect(requiredRoleColumns.every((column) => column.notNull)).toBeTrue()

    expect(externalIdentityForeignKey?.reference().foreignTable).toBe(identityUsers)
    expect(externalIdentityForeignKey?.onDelete).toBe('restrict')

    expect(
      membershipForeignKeys.map((foreignKey) => ({
        column: foreignKey.reference().columns[0]?.name,
        foreignTable: getTableConfig(foreignKey.reference().foreignTable).name,
        onDelete: foreignKey.onDelete,
      })),
    ).toEqual([
      {
        column: 'user_id',
        foreignTable: 'identity_users',
        onDelete: 'restrict',
      },
      {
        column: 'company_id',
        foreignTable: 'companies',
        onDelete: 'restrict',
      },
    ])
  })

  test('supports multiple roles per membership and indexes tenant lookups', () => {
    const roleConfig = getTableConfig(membershipRoles)
    const roleForeignKey = roleConfig.foreignKeys[0]

    expect(uniqueConstraintNames(userCompanyMemberships)).toContain(
      'user_company_memberships_user_company_unique',
    )
    expect(indexNames(userCompanyMemberships)).toEqual([
      'user_company_memberships_company_id_idx',
      'user_company_memberships_user_id_idx',
    ])

    expect(roleConfig.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'membership_id',
      'role',
    ])
    expect(roleForeignKey?.reference().foreignTable).toBe(userCompanyMemberships)
    expect(roleForeignKey?.onDelete).toBe('cascade')
  })
})
