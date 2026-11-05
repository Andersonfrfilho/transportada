/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T3.3 (RF25, RF26, RF27) contra o Postgres: a API confere a ordem da parada e o canhoto repetido
 * para a tripulação; o escritório nunca recebe a pergunta de ordem e troca o próprio canhoto.
 */
import { createHash } from 'node:crypto'

import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { tripDeliveryProofs, tripStopEvents, tripStops } from '../../src/database/trip.schema.js'
import { ApiError } from '../../src/shared/api.error.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportFieldProof } from '../../src/trips/application/report-field-proof.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import {
  FAKE_ENVELOPE,
  fakeProofStorage,
  linkDriverMembership,
  seedCompany,
  seedExtraDocument,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const BUCKET = 'test-bucket'

type World = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  firstDocumentId: string
  firstStopId: string
  secondDocumentId: string
  secondStopId: string
  trip: SeededTrip
}>

/** Parada 1 (a semeada) e parada 2, cada uma com uma nota carregada. */
async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const secondStopId = crypto.randomUUID()
  await database.db.insert(tripStops).values({
    addressKey: `key-${secondStopId}`,
    companyId: company.companyId,
    id: secondStopId,
    label: 'Rua 2, 20',
    sequence: 2n,
    tripId: trip.tripId,
  })
  const secondDocumentId = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId: secondStopId,
  })

  return {
    company,
    database,
    driverUserId,
    firstDocumentId: trip.documentId,
    firstStopId: trip.stopId,
    secondDocumentId,
    secondStopId,
    trip,
  }
}

function unitOfWorkFor(world: World): DrizzleDriverFieldReportUnitOfWork {
  return new DrizzleDriverFieldReportUnitOfWork(world.database.db, BUCKET)
}

function depart(
  world: World,
  input: { readonly confirm?: true; readonly key: string; readonly stopId: string },
) {
  return reportStopDeparture({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    ...(input.confirm === true ? { confirmOutOfOrder: true } : {}),
    driverId: world.company.firstDriverId,
    idempotencyKey: input.key,
    location: null,
    now: new Date(),
    stopId: input.stopId,
    tappedAt: new Date(),
    unitOfWork: unitOfWorkFor(world),
  })
}

function arrive(
  world: World,
  input: { readonly confirm?: true; readonly key: string; readonly stopId: string },
) {
  return reportStopArrival({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    ...(input.confirm === true ? { confirmOutOfOrder: true } : {}),
    driverId: world.company.firstDriverId,
    idempotencyKey: input.key,
    location: null,
    now: new Date(),
    stopId: input.stopId,
    unitOfWork: unitOfWorkFor(world),
  })
}

function deliver(
  world: World,
  input: { readonly confirm?: true; readonly documentId: string; readonly key: string },
) {
  return reportDocumentDelivery({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    ...(input.confirm === true ? { confirmOutOfOrder: true } : {}),
    documentId: input.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: input.key,
    location: null,
    now: new Date(),
    unitOfWork: unitOfWorkFor(world),
  })
}

async function deliverFromOffice(world: World, documentId: string, key: string) {
  const target = await resolveFieldTripTarget({
    companyId: world.company.companyId,
    repository: new DrizzleFieldTripTargetRepository(world.database.db),
    target: { kind: 'trip', tripId: world.trip.tripId },
  })

  return reportDocumentDelivery({
    actorUserId: world.company.userId,
    companyId: world.company.companyId,
    documentId,
    idempotencyKey: key,
    location: null,
    now: new Date(Date.now() - 60_000),
    target,
    unitOfWork: unitOfWorkFor(world),
  })
}

async function expectOutOfOrder(operation: Promise<unknown>): Promise<ApiError> {
  const error = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).code).toBe('TRIP_STOP_OUT_OF_ORDER')
  expect((error as ApiError).status).toBe(409)

  return error as ApiError
}

async function countEvents(world: World, stopId: string): Promise<number> {
  const rows = await world.database.db
    .select({ id: tripStopEvents.id })
    .from(tripStopEvents)
    .where(
      and(eq(tripStopEvents.companyId, world.company.companyId), eq(tripStopEvents.stopId, stopId)),
    )

  return rows.length
}

