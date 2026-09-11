/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A unicidade do número verificado é um índice parcial, e só um banco de verdade tem índice
 * parcial: repositório falso aceitaria dois donos para o mesmo número sem reclamar.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
  userWhatsAppPhones,
} from '../../src/database/database.schema.js'
import { WhatsAppPhoneTakenError } from '../../src/whatsapp-commands/domain/whatsapp-phone.error.js'
import { DrizzleWhatsAppPhoneRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const PHONE = '5516991234567'
const CODE_HASH = 'b'.repeat(64)

describe('vínculo do WhatsApp — o número tem um dono verificado', () => {
  testWithPostgres('recusa o mesmo número verificado para um segundo usuário', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const first = await seedUser(db)
      const second = await seedUser(db)
      const repository = new DrizzleWhatsAppPhoneRepository(db)

      await repository.saveVerified({ phone: PHONE, userId: first, verifiedAt: new Date() })

      await expect(
        repository.saveVerified({ phone: PHONE, userId: second, verifiedAt: new Date() }),
      ).rejects.toBeInstanceOf(WhatsAppPhoneTakenError)
      expect((await repository.findVerifiedByPhone({ phone: PHONE }))?.userId).toBe(first)
    })
  })

  testWithPostgres('número declarado e ainda não verificado não colide', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const first = await seedUser(db)
      const second = await seedUser(db)
      const repository = new DrizzleWhatsAppPhoneRepository(db)

      await db.insert(userWhatsAppPhones).values({ phone: PHONE, userId: first })
      await repository.saveVerified({ phone: PHONE, userId: second, verifiedAt: new Date() })

      expect((await repository.findVerifiedByPhone({ phone: PHONE }))?.userId).toBe(second)
      expect((await repository.findByUserId({ userId: first }))?.verifiedAt).toBeUndefined()
    })
  })

  testWithPostgres(
    'verificar de novo troca o número do mesmo usuário, e desvincular solta',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const userId = await seedUser(db)
        const repository = new DrizzleWhatsAppPhoneRepository(db)

        await repository.saveVerified({ phone: PHONE, userId, verifiedAt: new Date() })
        await repository.saveVerified({ phone: '5516981112222', userId, verifiedAt: new Date() })
        expect((await repository.findByUserId({ userId }))?.phone).toBe('5516981112222')
        expect(await repository.findVerifiedByPhone({ phone: PHONE })).toBeUndefined()

        await repository.unbindByUserId({ userId })
        expect(await repository.findByUserId({ userId })).toBeUndefined()
      })
    },
  )

  testWithPostgres('abrir pedido fecha o anterior, e o pedido não sai da empresa', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const otherCompanyId = await seedCompany(db)
      const userId = await seedUser(db)
      await db.insert(userCompanyMemberships).values([
        { companyId, userId },
        { companyId: otherCompanyId, userId },
      ])
      const repository = new DrizzleWhatsAppPhoneRepository(db)
      const expiresAt = new Date(Date.now() + 10 * 60_000)

      const firstId = crypto.randomUUID()
      const secondId = crypto.randomUUID()
      await repository.openVerificationRequest({
        codeHash: CODE_HASH,
        companyId,
        expiresAt,
        id: firstId,
        phone: PHONE,
        userId,
      })
      await repository.openVerificationRequest({
        codeHash: CODE_HASH,
        companyId,
        expiresAt,
        id: secondId,
        phone: PHONE,
        userId,
      })

      const live = await repository.findLiveRequestByCompanyAndPhone({ companyId, phone: PHONE })
      expect(live.map((request) => request.id)).toEqual([secondId])
      expect(
        await repository.findLiveRequestByCompanyAndPhone({
          companyId: otherCompanyId,
          phone: PHONE,
        }),
      ).toEqual([])

      await repository.incrementAttempt({ companyId: otherCompanyId, requestId: secondId })
      await repository.incrementAttempt({ companyId, requestId: secondId })
      const [afterAttempt] = await repository.findLiveRequestByCompanyAndPhone({
        companyId,
        phone: PHONE,
      })
      expect(afterAttempt?.attemptCount).toBe(1)

      await repository.consumeRequest({ companyId, consumedAt: new Date(), requestId: secondId })
      expect(
        await repository.findLiveRequestByCompanyAndPhone({ companyId, phone: PHONE }),
      ).toEqual([])
    })
  })
})

async function seedCompany(db: TestDatabase['db']): Promise<string> {
  const companyId = crypto.randomUUID()
  await db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedUser(db: TestDatabase['db']): Promise<string> {
  const userId = crypto.randomUUID()
  await db.insert(identityUsers).values({ id: userId })
  return userId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_wapphone_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
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
}
