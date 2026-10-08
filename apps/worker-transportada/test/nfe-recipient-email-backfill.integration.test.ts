/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { eq, sql } from 'drizzle-orm'

import { nfeDocuments, storedObjects } from '../src/database/nfe.schema.js'
import { createNfeRecipientEmailBackfillRoutine } from '../src/nfe-recipient-email-backfill/application/nfe-recipient-email-backfill.routine.js'
import { NFE_RECIPIENT_EMAIL_BACKFILL_JOB } from '../src/nfe-recipient-email-backfill/domain/nfe-recipient-email-backfill.constant.js'
import { DrizzleNfeRecipientEmailBackfillRepository } from '../src/nfe-recipient-email-backfill/infrastructure/drizzle-nfe-recipient-email-backfill.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const VALID_EMAIL = 'compras@cliente.example'
const KEPT_EMAIL = 'ja-gravado@cliente.example'
const INVALID_EMAIL = 'nao-e-um-email'
const SHA256 = 'c'.repeat(64)

type Seed = { readonly emailInXml: string | undefined; readonly stored: string | null }

const SEEDS = {
  alreadyFilled: { emailInXml: VALID_EMAIL, stored: KEPT_EMAIL },
  broken: { emailInXml: undefined, stored: null },
  invalid: { emailInXml: INVALID_EMAIL, stored: null },
  missing: { emailInXml: undefined, stored: null },
  pending: { emailInXml: ` ${VALID_EMAIL} `, stored: null },
} as const satisfies Record<string, Seed>
type SeedName = keyof typeof SEEDS

describeDatabase('o backfill do e-mail do destinatário (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const documentIds = {} as Record<SeedName, string>
  const logs: unknown[] = []

  const routine = createNfeRecipientEmailBackfillRoutine({
    importer: {
      async importXml({ xml }) {
        const email = SEEDS[xml as SeedName]?.emailInXml
        return {
          document: { recipient: { name: 'Destinatario', taxId: '1', email } },
          kind: 'authorized-nfe',
        } as unknown as ImportedNfeXml
      },
    },
    logger: {
      error: (message: string, metadata: unknown) => logs.push({ message, metadata }),
      info: (message: string, metadata: unknown) => logs.push({ message, metadata }),
      warn: (message: string, metadata: unknown) => logs.push({ message, metadata }),
    } as never,
    reader: {
      async readXml({ key }) {
        if (key.endsWith('/broken')) throw new Error('storage down')
        return key.slice(key.lastIndexOf('/') + 1)
      },
    },
    repository: new DrizzleNfeRecipientEmailBackfillRepository(db),
  })

  const context = {
    correlationId: 'correlation-1',
    executionId: 'execution-1',
    isStopRequested: () => false,
    job: NFE_RECIPIENT_EMAIL_BACKFILL_JOB,
    origin: 'manual',
  } as const

  async function readStored(name: SeedName): Promise<string | null | undefined> {
    const [document] = await db
      .select({ recipientEmail: nfeDocuments.recipientEmail })
      .from(nfeDocuments)
      .where(eq(nfeDocuments.id, documentIds[name]))
    return document?.recipientEmail
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
    await db.execute(sql`
      insert into nfe_imports (id, company_id, correlation_id, idempotency_key, request_fingerprint,
        requested_by_user_id, source, status, received_count)
      values (${importId}, ${companyId}, 'backfill-correlation', ${`idem-${importId}`},
        ${`fingerprint-${importId}`}, ${userId}, 'upload', 'completed', 5)`)

    for (const [index, name] of (Object.keys(SEEDS) as SeedName[]).entries()) {
      const objectId = crypto.randomUUID()
      documentIds[name] = crypto.randomUUID()
      await db.insert(storedObjects).values({
        bucket: 'transportada-private',
        companyId,
        id: objectId,
        mimeType: 'application/xml',
        objectKey: `tenants/${companyId}/${name}`,
        provider: 'minio',
        purpose: 'nfe_document',
        sha256: SHA256,
        sizeBytes: 128n,
        status: 'final',
      })
      await db.insert(nfeDocuments).values({
        authorizationProtocol: '135260000000001',
        accessKey: `${'3519'.padEnd(41, '0')}${String(index).padStart(3, '0')}`,
        companyId,
        createdByUserId: userId,
        id: documentIds[name],
        importId,
        issuedAt: new Date('2026-07-22T22:00:00.000Z'),
        model: '55',
        number: String(index),
        operationNature: 'Venda',
        operationType: '0',
        productsValue: '10.0000',
        recipientEmail: SEEDS[name].stored,
        series: '1',
        source: 'upload',
        status: 'authorized',
        totalValue: '10.0000',
        xmlObjectId: objectId,
        xmlSha256: SHA256,
      })
    }
  })

  afterAll(async () => {
    await db.delete(nfeDocuments).where(eq(nfeDocuments.companyId, companyId))
    await db.delete(storedObjects).where(eq(storedObjects.companyId, companyId))
    await db.execute(sql`delete from nfe_imports where company_id = ${companyId}`)
    await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  it('preenche a nota sem e-mail e isola a que falhou na leitura', async () => {
    const result = await routine.run(context)

    expect(await readStored('pending')).toBe(VALID_EMAIL)
    expect(result.outcome).toBe('succeeded')
    expect(result.counters.filled).toBeGreaterThanOrEqual(1)
    expect(result.counters.failed).toBeGreaterThanOrEqual(1)
  })

  it('nunca troca o e-mail já gravado', async () => {
    expect(await readStored('alreadyFilled')).toBe(KEPT_EMAIL)
  })

  it('deixa nulo o que o XML não traz ou traz inválido', async () => {
    expect(await readStored('invalid')).toBeNull()
    expect(await readStored('missing')).toBeNull()
    expect(await readStored('broken')).toBeNull()
  })

  it('é idempotente: a segunda passada não preenche nada', async () => {
    const result = await routine.run(context)

    expect(result.counters.filled).toBe(0)
    expect(await readStored('pending')).toBe(VALID_EMAIL)
    expect(await readStored('alreadyFilled')).toBe(KEPT_EMAIL)
  })

  it('não registra endereço no log', () => {
    const serialized = JSON.stringify(logs)
    expect(serialized).toContain('nfe_recipient_email_backfill_cycle_finished')
    expect(serialized).not.toContain(VALID_EMAIL)
    expect(serialized).not.toContain(KEPT_EMAIL)
    expect(serialized).not.toContain(INVALID_EMAIL)
  })
})
