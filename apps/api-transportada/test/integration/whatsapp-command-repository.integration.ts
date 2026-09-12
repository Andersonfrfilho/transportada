/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quem decide o vencedor de duas confirmações é o `UPDATE … WHERE status = 'previewed'`, e só um
 * banco de verdade serializa duas transações na mesma linha: repositório falso deixaria as duas
 * vencerem sem reclamar.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  identityUsers,
  userCompanyMemberships,
  whatsAppCommandDocuments,
} from '../../src/database/database.schema.js'
import { DrizzleWhatsAppCommandRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-command.repository.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const HASH = 'c'.repeat(64)
const OTHER_HASH = 'd'.repeat(64)
const MINUTE_MS = 60_000

const STEPS = [
  {
    documentKind: 'cte_batch' as const,
    groupKey: '00000000-0000-4000-8000-000000000001',
    idempotencyKey: 'whatsapp:request:cte:profile-1',
  },
  {
    documentKind: 'nfse_invoice' as const,
    groupKey: '00000000-0000-4000-8000-000000000002:12345678000190',
    idempotencyKey: 'whatsapp:request:nfse:profile-2',
  },
]

describe('pedido de comando do WhatsApp — confirmar é confirmar a prévia mostrada', () => {
  testWithPostgres('duas confirmações simultâneas: exatamente uma vence', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const { companyId, repository, requestId } = await seedPreview(db)
      const now = new Date()

      const outcomes = await Promise.all(
        Array.from({ length: 8 }, () =>
          repository.claimForConfirmation({
            companyId,
            id: requestId,
            now,
            previewSha256: HASH,
            steps: STEPS,
          }),
        ),
      )

      expect(outcomes.filter((outcome) => outcome !== undefined)).toHaveLength(1)
      const journal = await repository.listJournal({ companyId, requestId })
      expect(journal.map((step) => [step.documentKind, step.status])).toEqual([
        ['cte_batch', 'pending'],
        ['nfse_invoice', 'pending'],
      ])
      expect((await repository.findById({ companyId, id: requestId }))?.status).toBe('confirming')
    })
  })

  testWithPostgres('hash divergente não reivindica e não grava diário', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const { companyId, repository, requestId } = await seedPreview(db)

      const claimed = await repository.claimForConfirmation({
        companyId,
        id: requestId,
        now: new Date(),
        previewSha256: OTHER_HASH,
        steps: STEPS,
      })

      expect(claimed).toBeUndefined()
      expect((await repository.findById({ companyId, id: requestId }))?.status).toBe('previewed')
      expect(await repository.listJournal({ companyId, requestId })).toEqual([])
    })
  })

  testWithPostgres('pedido vencido não reivindica, e vira expired', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const { companyId, expiresAt, repository, requestId } = await seedPreview(db)

      const claimed = await repository.claimForConfirmation({
        companyId,
        id: requestId,
        now: expiresAt,
        previewSha256: HASH,
        steps: STEPS,
      })

      expect(claimed).toBeUndefined()
      expect(await repository.markExpired({ companyId, id: requestId, now: expiresAt })).toBe(true)
      expect((await repository.findById({ companyId, id: requestId }))?.status).toBe('expired')
    })
  })

  testWithPostgres('outra empresa não lê nem reivindica o pedido', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const { repository, requestId } = await seedPreview(db)
      const otherCompanyId = await seedCompany(db)

      expect(
        await repository.findById({ companyId: otherCompanyId, id: requestId }),
      ).toBeUndefined()
      expect(
        await repository.claimForConfirmation({
          companyId: otherCompanyId,
          id: requestId,
          now: new Date(),
          previewSha256: HASH,
          steps: STEPS,
        }),
      ).toBeUndefined()
    })
  })

  testWithPostgres(
    'o diário recusa passo emitido sem documento, e a liquidação só fecha dispatched',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const { companyId, repository, requestId } = await seedPreview(db)
        const now = new Date()
        await repository.claimForConfirmation({
          companyId,
          id: requestId,
          now,
          previewSha256: HASH,
          steps: STEPS,
        })
        const [first] = await repository.listJournal({ companyId, requestId })
        if (first === undefined) throw new Error('journal step expected')

        await expect(
          (async () => {
            await db
              .update(whatsAppCommandDocuments)
              .set({ status: 'issued' })
              .where(eq(whatsAppCommandDocuments.id, first.id))
          })(),
        ).rejects.toThrow()

        const documentId = crypto.randomUUID()
        expect(
          await repository.markJournalStep({
            companyId,
            documentId,
            id: first.id,
            status: 'issued',
          }),
        ).toBe(true)
        expect((await repository.listJournal({ companyId, requestId }))[0]?.documentId).toBe(
          documentId,
        )

        expect(
          await repository.markSettled({ companyId, id: requestId, now, outcome: 'settled' }),
        ).toBe(false)
        const stuck = await repository.listForSettlement({
          companyId,
          stuckConfirmingBefore: new Date(now.getTime() + MINUTE_MS),
        })
        expect(stuck.map((request) => request.id)).toEqual([requestId])

        expect(await repository.markDispatched({ companyId, id: requestId })).toBe(true)
        expect(
          await repository.markSettled({
            companyId,
            id: requestId,
            now,
            outcome: 'settled_partial',
          }),
        ).toBe(true)
        expect(
          await repository.markSettled({ companyId, id: requestId, now, outcome: 'settled' }),
        ).toBe(false)
        const settled = await repository.findById({ companyId, id: requestId })
        expect([settled?.status, settled?.settlementOutcome]).toEqual([
          'settled_partial',
          'settled_partial',
        ])
      })
    },
  )

  testWithPostgres('sem membership não há pedido, e a membership gravada é a do ator', async () => {
    await withDisposableDatabase(async ({ db }) => {
      const companyId = await seedCompany(db)
      const outsider = await seedUser(db)
      const repository = new DrizzleWhatsAppCommandRepository(db)

      expect(
        await repository.createPreview(previewInput({ actorUserId: outsider, companyId })),
      ).toBe(undefined)

      const { membershipId, request } = await seedPreview(db)
      expect(request.membershipId).toBe(membershipId)
    })
  })
})

function previewInput(input: { readonly actorUserId: string; readonly companyId: string }) {
  return {
    ...input,
    classification: [
      { classification: { output: 'cte' as const }, documentId: crypto.randomUUID() },
    ],
    dueDate: '2026-09-27',
    expiresAt: new Date(Date.now() + 15 * MINUTE_MS),
    groupingMode: 'per_invoice' as const,
    id: crypto.randomUUID(),
    kind: 'document_issuance' as const,
    period: 'Setembro/2026',
    previewSha256: HASH,
    selection: [crypto.randomUUID()],
  }
}

async function seedPreview(db: TestDatabase['db']) {
  const companyId = await seedCompany(db)
  const actorUserId = await seedUser(db)
  const [membership] = await db
    .insert(userCompanyMemberships)
    .values({ companyId, userId: actorUserId })
    .returning({ id: userCompanyMemberships.id })
  const repository = new DrizzleWhatsAppCommandRepository(db)
  const input = previewInput({ actorUserId, companyId })
  const request = await repository.createPreview(input)
  if (request === undefined || membership === undefined) throw new Error('preview expected')

  return {
    companyId,
    expiresAt: input.expiresAt,
    membershipId: membership.id,
    repository,
    request,
    requestId: request.id,
  }
}

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
  const databaseName = `transportada_wacommand_${crypto.randomUUID().replaceAll('-', '')}`
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
