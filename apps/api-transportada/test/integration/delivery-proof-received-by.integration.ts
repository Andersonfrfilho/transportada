/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 193 (ADR-0079 Parte A), contra o Postgres: quem recebeu chega ao comprovante pelos dois
 * canais. No motorista nada recusa a foto — forma inválida vira nulo e o modo `required` é pendência
 * (CA03, CA04, CA05, CA07). No escritório, que envia síncrono, forma inválida é 400 e `required` sem
 * relação é 422 (CA05). O molde é o de `trip-field-office.integration.ts`.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { tripDeliveryProofs, tripFieldReports } from '../../src/database/trip.schema.js'
import { attachDeliveryProof } from '../../src/trips/application/attach-delivery-proof.use-case.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { updateDriverProofReceiver } from '../../src/trips/application/update-driver-proof-receiver.use-case.js'
import type { DeliveryProofFieldMode } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { listDeliveryProofs } from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'
import type { ProofReceiverPatch } from '../../src/trips/presentation/me-proof-receiver.schema.js'
import {
  FAKE_ENVELOPE,
  JPEG_BYTES,
  fakeContext,
  linkDriverMembership,
  multipartRequest,
  seedCompany,
  seedDispatchSnapshot,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  wireRoutes,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

type DriverWorld = Readonly<{
  company: Company
  database: TestDatabase
  driver: Readonly<{
    actorUserId: string
    companyId: string
    documentId: string
    driverId: string
  }>
  trip: SeededTrip
}>

async function seedDeliveredByDriver(
  database: TestDatabase,
  receivedBy: DeliveryProofFieldMode,
): Promise<DriverWorld> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, receivedBy })
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  const driver = {
    actorUserId: driverUserId,
    companyId: company.companyId,
    documentId: trip.documentId,
    driverId: company.firstDriverId,
  }
  await reportDocumentDelivery({
    ...driver,
    idempotencyKey: `entrega-${crypto.randomUUID()}`,
    location: null,
    now: new Date(),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket'),
  })
  return { company, database, driver, trip }
}

/** O multipart que o app manda, lido pela mesma função da rota (`parseDeliveryProofUpload`). */
async function parseDriverForm(fields: Readonly<Record<string, string>>) {
  const form = new FormData()
  form.set('file', new File([JPEG_BYTES], 'canhoto.jpg', { type: 'image/jpeg' }))
  for (const [name, value] of Object.entries(fields)) form.set(name, value)
  return parseDeliveryProofUpload(
    new Request('http://localhost/me/trips/current/documents/x/proof', {
      body: form,
      method: 'POST',
    }),
  )
}

async function attachFromDriverForm(
  world: DriverWorld,
  fields: Readonly<Record<string, string>>,
): Promise<{ readonly id: string }> {
  return attachDeliveryProof({
    ...world.driver,
    newObjectId: () => crypto.randomUUID(),
    newProofId: () => crypto.randomUUID(),
    now: new Date(),
    repository: new DrizzleDeliveryProofRepository(world.database.db, 'test-bucket'),
    sealDocument: async () => FAKE_ENVELOPE,
    storage: { store: async () => ({ sha256: 'e'.repeat(64) }) },
    upload: await parseDriverForm(fields),
  })
}

async function readProofRows(database: TestDatabase, companyId: string) {
  return database.db
    .select({
      channel: tripDeliveryProofs.channel,
      kind: tripDeliveryProofs.kind,
      receivedBy: tripDeliveryProofs.receivedBy,
      receivedByDetail: tripDeliveryProofs.receivedByDetail,
      receiverName: tripDeliveryProofs.receiverName,
    })
    .from(tripDeliveryProofs)
    .where(eq(tripDeliveryProofs.companyId, companyId))
    .orderBy(tripDeliveryProofs.kind)
}