describe('a ordem da parada na API (spec 294 RF25/RF27)', () => {
  testWithPostgres('em ordem nada muda: sair, chegar e baixar a primeira parada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)

      await depart(world, { key: 'depart-1', stopId: world.firstStopId })
      await arrive(world, { key: 'arrive-1', stopId: world.firstStopId })
      const delivered = await deliver(world, {
        documentId: world.firstDocumentId,
        key: 'deliver-1',
      })

      expect(delivered.stopCompleted).toBe(true)
      expect(delivered.recordedTogether).toEqual([])
    })
  })

  testWithPostgres(
    'sair para a parada 2 com a 1 pendente é 409 com a próxima, e confirmar grava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const error = await expectOutOfOrder(
          depart(world, { key: 'depart-2', stopId: world.secondStopId }),
        )

        expect(error.extraBody).toEqual({
          outOfOrder: {
            currentSequence: null,
            currentStopId: null,
            nextSequence: 1,
            nextStopId: world.firstStopId,
            requestedSequence: 2,
            requestedStopId: world.secondStopId,
          },
        })
        expect(await countEvents(world, world.secondStopId)).toBe(0)

        const confirmed = await depart(world, {
          confirm: true,
          key: 'depart-2-confirmed',
          stopId: world.secondStopId,
        })
        expect(confirmed.changed).toBe(true)
        expect(await countEvents(world, world.secondStopId)).toBe(1)
      })
    },
  )

  testWithPostgres(
    'com a parada 1 a caminho, baixar a 2 é 409; confirmar marca junto e grava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        await depart(world, { key: 'depart-1', stopId: world.firstStopId })

        const error = await expectOutOfOrder(
          deliver(world, { documentId: world.secondDocumentId, key: 'deliver-2' }),
        )
        expect((error.extraBody?.outOfOrder as { currentStopId: string }).currentStopId).toBe(
          world.firstStopId,
        )
        expect(await countEvents(world, world.secondStopId)).toBe(0)

        const confirmed = await deliver(world, {
          confirm: true,
          documentId: world.secondDocumentId,
          key: 'deliver-2-confirmed',
        })
        expect(confirmed.recordedTogether).toEqual(['departed', 'arrived'])
      })
    },
  )

  testWithPostgres('chegar na parada 2 com a 1 a caminho é 409 e a 1 segue a caminho', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await depart(world, { key: 'depart-1', stopId: world.firstStopId })

      await expectOutOfOrder(arrive(world, { key: 'arrive-2', stopId: world.secondStopId }))

      const [first] = await database.db
        .select({ enRouteSince: tripStops.enRouteSince })
        .from(tripStops)
        .where(eq(tripStops.id, world.firstStopId))
      expect(first?.enRouteSince).not.toBeNull()
    })
  })

  testWithPostgres('o reenvio de uma baixa confirmada nunca é 409', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await depart(world, { key: 'depart-1', stopId: world.firstStopId })
      const first = await deliver(world, {
        confirm: true,
        documentId: world.secondDocumentId,
        key: 'deliver-2-replay',
      })

      const replay = await deliver(world, {
        documentId: world.secondDocumentId,
        key: 'deliver-2-replay',
      })

      expect(replay.id).toBe(first.id)
    })
  })

  testWithPostgres('o escritório baixa a parada 2 com a 1 a caminho sem pergunta', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await depart(world, { key: 'depart-1', stopId: world.firstStopId })

      const result = await deliverFromOffice(world, world.secondDocumentId, 'office-deliver-2')

      expect(result.recordedTogether).toEqual([])
    })
  })
})

function jpegBytes(seed: number): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, seed])

  return bytes
}

function hashingStorage() {
  return {
    store: async (input: { readonly bytes: Uint8Array }) => ({
      sha256: createHash('sha256').update(input.bytes).digest('hex'),
    }),
  }
}

function attach(
  world: World,
  input: {
    readonly bytes: Uint8Array
    readonly documentId: string
    readonly replaceCanhoto?: true
  },
) {
  return attachDeliveryProof({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: input.documentId,
    driverId: world.company.firstDriverId,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: new Date(),
    repository: new DrizzleDeliveryProofRepository(world.database.db, BUCKET),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: hashingStorage(),
    upload: {
      attachmentKey: `photo-${crypto.randomUUID()}`,
      bytes: input.bytes,
      capturedAt: undefined,
      kind: 'photo',
      mimeType: 'image/jpeg',
      position: undefined,
      receiverDocument: '',
      receiverName: 'Maria',
      ...(input.replaceCanhoto === true ? { replaceCanhoto: true } : {}),
    },
  })
}

async function countCanhotos(world: World): Promise<number> {
  const rows = await world.database.db
    .select({ id: tripDeliveryProofs.id })
    .from(tripDeliveryProofs)
    .where(eq(tripDeliveryProofs.companyId, world.company.companyId))

  return rows.length
}

