/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  externalIdentities,
  identityUsers,
  membershipRoles,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import {
  LOCAL_COMPANY_ID,
  LOCAL_EXTERNAL_IDENTITY_ID,
  LOCAL_IDENTITY_USER_ID,
  LOCAL_KEYCLOAK_ISSUER,
  LOCAL_KEYCLOAK_SUBJECT,
  LOCAL_MEMBERSHIP_ID,
} from '../../src/database/local-identity-seed.constant'
import { LocalIdentitySeedConflictError } from '../../src/database/local-identity-seed.error'
import { runLocalIdentitySeed } from '../../src/database/local-identity-seed.service'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('local application identity seed', () => {
  test('rejects execution outside local and test before opening the database', async () => {
    await expect(
      runLocalIdentitySeed({
        appEnvironment: 'production',
        connectionString: 'postgresql://unused:unused@localhost:1/unused',
        issuer: LOCAL_KEYCLOAK_ISSUER,
        projectName: 'transportada',
      }),
    ).rejects.toThrow('Local identity seed is restricted to local and test environments')
  })

  test('rejects a different project before opening the database', async () => {
    await expect(
      runLocalIdentitySeed({
        appEnvironment: 'local',
        connectionString: 'postgresql://unused:unused@localhost:1/unused',
        issuer: LOCAL_KEYCLOAK_ISSUER,
        projectName: 'another-project',
      }),
    ).rejects.toThrow('PROJECT_NAME must match the local TransportAdA project')
  })

  test('rejects a different issuer before opening the database', async () => {
    await expect(
      runLocalIdentitySeed({
        appEnvironment: 'local',
        connectionString: 'postgresql://unused:unused@localhost:1/unused',
        issuer: 'http://localhost:58080/realms/another-realm',
        projectName: 'transportada',
      }),
    ).rejects.toThrow('KEYCLOAK_ISSUER must match the versioned local realm')
  })

  testWithPostgres(
    'serializes concurrent applications, remains idempotent, and preserves unrelated data',
    async () => {
      await withDisposableDatabase('idempotent', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })
        const unrelatedCompanyId = crypto.randomUUID()

        try {
          await provider.db.insert(companies).values({
            id: unrelatedCompanyId,
            status: 'disabled',
          })

          await Promise.all([
            runLocalIdentitySeed({
              appEnvironment: 'test',
              connectionString,
              issuer: LOCAL_KEYCLOAK_ISSUER,
              projectName: 'transportada',
            }),
            runLocalIdentitySeed({
              appEnvironment: 'test',
              connectionString,
              issuer: LOCAL_KEYCLOAK_ISSUER,
              projectName: 'transportada',
            }),
          ])
          await runLocalIdentitySeed({
            appEnvironment: 'test',
            connectionString,
            issuer: LOCAL_KEYCLOAK_ISSUER,
            projectName: 'transportada',
          })

          expect(
            await provider.db
              .select({ id: companies.id, status: companies.status })
              .from(companies)
              .where(eq(companies.id, LOCAL_COMPANY_ID)),
          ).toEqual([{ id: LOCAL_COMPANY_ID, status: 'active' }])
          expect(
            await provider.db
              .select({ id: identityUsers.id, status: identityUsers.status })
              .from(identityUsers)
              .where(eq(identityUsers.id, LOCAL_IDENTITY_USER_ID)),
          ).toEqual([{ id: LOCAL_IDENTITY_USER_ID, status: 'active' }])
          expect(
            await provider.db
              .select({
                id: externalIdentities.id,
                issuer: externalIdentities.issuer,
                subject: externalIdentities.subject,
                userId: externalIdentities.userId,
              })
              .from(externalIdentities)
              .where(eq(externalIdentities.id, LOCAL_EXTERNAL_IDENTITY_ID)),
          ).toEqual([
            {
              id: LOCAL_EXTERNAL_IDENTITY_ID,
              issuer: LOCAL_KEYCLOAK_ISSUER,
              subject: LOCAL_KEYCLOAK_SUBJECT,
              userId: LOCAL_IDENTITY_USER_ID,
            },
          ])
          expect(
            await provider.db
              .select({
                companyId: userCompanyMemberships.companyId,
                id: userCompanyMemberships.id,
                status: userCompanyMemberships.status,
                userId: userCompanyMemberships.userId,
              })
              .from(userCompanyMemberships)
              .where(eq(userCompanyMemberships.id, LOCAL_MEMBERSHIP_ID)),
          ).toEqual([
            {
              companyId: LOCAL_COMPANY_ID,
              id: LOCAL_MEMBERSHIP_ID,
              status: 'active',
              userId: LOCAL_IDENTITY_USER_ID,
            },
          ])
          expect(
            await provider.db
              .select({ role: membershipRoles.role })
              .from(membershipRoles)
              .where(eq(membershipRoles.membershipId, LOCAL_MEMBERSHIP_ID))
              .orderBy(asc(membershipRoles.role)),
          ).toEqual([{ role: 'viewer' }])
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
    'fails an inconsistent conflict without partially creating identity data',
    async () => {
      await withDisposableDatabase('conflict', async (connectionString) => {
        const provider = createDrizzleProvider({ connection: connectionString })
        const conflictingExternalIdentityId = crypto.randomUUID()
        const conflictingUserId = crypto.randomUUID()

        try {
          await provider.db.insert(identityUsers).values({
            id: conflictingUserId,
            status: 'active',
          })
          await provider.db.insert(externalIdentities).values({
            id: conflictingExternalIdentityId,
            issuer: LOCAL_KEYCLOAK_ISSUER,
            subject: LOCAL_KEYCLOAK_SUBJECT,
            userId: conflictingUserId,
          })

          await expect(
            runLocalIdentitySeed({
              appEnvironment: 'test',
              connectionString,
              issuer: LOCAL_KEYCLOAK_ISSUER,
              projectName: 'transportada',
            }),
          ).rejects.toBeInstanceOf(LocalIdentitySeedConflictError)

          expect(
            await provider.db
              .select({ id: companies.id })
              .from(companies)
              .where(eq(companies.id, LOCAL_COMPANY_ID)),
          ).toHaveLength(0)
          expect(
            await provider.db
              .select({ id: identityUsers.id })
              .from(identityUsers)
              .where(eq(identityUsers.id, LOCAL_IDENTITY_USER_ID)),
          ).toHaveLength(0)
          expect(
            await provider.db
              .select({
                id: externalIdentities.id,
                userId: externalIdentities.userId,
              })
              .from(externalIdentities)
              .where(eq(externalIdentities.id, conflictingExternalIdentityId)),
          ).toEqual([{ id: conflictingExternalIdentityId, userId: conflictingUserId }])
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
  const databaseName = `transportada_t014b_${suffix}_${crypto.randomUUID().replaceAll('-', '')}`
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
