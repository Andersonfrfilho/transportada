/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161 T19 (CA15): a rotina de expurgo contra infraestrutura de verdade — Postgres e MinIO,
 * não os dublês de porta que T17/T18 já provam. É o único lugar que responde "os bytes saem do
 * bucket de verdade": os contratos substituem `deleteObject`/o storage por porta falsa, o que prova
 * a lógica de ordenação e transação (ajustes 2–6), não a integração real com um provedor
 * S3-compatível. A foto vencida some do bucket (original e miniatura) e da tabela; a foto dentro do
 * prazo permanece intocada nos dois.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createTripOccurrenceAttachmentPurgeRoutine } from '../../src/trip-occurrence-attachment-purge/application/trip-occurrence-attachment-purge.routine.js'
import { createDrizzlePurgeOccurrenceAttachmentBatch } from '../../src/trip-occurrence-attachment-purge/infrastructure/drizzle-trip-occurrence-attachment-purge.repository.js'
import { createNfeStorageGatewayFromEnvironment } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

const databaseUrl = process.env.DATABASE_URL
const bucket = process.env.STORAGE_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET
const canRun = databaseUrl !== undefined && bucket !== undefined
const describeIntegration = canRun ? describe : describe.skip

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const CONTEXT: JobRoutineContext = {
  correlationId: 'occurrence-attachment-purge-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.occurrence-attachment.purge',
  origin: 'schedule',
}

/** O corte é relativo a este instante injetado — nada aqui depende da data em que a suíte roda. */
const NOW = new Date('2026-09-22T09:00:00.000Z')
const EXPIRED_RETENTION = new Date('2026-09-01T00:00:00.000Z')
const FRESH_RETENTION = new Date('2031-09-22T00:00:00.000Z')

