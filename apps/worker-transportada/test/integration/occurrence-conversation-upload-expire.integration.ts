/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702c2, contra Postgres e o armazenamento S3 de verdade: o pedido de upload do anexo da
 * conversa que venceu sem virar anexo tem o objeto apagado do bucket e passa a `expired`; o que
 * nunca chegou a subir também fecha, sem erro; o recente e o já ligado (`attached`) ficam intocados.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createOccurrenceConversationUploadExpireRoutine } from '../../src/occurrence-conversation-upload-expire/application/occurrence-conversation-upload-expire.routine.js'
import { createDrizzleExpireConversationUploadBatch } from '../../src/occurrence-conversation-upload-expire/infrastructure/drizzle-occurrence-conversation-upload-expire.repository.js'
import { createNfeStorageGatewayFromEnvironment } from '../../src/storage/infrastructure/nfe-storage-gateway.js'

const databaseUrl = process.env.DATABASE_URL
const bucket = process.env.STORAGE_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET
const describeIntegration =
  databaseUrl !== undefined && bucket !== undefined ? describe : describe.skip

const SILENT = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}
const CONTEXT: JobRoutineContext = {
  correlationId: 'conversation-upload-expire-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'occurrence-conversation.upload.expire',
  origin: 'schedule',
}
/** 900s de vida + 900s de folga: 31 minutos antes está fora; 10 minutos antes, ainda não. */
const NOW = new Date('2026-09-25T15:00:00.000Z')
const EXPIRED_AT = new Date(NOW.getTime() - 31 * 60 * 1000)
const FRESH_AT = new Date(NOW.getTime() - 10 * 60 * 1000)

describeIntegration('expiração do pedido de upload do anexo da conversa (spec 183 T702c2)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const occurrenceId = crypto.randomUUID()
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const storage = createNfeStorageGatewayFromEnvironment({
    environment: process.env,
    finalBucket: bucket as string,
    stagingBucket: bucket as string,
  })
  const ids = { attached: '', fresh: '', neverUploaded: '', uploaded: '' }
  const keys = { attached: '', fresh: '', neverUploaded: '', uploaded: '' }

  async function insertUpload(
    name: keyof typeof ids,
    expiresAt: Date,
    status: 'attached' | 'pending',
  ) {
    ids[name] = crypto.randomUUID()
    keys[name] = `occurrence-conversations/${crypto.randomUUID().replaceAll('-', '')}`
    await db.execute(sql`
      insert into occurrence_conversation_uploads
        (id, company_id, occurrence_kind, occurrence_id, participant, channel, requested_by_user_id,
         bucket, object_key, declared_content_type, declared_size_bytes, file_name, status,
         expires_at, attached_at)
      values (${ids[name]}, ${companyId}, 'document', ${occurrenceId}, 'driver', 'app', ${userId},
        ${bucket}, ${keys[name]}, 'application/pdf', 10, 'a.pdf', ${status},
        ${expiresAt.toISOString()}, ${status === 'attached' ? expiresAt.toISOString() : null})
    `)
  }

  async function putObject(key: string) {
    const bytes = new TextEncoder().encode(`%PDF-${key}`)
    await storage.storeObject({
      body: bytes,
      bucket: bucket as string,
      contentLength: bytes.byteLength,
      contentType: 'application/pdf',
      key,
      sha256: Bun.SHA256.hash(bytes, 'hex'),
    })
  }

  async function statusOf(id: string): Promise<unknown> {
    const rows = await db.execute(
      sql`select status from occurrence_conversation_uploads where id = ${id}`,
    )
    return [...rows][0]
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await insertUpload('uploaded', EXPIRED_AT, 'pending')
    await putObject(keys.uploaded)
    await insertUpload('neverUploaded', EXPIRED_AT, 'pending')
    await insertUpload('fresh', FRESH_AT, 'pending')
    await putObject(keys.fresh)
    await insertUpload('attached', EXPIRED_AT, 'attached')
    await putObject(keys.attached)
  })

  afterAll(async () => {
    await provider.close()
    await storage.close()
  })

  test('vencido sai do bucket e vira expired; recente e ligado ficam', async () => {
    const routine = createOccurrenceConversationUploadExpireRoutine({
      expire: createDrizzleExpireConversationUploadBatch({
        database: db,
        deleteObject: (object) => storage.deleteObject(object),
      }),
      logger: SILENT as never,
      now: () => NOW,
    })

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(await statusOf(ids.uploaded)).toEqual({ status: 'expired' })
    expect(await statusOf(ids.neverUploaded)).toEqual({ status: 'expired' })
    expect(await statusOf(ids.fresh)).toEqual({ status: 'pending' })
    expect(await statusOf(ids.attached)).toEqual({ status: 'attached' })
    expect(
      await storage.headObject({ bucket: bucket as string, key: keys.uploaded }),
    ).toBeUndefined()
    expect(await storage.headObject({ bucket: bucket as string, key: keys.fresh })).toBeDefined()
    expect(await storage.headObject({ bucket: bucket as string, key: keys.attached })).toBeDefined()

    /** Rodar de novo não muda nada: o vencido já está `expired`. */
    await routine.run(CONTEXT)
    expect(await statusOf(ids.fresh)).toEqual({ status: 'pending' })
  })
})