describe('quem recebeu pela foto do motorista (spec 193 CA03, CA04, CA05, CA07)', () => {
  testWithPostgres(
    'grava nome, relação e detalhe na foto; o replay da mesma chave não reescreve',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredByDriver(database, 'optional')

        const first = await attachFromDriverForm(world, {
          attachmentKey: 'canhoto-1',
          kind: 'photo',
          receivedBy: 'neighbor',
          receivedByDetail: 'casa 12',
          receiverName: 'Maria de Sousa',
        })
        const replay = await attachFromDriverForm(world, {
          attachmentKey: 'canhoto-1',
          kind: 'photo',
          receivedBy: 'doorman',
          receiverName: 'Outra Pessoa',
        })

        expect(replay.id).toBe(first.id)
        expect(await readProofRows(database, world.company.companyId)).toEqual([
          {
            channel: 'driver_app',
            kind: 'photo',
            receivedBy: 'neighbor',
            receivedByDetail: 'casa 12',
            receiverName: 'Maria de Sousa',
          },
        ])
      })
    },
  )

  testWithPostgres(
    'forma inválida nunca recusa: relação fora da lista e detalhe sem relação viram nulo',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredByDriver(database, 'optional')

        await attachFromDriverForm(world, {
          kind: 'photo',
          receivedBy: 'cousin',
          receivedByDetail: 'casa 12',
          receiverName: 'Maria de Sousa',
        })
        await attachFromDriverForm(world, { kind: 'signature', receivedBy: 'other' })

        expect(await readProofRows(database, world.company.companyId)).toEqual([
          {
            channel: 'driver_app',
            kind: 'photo',
            receivedBy: null,
            receivedByDetail: null,
            receiverName: 'Maria de Sousa',
          },
          {
            channel: 'driver_app',
            kind: 'signature',
            receivedBy: 'other',
            receivedByDetail: null,
            receiverName: '',
          },
        ])
      })
    },
  )

  testWithPostgres.each(['off', 'required'] as const)(
    'com o modo %s, a foto entra e quem recebeu fica nulo',
    async (mode) => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredByDriver(database, mode)

        await attachFromDriverForm(world, {
          kind: 'photo',
          ...(mode === 'off' ? { receivedBy: 'neighbor', receivedByDetail: 'casa 12' } : {}),
        })

        expect(await readProofRows(database, world.company.companyId)).toMatchObject([
          { kind: 'photo', receivedBy: null, receivedByDetail: null },
        ])
      })
    },
  )
})

describe('a leitura do comprovante devolve quem recebeu (spec 193 CA09)', () => {
  testWithPostgres('relação e detalhe da mesma linha do nome, e null no antigo', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDeliveredByDriver(database, 'optional')
      await attachFromDriverForm(world, {
        kind: 'photo',
        receivedBy: 'neighbor',
        receivedByDetail: 'casa 12',
        receiverName: 'Maria',
      })
      await attachFromDriverForm(world, { kind: 'signature', receiverName: 'Maria' })

      const proofs = await listDeliveryProofs(database.db, {
        companyId: world.company.companyId,
        documentId: world.trip.documentId,
        tripId: world.trip.tripId,
      })

      expect(
        proofs.map(({ kind, receivedBy, receivedByDetail, receiverName }) => ({
          kind,
          receivedBy,
          receivedByDetail,
          receiverName,
        })),
      ).toEqual([
        {
          kind: 'photo',
          receivedBy: 'neighbor',
          receivedByDetail: 'casa 12',
          receiverName: 'Maria',
        },
        { kind: 'signature', receivedBy: null, receivedByDetail: null, receiverName: 'Maria' },
      ])
    })
  })
})

describe('quem recebeu pelo canhoto do escritório (spec 193 CA05)', () => {
  async function seedOfficeDelivery(database: TestDatabase, receivedBy: DeliveryProofFieldMode) {
    const company = await seedCompany(database)
    const trip = await seedTrip(database, company, 'in_transit')
    await seedDispatchSnapshot(database, company, trip, new Date('2026-09-17T08:00:00.000Z'))
    await seedStopArrival(database, trip, new Date('2026-09-18T08:30:00.000Z'))
    await database.db
      .insert(companyDeliveryProofSettings)
      .values({ companyId: company.companyId, receivedBy })
    const [, , , , deliverRoute] = wireRoutes(database)
    const deliver = (fields: Readonly<Record<string, string>>, idempotencyKey: string) =>
      deliverRoute!.execute({
        context: fakeContext(company),
        correlationId: `integration-received-by-${idempotencyKey}`,
        pathParameters: { id: trip.tripId, documentId: trip.documentId },
        request: multipartRequest({
          fields: { deliveredAt: '2026-09-18T09:00:00.000Z', receiverName: 'Ana', ...fields },
          file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
          idempotencyKey,
        }),
      })
    return { company, deliver }
  }

  testWithPostgres('required sem relação é 422 e nada é gravado', async () => {
    await withDisposableDatabase(async (database) => {
      const { company, deliver } = await seedOfficeDelivery(database, 'required')

      await expect(deliver({}, 'office-received-by-missing')).rejects.toMatchObject({
        code: 'TRIP_DELIVERY_PROOF_RECEIVED_BY_REQUIRED',
        status: 422,
      })
      expect(await readProofRows(database, company.companyId)).toEqual([])
    })
  })

  testWithPostgres('forma inválida é 400 INVALID_REQUEST no campo', async () => {
    await withDisposableDatabase(async (database) => {
      const { company, deliver } = await seedOfficeDelivery(database, 'optional')

      await expect(
        deliver({ receivedBy: 'cousin' }, 'office-received-by-invalid'),
      ).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
        details: [{ field: 'receivedBy' }],
        status: 400,
      })
      await expect(
        deliver({ receivedBy: 'other' }, 'office-received-by-no-detail'),
      ).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
        details: [{ field: 'receivedByDetail' }],
        status: 400,
      })
      expect(await readProofRows(database, company.companyId)).toEqual([])
    })
  })

  testWithPostgres(
    'required com relação grava a relação e o detalhe no canhoto (201)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, deliver } = await seedOfficeDelivery(database, 'required')

        const response = await deliver(
          { receivedBy: 'neighbor', receivedByDetail: 'casa 12' },
          'office-received-by-ok',
        )

        expect(response.status).toBe(201)
        expect(await readProofRows(database, company.companyId)).toEqual([
          {
            channel: 'office',
            kind: 'photo',
            receivedBy: 'neighbor',
            receivedByDetail: 'casa 12',
            receiverName: 'Ana',
          },
        ])
      })
    },
  )
})