describeIntegration(
  'expurgo do anexo de ocorrência de galpão contra Postgres e MinIO (spec 161 T19)',
  () => {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const membershipId = crypto.randomUUID()
    const vehicleId = crypto.randomUUID()
    const tripId = crypto.randomUUID()
    const tripDocumentId = crypto.randomUUID()
    const occurrenceTypeId = crypto.randomUUID()
    const nfeImportId = crypto.randomUUID()
    const nfeDocumentId = crypto.randomUUID()
    const nfeXmlObjectId = crypto.randomUUID()

    const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
    const db = provider.db
    const storage = createNfeStorageGatewayFromEnvironment({
      environment: process.env,
      finalBucket: bucket as string,
      stagingBucket: bucket as string,
    })

    async function insertObject(input: {
      readonly key: string
      readonly purpose: string
      readonly retentionUntil: Date
    }): Promise<{ readonly id: string; readonly bytes: Uint8Array }> {
      const id = crypto.randomUUID()
      const bytes = new TextEncoder().encode(`occurrence-attachment-purge:${id}`)
      await storage.storeObject({
        body: bytes,
        bucket: bucket as string,
        contentLength: bytes.byteLength,
        contentType: 'image/jpeg',
        key: input.key,
        sha256: Bun.SHA256.hash(bytes, 'hex'),
      })
      await db.execute(sql`
      insert into stored_objects
        (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes,
         status, retention_until)
      values (
        ${id}, ${companyId}, ${bucket}, ${input.key}, 's3', ${input.purpose}, 'image/jpeg',
        ${Bun.SHA256.hash(bytes, 'hex')}, ${bytes.byteLength}, 'final', ${input.retentionUntil}
      )
    `)
      return { bytes, id }
    }

    async function insertAttachment(input: {
      readonly position: number
      readonly storedObjectId: string
      readonly thumbnailObjectId: string | null
    }): Promise<string> {
      const id = crypto.randomUUID()
      await db.execute(sql`
      insert into trip_document_occurrence_attachments
        (id, company_id, occurrence_id, stored_object_id, thumbnail_object_id, position)
      values (
        ${id}, ${companyId}, ${expiredOccurrenceId}, ${input.storedObjectId},
        ${input.thumbnailObjectId}, ${input.position}
      )
    `)
      return id
    }

    let expiredOccurrenceId: string
    let expiredOriginalObjectId: string
    let expiredThumbnailObjectId: string
    let freshOriginalObjectId: string
    let freshThumbnailObjectId: string
    let expiredAttachmentId: string
    let freshAttachmentId: string

    beforeAll(async () => {
      await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
      await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
      await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
      await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E48', 'traction', 'tractor_unit', 'SP')
    `)
      await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'completed')
    `)
      // `trip_documents_entity_xor_check` exige uma nota real ou um cálculo de frete — a cópia
      // mínima de uma nota fiscal, só para satisfazer a cadeia de FKs até a ocorrência.
      await db.execute(sql`
      insert into stored_objects
        (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
      values (
        ${nfeXmlObjectId}, ${companyId}, ${bucket}, ${`tenants/${companyId}/nfe-xml/${nfeXmlObjectId}`},
        's3', 'nfe_document', 'application/xml', ${'0'.repeat(64)}, 10, 'final'
      )
    `)
      await db.execute(sql`
      insert into nfe_imports
        (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key,
         request_fingerprint, status)
      values (
        ${nfeImportId}, ${companyId}, 'upload', ${userId}, 'purge-integration', 'purge-integration',
        'purge-integration', 'completed'
      )
    `)
      await db.execute(sql`
      insert into nfe_documents
        (id, company_id, access_key, model, number, series, issued_at, operation_nature,
         operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256,
         import_id, created_by_user_id, authorization_protocol)
      values (
        ${nfeDocumentId}, ${companyId}, ${'0'.repeat(44)}, '55', '1', '1', ${NOW.toISOString()},
        'venda', '1', 'authorized', 'upload', '10.00', '10.00', ${nfeXmlObjectId},
        ${'0'.repeat(64)}, ${nfeImportId}, ${userId}, 'purge-integration'
      )
    `)
      await db.execute(sql`
      insert into trip_documents (id, company_id, trip_id, nfe_document_id)
      values (${tripDocumentId}, ${companyId}, ${tripId}, ${nfeDocumentId})
    `)
      await db.execute(sql`
      insert into company_occurrence_types (id, company_id, name, stage, notifies, active)
      values (${occurrenceTypeId}, ${companyId}, 'Caixa violada', 'separation', false, true)
    `)

      const expiredOccurrence = await db.execute(sql`
      insert into trip_document_occurrences
        (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id)
      values
        (${crypto.randomUUID()}, ${companyId}, ${tripDocumentId}, 'separation', ${occurrenceTypeId},
         ${userId})
      returning id
    `)
      expiredOccurrenceId = String(expiredOccurrence[0]?.id)

      const expiredOriginal = await insertObject({
        key: `tenants/${companyId}/trip-occurrence-attachments/${crypto.randomUUID()}`,
        purpose: 'trip_occurrence_attachment',
        retentionUntil: EXPIRED_RETENTION,
      })
      expiredOriginalObjectId = expiredOriginal.id

      const expiredThumbnail = await insertObject({
        key: `tenants/${companyId}/trip-occurrence-attachments/${crypto.randomUUID()}-thumbnail`,
        purpose: 'trip_occurrence_thumbnail',
        retentionUntil: EXPIRED_RETENTION,
      })
      expiredThumbnailObjectId = expiredThumbnail.id

      expiredAttachmentId = await insertAttachment({
        position: 1,
        storedObjectId: expiredOriginalObjectId,
        thumbnailObjectId: expiredThumbnailObjectId,
      })

      const freshOriginal = await insertObject({
        key: `tenants/${companyId}/trip-occurrence-attachments/${crypto.randomUUID()}`,
        purpose: 'trip_occurrence_attachment',
        retentionUntil: FRESH_RETENTION,
      })
      freshOriginalObjectId = freshOriginal.id

      const freshThumbnail = await insertObject({
        key: `tenants/${companyId}/trip-occurrence-attachments/${crypto.randomUUID()}-thumbnail`,
        purpose: 'trip_occurrence_thumbnail',
        retentionUntil: FRESH_RETENTION,
      })
      freshThumbnailObjectId = freshThumbnail.id

      freshAttachmentId = await insertAttachment({
        position: 2,
        storedObjectId: freshOriginalObjectId,
        thumbnailObjectId: freshThumbnailObjectId,
      })
    })

    afterAll(async () => {
      await db
        .execute(
          sql`delete from trip_document_occurrence_attachments where company_id = ${companyId}`,
        )
        .catch(() => undefined)
      await db
        .execute(sql`delete from trip_document_occurrences where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from company_occurrence_types where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from trip_documents where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from nfe_documents where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from nfe_imports where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from stored_objects where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from trips where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
        .catch(() => undefined)
      await db
        .execute(sql`delete from user_company_memberships where id = ${membershipId}`)
        .catch(() => undefined)
      await db.execute(sql`delete from identity_users where id = ${userId}`).catch(() => undefined)
      await db.execute(sql`delete from companies where id = ${companyId}`).catch(() => undefined)
      await storage.close()
      await provider.close()
    })

    test('a foto vencida some do bucket e da tabela; a foto dentro do prazo fica intocada', async () => {
      const routine = createTripOccurrenceAttachmentPurgeRoutine({
        logger: SILENT_LOGGER as never,
        now: () => NOW,
        purge: createDrizzlePurgeOccurrenceAttachmentBatch({
          database: db,
          deleteObject: (location) => storage.deleteObject(location),
        }),
      })

      const result = await routine.run(CONTEXT)

      expect(result.outcome).toBe('succeeded')
      // Dois candidatos entram no lote (original + miniatura, ambos com `retention_until` vencido):
      // o primeiro resolve a unidade inteira via `findAttachmentByObjectId` e apaga os dois objetos
      // juntos (ajuste 4); o segundo já encontra o objeto `deleted` (ajuste 5/6) e conta como `missing`
      // — não é falha, é o ciclo convergindo sobre o que a primeira unidade já resolveu.
      expect(result.counters).toMatchObject({ deleted: 1, failed: 0, missing: 1 })

      // A linha do anexo vencido some inteira — original e miniatura saem juntos (ajuste 4).
      const remainingAttachments = await db.execute(sql`
      select "id" from trip_document_occurrence_attachments where company_id = ${companyId}
    `)
      const remainingIds = remainingAttachments.map((row) => String(row.id))
      expect(remainingIds).not.toContain(expiredAttachmentId)
      expect(remainingIds).toContain(freshAttachmentId)

      // Os dois objetos do anexo vencido saem marcados `deleted` no banco…
      const objectStatuses = await db.execute(sql`
      select "id", "status" from stored_objects where company_id = ${companyId}
    `)
      const statusById = new Map(objectStatuses.map((row) => [String(row.id), String(row.status)]))
      expect(statusById.get(expiredOriginalObjectId)).toBe('deleted')
      expect(statusById.get(expiredThumbnailObjectId)).toBe('deleted')
      expect(statusById.get(freshOriginalObjectId)).toBe('final')
      expect(statusById.get(freshThumbnailObjectId)).toBe('final')

      // …e os bytes saem de verdade do MinIO: é isto que nenhum contrato prova sozinho.
      const [expiredOriginalKey] = await db.execute(sql`
      select "object_key" from stored_objects where id = ${expiredOriginalObjectId}
    `)
      const [expiredThumbnailKey] = await db.execute(sql`
      select "object_key" from stored_objects where id = ${expiredThumbnailObjectId}
    `)
      const [freshOriginalKey] = await db.execute(sql`
      select "object_key" from stored_objects where id = ${freshOriginalObjectId}
    `)
      expect(
        await storage.headObject({
          bucket: bucket as string,
          key: String(expiredOriginalKey?.object_key),
        }),
      ).toBeUndefined()
      expect(
        await storage.headObject({
          bucket: bucket as string,
          key: String(expiredThumbnailKey?.object_key),
        }),
      ).toBeUndefined()
      expect(
        await storage.headObject({
          bucket: bucket as string,
          key: String(freshOriginalKey?.object_key),
        }),
      ).toBeDefined()
    })

    /** Correr de novo não tem mais nada vencido para apagar — a batida diária se comporta assim todo dia. */
    test('o segundo ciclo não encontra mais nada para apagar', async () => {
      const routine = createTripOccurrenceAttachmentPurgeRoutine({
        logger: SILENT_LOGGER as never,
        now: () => NOW,
        purge: createDrizzlePurgeOccurrenceAttachmentBatch({
          database: db,
          deleteObject: (location) => storage.deleteObject(location),
        }),
      })

      expect((await routine.run(CONTEXT)).counters).toEqual({
        batches: 0,
        deleted: 0,
        failed: 0,
        missing: 0,
      })
    })
  },
)
