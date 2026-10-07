/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4a (ADR-0094 §9.5, ajuste 4): a foto da avaria sobe ANTES da trava da chegada — o bucket
 * lento não prende os outros separadores nem conta contra o prazo do banco — sem abrir mão de nada do
 * ajuste: o reenvio devolve a gravada, a corrida do reenvio não deixa objeto órfão, e a recusa
 * depois do upload apaga o que subiu.
 */
import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import { CargoArrivalOccurrenceReplayUnreadableError } from '../../src/cargo-receiving/domain/cargo-arrival-occurrence.error.js'
import { DrizzleCargoArrivalOccurrenceUnitOfWork } from '../../src/cargo-receiving/infrastructure/drizzle-cargo-arrival-occurrence.repository.js'
import { idempotencyRecords } from '../../src/database/database.schema.js'
import { withCargoDatabase } from '../fixtures/cargo-arrival-database.fixture.js'
import { hasTestDatabase, seedDamaged } from '../fixtures/cargo-arrival-damaged.fixture.js'
import {
  createOccurrenceHandler,
  occurrenceRequest,
  seedOccurrenceType,
  type MemoryBucket,
} from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const BARRIER_TIMEOUT_MS = 1500

function newBucket(): MemoryBucket {
  return { objects: new Map(), removed: [] }
}

function damageRequest(input: {
  readonly arrivalId: string
  readonly documentId: string
  readonly key: string
  readonly typeId: string
}): Request {
  return occurrenceRequest({
    arrivalId: input.arrivalId,
    documentId: input.documentId,
    fields: { occurrenceTypeId: input.typeId, productCodes: ['P1'] },
    key: input.key,
  })
}

/** Segura as gravações até `parties` chegarem (ou o prazo vencer), e então solta todas juntas. */
function createBarrier(parties: number): () => Promise<void> {
  let arrived = 0
  let open = (): void => undefined
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return async () => {
    arrived += 1
    if (arrived >= parties) open()
    await Promise.race([opened, Bun.sleep(BARRIER_TIMEOUT_MS)])
  }
}

describe('a foto sobe antes da trava da chegada (spec 237 T3.4a)', () => {
  testWithPostgres(
    'enquanto o bucket demora, a chegada não está travada para os outros separadores',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const typeId = await seedOccurrenceType(database, { name: 'Outra', stage: 'receiving' })
        let entered = (): void => undefined
        const isUploading = new Promise<void>((resolve) => {
          entered = resolve
        })
        let release = (): void => undefined
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        const slow = createOccurrenceHandler({
          beforeStore: async () => {
            entered()
            await gate
          },
          database,
        })

        const pending = slow(
          damageRequest({
            arrivalId: damaged.arrivalId,
            documentId: damaged.documentIds[0],
            key: `slow-${crypto.randomUUID()}`,
            typeId,
          }),
        )
        await isUploading
        const probe = database.db.transaction((transaction) =>
          transaction.execute(sql`select id from cargo_arrivals for no key update nowait`),
        )
        const probeOutcome = await probe.then(
          () => 'free',
          () => 'locked',
        )
        release()

        expect(probeOutcome).toBe('free')
        expect((await pending).status).toBe(201)
      })
    },
  )

  testWithPostgres(
    'duas requisições com a mesma chave: uma grava, a outra devolve a gravada e apaga a foto que subiu',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const typeId = await seedOccurrenceType(database, { name: 'Outra', stage: 'receiving' })
        const bucket = newBucket()
        const handle = createOccurrenceHandler({
          beforeStore: createBarrier(2),
          bucket,
          database,
        })
        const key = `race-${crypto.randomUUID()}`
        const send = () =>
          handle(
            damageRequest({
              arrivalId: damaged.arrivalId,
              documentId: damaged.documentIds[0],
              key,
              typeId,
            }),
          )

        const responses = await Promise.all([send(), send()])

        expect(responses.map((response) => response.status).sort()).toEqual([200, 201])
        const ids = await Promise.all(
          responses.map(
            async (response) => ((await response.json()) as { data: { id: string } }).data.id,
          ),
        )
        expect(ids[0]).toBe(ids[1])
        expect(bucket.objects.size).toBe(1)
        expect(bucket.removed.length).toBe(1)
        expect(bucket.removed.every((objectKey) => !bucket.objects.has(objectKey))).toBeTrue()
      })
    },
  )

  testWithPostgres('o reenvio já gravado nem chega ao bucket', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const damaged = await seedDamaged(database, tenants)
      const typeId = await seedOccurrenceType(database, { name: 'Outra', stage: 'receiving' })
      let uploads = 0
      const handle = createOccurrenceHandler({
        beforeStore: async () => {
          uploads += 1
        },
        database,
      })
      const key = `again-${crypto.randomUUID()}`
      const send = () =>
        handle(
          damageRequest({
            arrivalId: damaged.arrivalId,
            documentId: damaged.documentIds[0],
            key,
            typeId,
          }),
        )

      expect((await send()).status).toBe(201)
      expect(uploads).toBe(1)
      expect((await send()).status).toBe(200)
      expect(uploads).toBe(1)
    })
  })

  testWithPostgres(
    'a recusa depois do upload apaga a foto: nenhum objeto órfão no bucket',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const damaged = await seedDamaged(database, tenants)
        const bucket = newBucket()
        const foreignType = await seedOccurrenceType(database, {
          companyId: tenants.foreignCompanyId,
          stage: 'receiving',
        })
        const handle = createOccurrenceHandler({ bucket, database })

        const refused = await handle(
          damageRequest({
            arrivalId: damaged.arrivalId,
            documentId: damaged.documentIds[0],
            key: `refused-${crypto.randomUUID()}`,
            typeId: foreignType,
          }),
        )

        expect(refused.status).toBe(404)
        expect(bucket.objects.size).toBe(0)
      })
    },
  )

  testWithPostgres(
    'a resposta guardada ilegível é erro diagnosticável, não um Error cru',
    async () => {
      await withCargoDatabase(async (database) => {
        await database.db.insert(idempotencyRecords).values({
          companyId: COMPANY_CONTEXT.companyId,
          idempotencyKey: 'unreadable-key-0000001',
          operation: 'cargo-arrival-occurrence',
          requestFingerprint: 'f'.repeat(64),
          response: { unexpected: true },
          status: 'succeeded',
        })
        const unitOfWork = new DrizzleCargoArrivalOccurrenceUnitOfWork(database.db, 'integration')

        await expect(
          unitOfWork.execute({
            operation: (transaction) => transaction.findReplay('unreadable-key-0000001'),
            scope: { arrivalId: crypto.randomUUID(), companyId: COMPANY_CONTEXT.companyId },
          }),
        ).rejects.toBeInstanceOf(CargoArrivalOccurrenceReplayUnreadableError)
      })
    },
  )
})
