/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A metade de escrita do caminho da spec 070, contra Postgres e o bucket de verdade: o upload grava
 * objeto, rascunho e **pedido de leitura** numa transação só, e nada é lido na requisição (ADR-0053).
 *
 * Com repositório falso isso não se prova — lá a transação é uma função que sempre volta, e o
 * `payload jsonb` é um objeto que ninguém serializa. A outra metade (relay → consumidor → campos
 * gravados) vive no `worker-transportada`, porque nenhuma app importa código-fonte de outra; o seam
 * entre as duas é a linha do outbox, e é ela que os dois lados afirmam.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  aggregateApplicationAttachments,
  aggregateAttachmentOutbox,
  companies,
  storedObjects,
} from '../../src/database/database.schema.js'
import { createAggregateApplicationAttachmentUseCase } from '../../src/fleet/application/aggregate-application-attachment.use-case.js'
import { createDrizzleAggregateApplicationAttachmentRepository } from '../../src/fleet/infrastructure/drizzle-aggregate-application-attachment.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000
const BUCKET = 'test-bucket'
const CORRELATION_ID = 'correlation-070-integration'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type StoredCall = Readonly<{ bucket: string; contentType: string; key: string }>

function buildStorage(stored: StoredCall[]) {
  return {
    createSignedDownload: async (): Promise<URL> => new URL('https://example.test/object'),
    storeObject: async ({
      bucket,
      contentType,
      key,
    }: {
      readonly bucket: string
      readonly contentType: string
      readonly key: string
    }): Promise<void> => {
      stored.push({ bucket, contentType, key })
    },
  }
}

describe('upload de anexo, contra Postgres', () => {
  testWithPostgres(
    'grava objeto, rascunho e pedido de leitura na mesma transação',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = crypto.randomUUID()
        await db.insert(companies).values({ id: companyId, status: 'active' })

        const stored: StoredCall[] = []
        const useCase = createAggregateApplicationAttachmentUseCase({
          bucket: BUCKET,
          repository: createDrizzleAggregateApplicationAttachmentRepository(db),
          storage: buildStorage(stored),
        })

        const draft = await useCase.uploadDraft({
          bytes: PDF_BYTES,
          companyId,
          correlationId: CORRELATION_ID,
          type: 'ccmei',
        })

        const [attachment] = await db
          .select({
            extractedFields: aggregateApplicationAttachments.extractedFields,
            id: aggregateApplicationAttachments.id,
            storedObjectId: aggregateApplicationAttachments.storedObjectId,
          })
          .from(aggregateApplicationAttachments)
          .where(eq(aggregateApplicationAttachments.draftId, draft.draftId))
        expect(attachment).toBeDefined()

        /** Ninguém leu nada na requisição: o campo nasce nulo e quem o preenche é o worker. */
        expect(attachment?.extractedFields).toBeNull()

        const [object] = await db
          .select({ objectKey: storedObjects.objectKey })
          .from(storedObjects)
          .where(eq(storedObjects.id, attachment?.storedObjectId ?? ''))
        expect(object?.objectKey).toBe(stored[0]?.key)

        const [event] = await db
          .select({
            attachmentId: aggregateAttachmentOutbox.attachmentId,
            correlationId: aggregateAttachmentOutbox.correlationId,
            eventType: aggregateAttachmentOutbox.eventType,
            payload: aggregateAttachmentOutbox.payload,
            publishedAt: aggregateAttachmentOutbox.publishedAt,
          })
          .from(aggregateAttachmentOutbox)
          .where(eq(aggregateAttachmentOutbox.companyId, companyId))

        expect(event?.attachmentId).toBe(attachment?.id ?? '')
        expect(event?.correlationId).toBe(CORRELATION_ID)
        expect(event?.eventType).toBe('attachment.extraction.requested')
        expect(event?.publishedAt).toBeNull()

        /** Referência, nunca bytes (`security.md` §6): o worker busca o objeto no bucket. */
        expect(event?.payload).toEqual({
          attachmentId: attachment?.id ?? '',
          bucket: BUCKET,
          objectKey: stored[0]?.key ?? '',
          type: 'ccmei',
        })
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  /**
   * Bucket fora do ar não pode deixar pedido de leitura para um arquivo que não existe — o worker o
   * consumiria para sempre procurando um objeto que nunca foi gravado.
   */
  testWithPostgres(
    'falha ao armazenar não deixa rascunho nem pedido de leitura',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const companyId = crypto.randomUUID()
        await db.insert(companies).values({ id: companyId, status: 'active' })

        const useCase = createAggregateApplicationAttachmentUseCase({
          bucket: BUCKET,
          repository: createDrizzleAggregateApplicationAttachmentRepository(db),
          storage: {
            createSignedDownload: async (): Promise<URL> => new URL('https://example.test/object'),
            storeObject: async (): Promise<void> => {
              throw new Error('bucket fora do ar')
            },
          },
        })

        await expect(
          useCase.uploadDraft({
            bytes: PDF_BYTES,
            companyId,
            correlationId: CORRELATION_ID,
            type: 'ccmei',
          }),
        ).rejects.toThrow()

        expect(await db.select().from(aggregateApplicationAttachments)).toEqual([])
        expect(await db.select().from(aggregateAttachmentOutbox)).toEqual([])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_attachoutbox_${crypto.randomUUID().replaceAll('-', '')}`
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
