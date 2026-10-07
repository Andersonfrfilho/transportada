/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2 (ADR-0094 §9): a avaria sem viagem contra Postgres — nasce na nota da chegada, sem
 * viagem, dentro da janela, com itens, foto e tratativa; o reenvio não duplica; tudo que não pode é
 * recusado com código estável e sem gravar nada.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  auditLogs,
  cargoArrivalDocuments,
  cargoArrivalEvents,
  idempotencyRecords,
  storedObjects,
  tripDocumentOccurrenceAttachments,
  tripDocumentOccurrenceProducts,
  tripDocumentOccurrences,
  tripOccurrenceCases,
} from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  seedIssuedDocument,
  withCargoDatabase,
  type CargoTenants,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  buildPostRequest,
  callCargoArrival as call,
  createCargoArrivalHandler,
} from '../fixtures/cargo-arrival-http.fixture.js'
import {
  createOccurrenceHandler,
  occurrenceRequest,
  seedOccurrenceType,
  seedProduct,
  type MemoryBucket,
} from '../fixtures/cargo-arrival-occurrence.fixture.js'
import { findPostgresError } from '../../src/database/postgres-error.support.js'
import { COMPANY_CONTEXT, jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const HOUR_MS = 3_600_000
const ARRIVED_AT = new Date(Date.now() - 2 * HOUR_MS)

type Arrival = { readonly arrivalId: string; readonly documentIds: readonly string[] }

/** Chegada de duas notas, a primeira já conferida na doca e com dois itens no XML. */
async function seedArrival(database: TestDatabase, tenants: CargoTenants): Promise<Arrival> {
  const documentIds = [
    await seedIssuedDocument(database, { number: '21' }),
    await seedIssuedDocument(database, { number: '22' }),
  ]
  await seedProduct(database, { code: 'P1', documentId: documentIds[0] ?? '', unit: 'CX' })
  const handle = createCargoArrivalHandler({ database })
  const registered = await call(
    handle,
    buildPostRequest({
      body: {
        arrivedAt: ARRIVED_AT.toISOString(),
        contractorId: tenants.contractorId,
        documentIds,
      },
      key: `arrival-${crypto.randomUUID()}`,
      path: '/cargo-arrivals',
    }),
  )
  const arrivalId = String(registered.body.data?.id)
  await call(
    handle,
    buildPostRequest({
      body: { documentIds: [documentIds[0]], to: 'received' },
      path: `/cargo-arrivals/${arrivalId}/documents/batch-status`,
    }),
  )
  return { arrivalId, documentIds }
}

function damageFields(typeId: string): Record<string, string | readonly string[]> {
  return {
    note: 'caixa amassada na doca',
    occurrenceTypeId: typeId,
    productCodes: ['P1'],
    productQuantities: ['2'],
    productQuantityUnits: ['CX'],
  }
}

async function json(response: Response): Promise<{ data?: unknown; error?: { code?: string } }> {
  return (await response.json()) as { data?: unknown; error?: { code?: string } }
}

async function countWrites(database: TestDatabase): Promise<number> {
  const [occurrences, events, objects] = await Promise.all([
    database.db.select({ id: tripDocumentOccurrences.id }).from(tripDocumentOccurrences),
    database.db.select({ id: cargoArrivalEvents.id }).from(cargoArrivalEvents),
    database.db.select({ id: storedObjects.id }).from(storedObjects),
  ])
  return occurrences.length + events.length + objects.length
}

describe('a avaria sem viagem (spec 237 T3.2)', () => {
  testWithPostgres(
    'nasce na nota da chegada, sem viagem, com item, foto, tratativa, trilha e chave',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { arrivalId, documentIds } = await seedArrival(database, tenants)
        const typeId = await seedOccurrenceType(database, { stage: 'receiving' })
        const bucket: MemoryBucket = { objects: new Map(), removed: [] }
        const handle = createOccurrenceHandler({ bucket, database })
        const documentId = documentIds[0] ?? ''

        const created = await handle(
          occurrenceRequest({
            arrivalId,
            documentId,
            fields: damageFields(typeId),
            key: 'k'.repeat(20),
          }),
        )
        expect(created.status).toBe(201)
        const occurrence = (await json(created)).data as Record<string, unknown>

        const [row] = await database.db
          .select()
          .from(tripDocumentOccurrences)
          .where(eq(tripDocumentOccurrences.id, String(occurrence.id)))
        expect(row).toMatchObject({
          channel: 'backoffice',
          onBehalfOfDriverId: null,
          stage: 'receiving',
          tripDocumentId: null,
        })
        expect(row?.cargoArrivalDocumentId).toBeString()
        const products = await database.db.select().from(tripDocumentOccurrenceProducts)
        expect(
          products.map((item) => [item.productCode, item.quantity, item.quantityUnit]),
        ).toEqual([['P1', '2.000', 'CX']])
        expect(await database.db.select().from(tripDocumentOccurrenceAttachments)).toHaveLength(1)
        expect(bucket.objects.size).toBe(1)
        const [occurrenceCase] = await database.db.select().from(tripOccurrenceCases)
        expect(occurrenceCase).toMatchObject({ redeliveryPolicy: 'blocked', status: 'recorded' })
        const events = await database.db
          .select({ kind: cargoArrivalEvents.kind })
          .from(cargoArrivalEvents)
          .where(eq(cargoArrivalEvents.kind, 'occurrence_registered'))
        expect(events).toHaveLength(1)
        const audits = await database.db
          .select()
          .from(auditLogs)
          .where(eq(auditLogs.action, 'cargo-arrival.occurrence-registered'))
        expect(audits).toHaveLength(1)
        expect(await database.db.select().from(idempotencyRecords)).toHaveLength(1)

        expect(occurrence).toMatchObject({
          case: { status: 'recorded' },
          items: [{ code: 'P1', description: 'Produto P1', quantity: '2.000', unit: 'CX' }],
          nfeDocumentId: documentId,
          typeName: 'Tipo receiving',
        })
        expect((occurrence.attachments as unknown[])[0]).toMatchObject({ position: 1 })
      })
    },
  )

  testWithPostgres(
    'o reenvio devolve a mesma ocorrência; a chave com outro pedido é 409',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { arrivalId, documentIds } = await seedArrival(database, tenants)
        const typeId = await seedOccurrenceType(database, { stage: 'receiving' })
        const handle = createOccurrenceHandler({ database })
        const request = (note?: string) =>
          occurrenceRequest({
            arrivalId,
            documentId: documentIds[0] ?? '',
            fields: { ...damageFields(typeId), ...(note === undefined ? {} : { note }) },
            key: 'replay-key-000000001',
          })

        const first = await handle(request())
        const before = await countWrites(database)
        const replay = await handle(request())
        const reused = await handle(request('outra coisa'))

        expect([first.status, replay.status, reused.status]).toEqual([201, 200, 409])
        expect(((await json(replay)).data as { id: string }).id).toBe(
          ((await json(first)).data as { id: string }).id,
        )
        expect((await json(reused)).error?.code).toBe('CARGO_ARRIVAL_OCCURRENCE_KEY_REUSED')
        expect(await countWrites(database)).toBe(before)
      })
    },
  )

  testWithPostgres('fora da janela é 422 com código estável, e nada é gravado', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId, documentIds } = await seedArrival(database, tenants)
      const typeId = await seedOccurrenceType(database, { stage: 'receiving' })
      const late = createOccurrenceHandler({
        database,
        now: () => new Date(ARRIVED_AT.getTime() + 24 * HOUR_MS + 1),
      })
      const before = await countWrites(database)

      const response = await late(
        occurrenceRequest({
          arrivalId,
          documentId: documentIds[0] ?? '',
          fields: damageFields(typeId),
          key: 'late-key-00000000001',
        }),
      )

      expect(response.status).toBe(422)
      expect((await json(response)).error?.code).toBe('CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED')
      expect(await countWrites(database)).toBe(before)
    })
  })

  testWithPostgres(
    'recusa nota não conferida, de outra chegada ou empresa, e tipo errado',
    async () => {
      await withCargoDatabase(async (database, tenants) => {
        const { arrivalId, documentIds } = await seedArrival(database, tenants)
        const other = await seedArrival(database, tenants)
        const receiving = await seedOccurrenceType(database, { stage: 'receiving' })
        const separation = await seedOccurrenceType(database, { stage: 'separation' })
        const foreign = await seedOccurrenceType(database, {
          companyId: tenants.foreignCompanyId,
          stage: 'receiving',
        })
        const handle = createOccurrenceHandler({ database })
        const attempt = async (input: { documentId: string; typeId: string; arrival?: string }) => {
          const response = await handle(
            occurrenceRequest({
              arrivalId: input.arrival ?? arrivalId,
              documentId: input.documentId,
              fields: damageFields(input.typeId),
              key: `refusal-${crypto.randomUUID()}`,
            }),
          )
          return [response.status, (await json(response)).error?.code]
        }
        const before = await countWrites(database)

        expect(await attempt({ documentId: documentIds[1] ?? '', typeId: receiving })).toEqual([
          409,
          'CARGO_ARRIVAL_DOCUMENT_NOT_RECEIVED',
        ])
        expect(
          await attempt({ documentId: other.documentIds[0] ?? '', typeId: receiving }),
        ).toEqual([404, 'CARGO_ARRIVAL_DOCUMENT_NOT_FOUND'])
        expect(
          await attempt({
            arrival: crypto.randomUUID(),
            documentId: documentIds[0] ?? '',
            typeId: receiving,
          }),
        ).toEqual([404, 'CARGO_ARRIVAL_NOT_FOUND'])
        expect(await attempt({ documentId: documentIds[0] ?? '', typeId: separation })).toEqual([
          422,
          'OCCURRENCE_TYPE_NOT_RECEIVING',
        ])
        expect(await attempt({ documentId: documentIds[0] ?? '', typeId: foreign })).toEqual([
          404,
          'CARGO_ARRIVAL_OCCURRENCE_TYPE_NOT_FOUND',
        ])
        expect(await countWrites(database)).toBe(before)
      })
    },
  )

  testWithPostgres('a leitura é da empresa do contexto: a chegada alheia é 404', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId } = await seedArrival(database, tenants)
      const handle = createOccurrenceHandler({ database })
      const own = await handle(
        jsonRequest({ method: 'GET', path: `/cargo-arrivals/${arrivalId}/occurrences` }),
      )
      const missing = await handle(
        jsonRequest({ method: 'GET', path: `/cargo-arrivals/${crypto.randomUUID()}/occurrences` }),
      )

      expect(own.status).toBe(200)
      expect((await json(own)).data).toMatchObject({
        occurrences: [],
        returnCounts: { marked: 0, returned: 0 },
      })
      expect(missing.status).toBe(404)
    })
  })

  testWithPostgres('o banco exige exatamente um dono, e a etapa casada com ele', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const { arrivalId } = await seedArrival(database, tenants)
      const typeId = await seedOccurrenceType(database, { stage: 'separation' })
      const [arrivalDocument] = await database.db
        .select({ id: cargoArrivalDocuments.id })
        .from(cargoArrivalDocuments)
        .where(eq(cargoArrivalDocuments.arrivalId, arrivalId))
      const base = {
        actorUserId: COMPANY_CONTEXT.userId,
        companyId: COMPANY_CONTEXT.companyId,
        occurrenceTypeId: typeId,
      }
      const constraintOf = async (values: typeof tripDocumentOccurrences.$inferInsert) => {
        try {
          await database.db.insert(tripDocumentOccurrences).values(values)
          return 'accepted'
        } catch (error) {
          return findPostgresError({ error })?.constraint ?? 'unknown'
        }
      }

      expect(await constraintOf({ ...base, stage: 'separation' })).toBe(
        'trip_document_occurrences_owner_check',
      )
      expect(
        await constraintOf({
          ...base,
          cargoArrivalDocumentId: arrivalDocument?.id ?? null,
          stage: 'separation',
        }),
      ).toBe('trip_document_occurrences_receiving_owner_check')
    })
  })
})