async function seedDeliveredWorld(database: TestDatabase): Promise<World> {
  const world = await seedWorld(database)
  await deliver(world, { documentId: world.firstDocumentId, key: 'deliver-1' })
  await deliver(world, { confirm: true, documentId: world.secondDocumentId, key: 'deliver-2' })

  return world
}

describe('o canhoto repetido na API (spec 294 RF26)', () => {
  testWithPostgres(
    'nota entregue sem canhoto recebe a foto como o canhoto que faltava',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)

        const result = await attach(world, {
          bytes: jpegBytes(1),
          documentId: world.firstDocumentId,
        })

        expect(result.duplicate).toBeUndefined()
        expect(await countCanhotos(world)).toBe(1)
      })
    },
  )

  testWithPostgres(
    'C5: a mesma imagem em duas notas ao mesmo tempo grava um canhoto só; o outro responde duplicate',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)

        const results = await Promise.all([
          attach(world, { bytes: jpegBytes(9), documentId: world.firstDocumentId }),
          attach(world, { bytes: jpegBytes(9), documentId: world.secondDocumentId }),
        ])

        expect(results.filter((result) => result.duplicate === undefined)).toHaveLength(1)
        expect(results.filter((result) => result.duplicate !== undefined)).toHaveLength(1)
        expect(await countCanhotos(world)).toBe(1)
      })
    },
  )

  testWithPostgres(
    'a mesma imagem em outra nota responde duplicate e não grava de novo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        await attach(world, { bytes: jpegBytes(1), documentId: world.firstDocumentId })

        const result = await attach(world, {
          bytes: jpegBytes(1),
          documentId: world.secondDocumentId,
        })

        expect(result.duplicate?.documentId).toBe(world.firstDocumentId)
        expect(result.duplicate?.attachedAt).toBeInstanceOf(Date)
        expect(await countCanhotos(world)).toBe(1)
      })
    },
  )

  testWithPostgres(
    'outro canhoto sobre o da nota é 409 para a tripulação, e passa com replaceCanhoto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        await attach(world, { bytes: jpegBytes(1), documentId: world.firstDocumentId })

        const error = await attach(world, {
          bytes: jpegBytes(2),
          documentId: world.firstDocumentId,
        }).then(
          () => undefined,
          (caught: unknown) => caught,
        )
        expect((error as ApiError).code).toBe('TRIP_CANHOTO_ALREADY_ATTACHED')
        expect((error as ApiError).status).toBe(409)

        await attach(world, {
          bytes: jpegBytes(2),
          documentId: world.firstDocumentId,
          replaceCanhoto: true,
        })
        expect(await countCanhotos(world)).toBe(1)
      })
    },
  )

  testWithPostgres(
    'o escritório troca o próprio canhoto sem confirmação e a mesma imagem é duplicate',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredWorld(database)
        const target = await resolveFieldTripTarget({
          companyId: world.company.companyId,
          repository: new DrizzleFieldTripTargetRepository(database.db),
          target: { kind: 'trip', tripId: world.trip.tripId },
        })
        const officeProof = (input: { readonly bytes: Uint8Array; readonly key: string }) =>
          reportFieldProof({
            actorUserId: world.company.userId,
            attachment: {
              newObjectId: () => crypto.randomUUID(),
              newProofId: () => crypto.randomUUID(),
              resolveSettings: () =>
                new DrizzleDeliveryProofRepository(database.db, BUCKET).resolveProofFieldSettings({
                  companyId: world.company.companyId,
                  documentId: world.firstDocumentId,
                }),
              sealDocument: async () => FAKE_ENVELOPE,
              storage: { ...fakeProofStorage(), ...hashingStorage() },
            },
            companyId: world.company.companyId,
            documentId: world.firstDocumentId,
            idempotencyKey: input.key,
            kind: 'photo',
            officeAudit: {
              action: 'office.document.proof',
              correlationId: 'c-1',
              ipAddress: '127.0.0.1',
            },
            target,
            unitOfWork: unitOfWorkFor(world),
            upload: {
              attachmentKey: '',
              bytes: input.bytes,
              mimeType: 'image/jpeg',
              receiverDocument: '',
              receiverName: 'Maria',
            },
          })

        await officeProof({ bytes: jpegBytes(1), key: 'office-1' })
        const replaced = await officeProof({ bytes: jpegBytes(2), key: 'office-2' })
        expect(replaced.duplicate).toBeUndefined()
        expect(await countCanhotos(world)).toBe(1)

        const repeated = await officeProof({ bytes: jpegBytes(2), key: 'office-3' })
        expect(repeated.duplicate?.documentId).toBe(world.firstDocumentId)
        expect(await countCanhotos(world)).toBe(1)
      })
    },
  )
})
