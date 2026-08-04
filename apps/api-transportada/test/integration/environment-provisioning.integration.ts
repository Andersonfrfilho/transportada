/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { EnvironmentProvisioningConflictError } from '../../src/database/environment-provisioning.error'
import { runEnvironmentProvisioning } from '../../src/database/environment-provisioning.service'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000b1'
const ADMIN_SUBJECT = '00000000-0000-4000-8000-0000000000b2'
const ISSUER = 'https://identity.example.test/realms/transportada'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

function provisioningInput(connectionString: string) {
  return {
    adminSubject: ADMIN_SUBJECT,
    companyId: COMPANY_ID,
    connectionString,
    issuer: ISSUER,
  }
}

describe('environment provisioning', () => {
  testWithPostgres(
    'creates the environment company and the first company-admin, and repeating creates nothing',
    async () => {
      await withDisposableDatabase('first-run', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })

        try {
          const first = await runEnvironmentProvisioning(provisioningInput(connectionString))

          expect(first.companyId).toBe(COMPANY_ID)
          expect([...first.created].sort()).toEqual([
            'company',
            'company-admin-role',
            'external-identity',
            'identity-user',
            'membership',
          ])

          expect(
            await provider.db
              .select({ id: companies.id, status: companies.status })
              .from(companies)
              .where(eq(companies.id, COMPANY_ID)),
          ).toEqual([{ id: COMPANY_ID, status: 'active' }])
          expect(
            await provider.db
              .select({ id: identityUsers.id, status: identityUsers.status })
              .from(identityUsers)
              .where(eq(identityUsers.id, first.adminUserId)),
          ).toEqual([{ id: first.adminUserId, status: 'active' }])
          expect(
            await provider.db
              .select({ subject: externalIdentities.subject, userId: externalIdentities.userId })
              .from(externalIdentities)
              .where(
                and(
                  eq(externalIdentities.issuer, ISSUER),
                  eq(externalIdentities.subject, ADMIN_SUBJECT),
                ),
              ),
          ).toEqual([{ subject: ADMIN_SUBJECT, userId: first.adminUserId }])
          expect(
            await provider.db
              .select({
                companyId: userCompanyMemberships.companyId,
                status: userCompanyMemberships.status,
                userId: userCompanyMemberships.userId,
              })
              .from(userCompanyMemberships)
              .where(eq(userCompanyMemberships.id, first.adminMembershipId)),
          ).toEqual([{ companyId: COMPANY_ID, status: 'active', userId: first.adminUserId }])
          expect(
            await provider.db
              .select({ role: membershipRoles.role })
              .from(membershipRoles)
              .where(eq(membershipRoles.membershipId, first.adminMembershipId)),
          ).toEqual([{ role: 'company-admin' }])

          const second = await runEnvironmentProvisioning(provisioningInput(connectionString))

          expect(second).toEqual({ ...first, created: [] })
        } finally {
          await provider.close()
        }
      })
    },
    30_000,
  )

  testWithPostgres(
    'serializes concurrent runs without duplicating the company, the identity or the membership',
    async () => {
      await withDisposableDatabase('concurrent', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })

        try {
          await Promise.all([
            runEnvironmentProvisioning(provisioningInput(connectionString)),
            runEnvironmentProvisioning(provisioningInput(connectionString)),
            runEnvironmentProvisioning(provisioningInput(connectionString)),
          ])

          expect(await provider.db.select({ id: companies.id }).from(companies)).toHaveLength(1)
          expect(
            await provider.db.select({ id: identityUsers.id }).from(identityUsers),
          ).toHaveLength(1)
          expect(
            await provider.db.select({ id: externalIdentities.id }).from(externalIdentities),
          ).toHaveLength(1)
          expect(
            await provider.db
              .select({ id: userCompanyMemberships.id })
              .from(userCompanyMemberships),
          ).toHaveLength(1)
          expect(
            await provider.db.select({ role: membershipRoles.role }).from(membershipRoles),
          ).toEqual([{ role: 'company-admin' }])
        } finally {
          await provider.close()
        }
      })
    },
    30_000,
  )

  testWithPostgres(
    'preserves the roles and the data already in the environment',
    async () => {
      await withDisposableDatabase('preserve', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })
        const unrelatedCompanyId = crypto.randomUUID()

        try {
          await provider.db.insert(companies).values({ id: unrelatedCompanyId, status: 'disabled' })

          const first = await runEnvironmentProvisioning(provisioningInput(connectionString))
          await provider.db
            .insert(membershipRoles)
            .values({ membershipId: first.adminMembershipId, role: 'fiscal' })

          const second = await runEnvironmentProvisioning(provisioningInput(connectionString))

          expect(second.created).toEqual([])
          expect(
            await provider.db
              .select({ role: membershipRoles.role })
              .from(membershipRoles)
              .where(eq(membershipRoles.membershipId, first.adminMembershipId))
              .orderBy(asc(membershipRoles.role)),
          ).toEqual([{ role: 'company-admin' }, { role: 'fiscal' }])
          expect(
            await provider.db
              .select({ id: companies.id, status: companies.status })
              .from(companies)
              .where(eq(companies.id, unrelatedCompanyId)),
          ).toEqual([{ id: unrelatedCompanyId, status: 'disabled' }])
        } finally {
          await provider.close()
        }
      })
    },
    30_000,
  )

  testWithPostgres(
    'refuses to reactivate a disabled membership instead of silently overwriting it',
    async () => {
      await withDisposableDatabase('disabled', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })

        try {
          const first = await runEnvironmentProvisioning(provisioningInput(connectionString))
          await provider.db
            .update(userCompanyMemberships)
            .set({ status: 'disabled' })
            .where(eq(userCompanyMemberships.id, first.adminMembershipId))

          await expect(
            runEnvironmentProvisioning(provisioningInput(connectionString)),
          ).rejects.toBeInstanceOf(EnvironmentProvisioningConflictError)

          expect(
            await provider.db
              .select({ status: userCompanyMemberships.status })
              .from(userCompanyMemberships)
              .where(eq(userCompanyMemberships.id, first.adminMembershipId)),
          ).toEqual([{ status: 'disabled' }])
        } finally {
          await provider.close()
        }
      })
    },
    30_000,
  )

  testWithPostgres(
    'reuses an identity that already exists for the same issuer and subject',
    async () => {
      await withDisposableDatabase('existing-identity', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })
        const existingUserId = crypto.randomUUID()

        try {
          await provider.db.insert(identityUsers).values({ id: existingUserId, status: 'active' })
          await provider.db.insert(externalIdentities).values({
            issuer: ISSUER,
            subject: ADMIN_SUBJECT,
            userId: existingUserId,
          })

          const result = await runEnvironmentProvisioning(provisioningInput(connectionString))

          expect(result.adminUserId).toBe(existingUserId)
          expect([...result.created].sort()).toEqual([
            'company',
            'company-admin-role',
            'membership',
          ])
          expect(await provider.db.select({ id: identityUsers.id }).from(identityUsers)).toEqual([
            { id: existingUserId },
          ])
        } finally {
          await provider.close()
        }
      })
    },
    30_000,
  )
})

type DisposableDatabaseCallback = (connectionString: string) => Promise<void>

async function withDisposableDatabase(
  suffix: string,
  callback: DisposableDatabaseCallback,
): Promise<void> {
  if (databaseUrl === undefined) {
    throw new Error('A PostgreSQL test database URL is required')
  }

  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t000a_${suffix}_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''

  try {
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    await callback(disposableUrl.toString())
  } finally {
    try {
      await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
    } finally {
      await admin.close({ timeout: 0 })
    }
  }
}