describe('PATCH de quem recebeu depois do envio (spec 193 CA06)', () => {
  function patchReceiver(
    world: DriverWorld,
    input: Readonly<{ idempotencyKey: string; patch: ProofReceiverPatch }>,
  ) {
    return updateDriverProofReceiver({
      ...world.driver,
      idempotencyKey: input.idempotencyKey,
      patch: input.patch,
      proofs: new DrizzleDeliveryProofRepository(world.database.db, 'test-bucket'),
      unitOfWork: new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket'),
    })
  }

  testWithPostgres(
    'atualiza a foto do motorista, não duplica com a mesma chave e não toca a foto da carga',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredByDriver(database, 'optional')
        await attachFromDriverForm(world, { kind: 'photo' })
        // O motorista não manda `cargo` (`DRIVER_PROOF_KINDS`): a foto da carga é do escritório
        const [, , , , , , proofRoute] = wireRoutes(database)
        await proofRoute!.execute({
          context: fakeContext(world.company),
          correlationId: 'integration-received-by-cargo',
          pathParameters: { id: world.trip.tripId, documentId: world.trip.documentId },
          request: multipartRequest({
            fields: { kind: 'cargo' },
            file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            idempotencyKey: 'office-cargo-before-patch',
          }),
        })
        const neighbor = {
          receivedBy: { receivedBy: 'neighbor', receivedByDetail: 'casa 12' },
        } as const

        const first = await patchReceiver(world, {
          idempotencyKey: 'quem-recebeu-1',
          patch: { ...neighbor, receiverName: 'Maria de Sousa' },
        })
        const replay = await patchReceiver(world, {
          idempotencyKey: 'quem-recebeu-1',
          patch: { receivedBy: { receivedBy: 'doorman', receivedByDetail: null } },
        })

        expect(first.changed).toBe(true)
        expect(replay).toEqual({ changed: false, id: first.id })
        expect(await readProofRows(database, world.company.companyId)).toEqual([
          {
            channel: 'office',
            kind: 'cargo',
            receivedBy: null,
            receivedByDetail: null,
            receiverName: '',
          },
          {
            channel: 'driver_app',
            kind: 'photo',
            receivedBy: 'neighbor',
            receivedByDetail: 'casa 12',
            receiverName: 'Maria de Sousa',
          },
        ])
        const reports = await database.db
          .select({ id: tripFieldReports.id })
          .from(tripFieldReports)
          .where(eq(tripFieldReports.idempotencyKey, 'quem-recebeu-1'))
        expect(reports).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'sem foto do motorista responde 404, e o canhoto do escritório fica intocado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedDeliveredByDriver(database, 'optional')
        const [, , , , , , proofRoute] = wireRoutes(database)
        await proofRoute!.execute({
          context: fakeContext(world.company),
          correlationId: 'integration-received-by-office-proof',
          pathParameters: { id: world.trip.tripId, documentId: world.trip.documentId },
          request: multipartRequest({
            fields: { receiverName: 'Ana Paula' },
            file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
            idempotencyKey: 'office-proof-before-patch',
          }),
        })

        await expect(
          patchReceiver(world, {
            idempotencyKey: 'quem-recebeu-sem-foto',
            patch: { receivedBy: { receivedBy: 'neighbor', receivedByDetail: null } },
          }),
        ).rejects.toMatchObject({ code: 'TRIP_DELIVERY_PROOF_NOT_FOUND', status: 404 })
        expect(await readProofRows(database, world.company.companyId)).toEqual([
          {
            channel: 'office',
            kind: 'photo',
            receivedBy: null,
            receivedByDetail: null,
            receiverName: 'Ana Paula',
          },
        ])
      })
    },
  )
})
