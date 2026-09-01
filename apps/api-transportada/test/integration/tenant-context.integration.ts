/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository'

const databaseUrl = process.env.API_TEST_DATABASE_URL ?? process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('tenant context isolation', () => {
  testWithPostgres(
    'resolves roles only from the active membership for the selected user and company',
    async () => {
      if (databaseUrl === undefined) {
        throw new Error('API_TEST_DATABASE_URL or DATABASE_URL is required')
      }

      const admin = new SQL(databaseUrl, { max: 1 })
      const databaseName = `transportada_t011_${crypto.randomUUID().replaceAll('-', '')}`
      const disposableUrl = new URL(databaseUrl)
      disposableUrl.pathname = `/${databaseName}`
      disposableUrl.search = ''
      let database: ReturnType<typeof createDrizzleProvider> | undefined

      try {
        await admin.unsafe(`create database "${databaseName}"`)
        await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
        database = createDrizzleProvider({ connection: disposableUrl.toString() })

        const userA = crypto.randomUUID()
        const userB = crypto.randomUUID()
        const userC = crypto.randomUUID()
        const companyA = crypto.randomUUID()
        const companyB = crypto.randomUUID()
        const disabledCompany = crypto.randomUUID()
        const membershipA = crypto.randomUUID()
        const membershipB = crypto.randomUUID()
        const membershipAInB = crypto.randomUUID()
        const membershipWithoutRoles = crypto.randomUUID()
        const disabledMembership = crypto.randomUUID()
        const disabledCompanyMembership = crypto.randomUUID()

        await database.db
          .insert(identityUsers)
          .values([{ id: userA }, { id: userB }, { id: userC }])
        await database.db
          .insert(companies)
          .values([{ id: companyA }, { id: companyB }, { id: disabledCompany, status: 'disabled' }])
        await database.db.insert(userCompanyMemberships).values([
          { companyId: companyA, id: membershipA, userId: userA },
          { companyId: companyB, id: membershipB, userId: userB },
          { companyId: companyB, id: membershipAInB, userId: userA },
          { companyId: companyA, id: membershipWithoutRoles, userId: userC },
          {
            companyId: companyB,
            id: disabledMembership,
            status: 'disabled',
            userId: userC,
          },
          {
            companyId: disabledCompany,
            id: disabledCompanyMembership,
            userId: userC,
          },
        ])
        await database.db.insert(membershipRoles).values([
          { membershipId: membershipA, role: 'viewer' },
          { membershipId: membershipA, role: 'fiscal' },
          { membershipId: membershipB, role: 'company-admin' },
          { membershipId: membershipAInB, role: 'finance' },
          { membershipId: disabledMembership, role: 'operator' },
          { membershipId: disabledCompanyMembership, role: 'operator' },
        ])

        const repository = new DrizzleMembershipRepository(database.db)

        await expect(
          repository.findActiveByUserAndCompany({ companyId: companyA, userId: userA }),
        ).resolves.toEqual({
          grantedPermissions: [],
          membershipId: membershipA,
          roles: ['fiscal', 'viewer'],
        })
        await expect(
          repository.findActiveByUserAndCompany({ companyId: companyB, userId: userA }),
        ).resolves.toEqual({
          grantedPermissions: [],
          membershipId: membershipAInB,
          roles: ['finance'],
        })
        await expect(
          repository.findActiveByUserAndCompany({ companyId: companyB, userId: userB }),
        ).resolves.toEqual({
          grantedPermissions: [],
          membershipId: membershipB,
          roles: ['company-admin'],
        })
        await expect(
          repository.findActiveByUserAndCompany({ companyId: companyA, userId: userB }),
        ).resolves.toBeNull()
        await expect(
          repository.findActiveByUserAndCompany({ companyId: companyA, userId: userC }),
        ).resolves.toEqual({
          grantedPermissions: [],
          membershipId: membershipWithoutRoles,
          roles: [],
        })
        await expect(
          repository.findActiveByUserAndCompany({ companyId: companyB, userId: userC }),
        ).resolves.toBeNull()
        await expect(
          repository.findActiveByUserAndCompany({
            companyId: disabledCompany,
            userId: userC,
          }),
        ).resolves.toBeNull()
      } finally {
        try {
          await database?.close()
        } finally {
          try {
            await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
          } finally {
            await admin.close({ timeout: 0 })
          }
        }
      }
    },
    30_000,
  )
})
