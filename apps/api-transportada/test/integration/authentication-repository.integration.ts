/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import { externalIdentities, identityUsers } from '../../src/database/database.schema'
import { DrizzleExternalIdentityRepository } from '../../src/identity/infrastructure/drizzle-external-identity.repository'

const databaseUrl = process.env.API_TEST_DATABASE_URL ?? process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('Drizzle external identity repository', () => {
  testWithPostgres(
    'uses the complete issuer/subject pair and excludes disabled users',
    async () => {
      if (databaseUrl === undefined) {
        throw new Error('API_TEST_DATABASE_URL or DATABASE_URL is required')
      }

      const admin = new SQL(databaseUrl, { max: 1 })
      const databaseName = `transportada_t010_${crypto.randomUUID().replaceAll('-', '')}`
      const disposableUrl = new URL(databaseUrl)
      disposableUrl.pathname = `/${databaseName}`
      disposableUrl.search = ''
      let database: ReturnType<typeof createDrizzleProvider> | undefined

      try {
        // Disposable database identifiers cannot be parameterized.
        await admin.unsafe(`create database "${databaseName}"`)
        await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
        database = createDrizzleProvider({ connection: disposableUrl.toString() })

        const repository = new DrizzleExternalIdentityRepository(database.db)
        const activeUserId = crypto.randomUUID()
        const otherIssuerUserId = crypto.randomUUID()
        const disabledUserId = crypto.randomUUID()
        const issuer = `https://identity.example.test/realms/${crypto.randomUUID()}`
        const otherIssuer = `https://identity.example.test/realms/${crypto.randomUUID()}`
        const subject = crypto.randomUUID()

        await database.db.insert(identityUsers).values([
          { id: activeUserId, status: 'active' },
          { id: otherIssuerUserId, status: 'active' },
          { id: disabledUserId, status: 'disabled' },
        ])
        await database.db.insert(externalIdentities).values([
          { issuer, subject, userId: activeUserId },
          { issuer: otherIssuer, subject, userId: otherIssuerUserId },
          { issuer, subject: 'disabled-user', userId: disabledUserId },
        ])

        await expect(
          repository.findActiveByIssuerAndSubject({ issuer, subject }),
        ).resolves.toMatchObject({ userId: activeUserId })
        await expect(
          repository.findActiveByIssuerAndSubject({ issuer: otherIssuer, subject }),
        ).resolves.toMatchObject({ userId: otherIssuerUserId })
        await expect(
          repository.findActiveByIssuerAndSubject({ issuer, subject: 'disabled-user' }),
        ).resolves.toBeNull()
        await expect(
          repository.findActiveByIssuerAndSubject({ issuer, subject: 'unknown-subject' }),
        ).resolves.toBeNull()
        await expect(
          repository.findActiveByIssuerAndSubject({
            issuer: 'https://unknown.example',
            subject,
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
