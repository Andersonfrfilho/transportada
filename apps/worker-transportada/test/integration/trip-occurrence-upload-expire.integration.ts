/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Achado [3] da revisão de código de 23/09 (spec 179), contra infraestrutura de verdade — Postgres e
 * MinIO, não os dublês de porta que `expire-unit.contract.ts`/`expire-cycle.contract.ts` já provam.
 * É o único lugar que responde "o objeto sai do bucket de verdade" e "o pendente recente não é
 * tocado": o pendente vencido (com e sem objeto de fato subido — o motorista pode nunca ter chegado a
 * enviar) vira `expired`; o pendente dentro da janela (900s + folga) permanece intocado.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createTripOccurrenceUploadExpireRoutine } from '../../src/trip-occurrence-upload-expire/application/trip-occurrence-upload-expire.routine.js'
import { createDrizzleExpireOccurrenceUploadBatch } from '../../src/trip-occurrence-upload-expire/infrastructure/drizzle-trip-occurrence-upload-expire.repository.js'
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
  correlationId: 'occurrence-upload-expire-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.occurrence-upload.expire',
  origin: 'schedule',
}

/**
 * O corte é relativo a este instante injetado, deslocado pela folga de 900s dentro da rotina — a
 * URL emitida com `expiresAt` até 15 minutos antes de `NOW` já está fora da janela (900s de vida +
 * 900s de folga = 1800s); a de 10 minutos antes ainda não.
 */
const NOW = new Date('2026-09-24T09:00:00.000Z')
const EXPIRED_EXPIRES_AT = new Date(NOW.getTime() - 31 * 60 * 1000)
const FRESH_EXPIRES_AT = new Date(NOW.getTime() - 10 * 60 * 1000)

describeIntegration(
  'expiração do pedido de upload de ocorrência contra Postgres e MinIO (achado [3], spec 179)',
  () => {
    const companyId = crypto.randomUUID()
    const vehicleId = crypto.randomUUID()
    const tripId = crypto.randomUUID()
    const driverId = crypto.randomUUID()

    const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
    const db = provider.db
    const storage = createNfeStorageGatewayFromEnvironment({
      environment: process.env,
      finalBucket: bucket as string,
      stagingBucket: bucket as string,
    })

    let expiredUploadedId: string
    let expiredUploadedKey: string
    let expiredNeverUploadedId: string
    let expiredNeverUploadedKey: string
    let freshUploadId: string
    let freshUploadKey: string

    async function insertPendingUpload(input: {
      readonly expiresAt: Date
      readonly key: string
    }): Promise<string> {
      const id = crypto.randomUUID()
      await db.execute(sql`
      insert into trip_occurrence_uploads
        (id, company_id, trip_id, driver_id, bucket, object_key, mime_type, declared_size_bytes,
         status, expires_at)
      values (
        ${id}, ${companyId}, ${tripId}, ${driverId}, ${bucket}, ${input.key}, 'image/jpeg', 1024,
        'pending', ${input.expiresAt.toISOString()}
      )
    `)
      return id
    }

    beforeAll(async () => {
      await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
      await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E48', 'traction', 'tractor_unit', 'SP')
    `)
      await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'in_transit')
    `)

      // Vencido, e o motorista de fato chegou a subir o arquivo antes de perder sinal.
      expiredUploadedKey = `tenants/${companyId}/trip-occurrence-uploads/${tripId}/${crypto.randomUUID()}`
      expiredUploadedId = await insertPendingUpload({
        expiresAt: EXPIRED_EXPIRES_AT,
        key: expiredUploadedKey,
      })
      const bytes = new TextEncoder().encode(`occurrence-upload-expire:${expiredUploadedId}`)
      await storage.storeObject({
        body: bytes,
        bucket: bucket as string,
        contentLength: bytes.byteLength,
        contentType: 'image/jpeg',
        key: expiredUploadedKey,
        sha256: Bun.SHA256.hash(bytes, 'hex'),
      })

      // Vencido, mas o motorista nunca chegou a subir nada — o objeto não existe no bucket.
      expiredNeverUploadedKey = `tenants/${companyId}/trip-occurrence-uploads/${tripId}/${crypto.randomUUID()}`
      expiredNeverUploadedId = await insertPendingUpload({
        expiresAt: EXPIRED_EXPIRES_AT,
        key: expiredNeverUploadedKey,
      })

      // Dentro da janela (900s + folga) — não deve ser tocado.
      freshUploadKey = `tenants/${companyId}/trip-occurrence-uploads/${tripId}/${crypto.randomUUID()}`
      freshUploadId = await insertPendingUpload({ expiresAt: FRESH_EXPIRES_AT, key: freshUploadKey })
      const freshBytes = new TextEncoder().encode(`occurrence-upload-expire:${freshUploadId}`)
      await storage.storeObject({
        body: freshBytes,
        bucket: bucket as string,
        contentLength: freshBytes.byteLength,
        contentType: 'image/jpeg',
        key: freshUploadKey,
        sha256: Bun.SHA256.hash(freshBytes, 'hex'),
      })
    })

    afterAll(async () => {
      await db
        .execute(sql`delete from trip_occurrence_uploads where company_id = ${companyId}`)
        .catch(() => undefined)
      await db.execute(sql`delete from trips where company_id = ${companyId}`).catch(() => undefined)
      await db
        .execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
        .catch(() => undefined)
      await db.execute(sql`delete from companies where id = ${companyId}`).catch(() => undefined)
      await storage.close()
      await provider.close()
    })

    test('o pendente vencido é expirado (com e sem objeto de fato subido); o recente fica intocado', async () => {
      const routine = createTripOccurrenceUploadExpireRoutine({
        expire: createDrizzleExpireOccurrenceUploadBatch({
          database: db,
          deleteObject: (location) => storage.deleteObject(location),
        }),
        logger: SILENT_LOGGER as never,
        now: () => NOW,
      })

      const result = await routine.run(CONTEXT)

      expect(result.outcome).toBe('succeeded')
      expect(result.counters).toMatchObject({ expired: 2, failed: 0 })

      const rows = await db.execute(sql`
      select "id", "status" from trip_occurrence_uploads where company_id = ${companyId}
    `)
      const statusById = new Map(rows.map((row) => [String(row.id), String(row.status)]))
      expect(statusById.get(expiredUploadedId)).toBe('expired')
      expect(statusById.get(expiredNeverUploadedId)).toBe('expired')
      expect(statusById.get(freshUploadId)).toBe('pending')

      // O objeto que o motorista tinha subido some do bucket de verdade — é isto que nenhum contrato
      // com porta falsa prova sozinho.
      expect(
        await storage.headObject({ bucket: bucket as string, key: expiredUploadedKey }),
      ).toBeUndefined()
      // O pendente recente segue com o objeto no bucket, intocado.
      expect(
        await storage.headObject({ bucket: bucket as string, key: freshUploadKey }),
      ).toBeDefined()
    })

    /** Correr de novo não tem mais nada vencido para expirar — a batida a cada cinco minutos se comporta assim toda vez. */
    test('o segundo ciclo não encontra mais nada para expirar', async () => {
      const routine = createTripOccurrenceUploadExpireRoutine({
        expire: createDrizzleExpireOccurrenceUploadBatch({
          database: db,
          deleteObject: (location) => storage.deleteObject(location),
        }),
        logger: SILENT_LOGGER as never,
        now: () => NOW,
      })

      expect((await routine.run(CONTEXT)).counters).toEqual({
        batches: 0,
        expired: 0,
        failed: 0,
        missing: 0,
      })
    })
  },
)
