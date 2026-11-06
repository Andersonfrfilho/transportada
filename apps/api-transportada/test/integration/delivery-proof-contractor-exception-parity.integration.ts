/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 (RF-C3) contra Postgres real: a exceção por contratante do comprovante vale para a
 * **tripulação** em todos os caminhos — o snapshot do app (`GET /me/trips/current`) e a escrita
 * (`resolveProofFieldSettings`: comprovante do app, baixa e preparação do WhatsApp do motorista,
 * quem recebeu depois do envio). Antes, a escrita lia só a geral e a do destinatário: o app pedia
 * "só o canhoto" e o bot perguntava canhoto opcional, "quem recebeu" e nome, sem nada falhar.
 *
 * O escritório e o atendente do WhatsApp (spec 294 RF18/RF19) leem a mesma exceção — o que ela
 * desliga não é pedido a ninguém — e o afrouxamento deles continua por cima: nunca são barrados.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingContractorOverrides,
  deliveryProofSettingOverrides,
} from '../../src/database/company-delivery-proof-settings.schema.js'
import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { fleetDrivers } from '../../src/database/fleet.schema.js'
import { nfeParticipants } from '../../src/database/nfe.schema.js'
import { tripDocuments } from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import type { DeliveryProofFieldSettings } from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import {
  fakeContext,
  JPEG_BYTES,
  linkDriverMembership,
  multipartRequest,
  seedCompany,
  seedDispatchSnapshot,
  seedExtraDocument,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  wireRoutes,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const CONTRACTOR_TAX_ID = '30290856000160'
const PLAIN_RECIPIENT_TAX_ID = '12345678000190'
const OVERRIDDEN_RECIPIENT_TAX_ID = '98765432000110'
const NOW = new Date('2026-09-18T12:00:00.000Z')

/** A geral da empresa: tudo opcional. */
const GENERAL: DeliveryProofFieldSettings = {
  cargo: 'optional',
  cargoMinimumCount: 1,
  photo: 'optional',
  receivedBy: 'optional',
  receiverDocument: 'optional',
  receiverName: 'optional',
  signature: 'optional',
}
/** A exceção da contratante (o caso COMERCIAL ZARAGOZA): só o canhoto, obrigatório; o resto desligado. */
const ONLY_CANHOTO: DeliveryProofFieldSettings = {
  cargo: 'off',
  cargoMinimumCount: 1,
  photo: 'required',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
}
/** A exceção do destinatário, que vence a da contratante quando as duas se aplicam. */
const RECIPIENT_OVERRIDE: DeliveryProofFieldSettings = {
  ...GENERAL,
  photo: 'off',
  signature: 'required',
}

type World = {
  readonly company: Company
  readonly contractorId: string
  readonly membershipId: string
  readonly overriddenDocument: string
  readonly trip: SeededTrip
}

async function seedParticipants(
  database: TestDatabase,
  input: { company: Company; documentId: string; recipientTaxId: string },
): Promise<void> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, input.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  await database.db.insert(nfeParticipants).values([
    {
      companyId: input.company.companyId,
      documentId: row.nfeDocumentId,
      legalName: 'Comercial Zaragoza',
      role: 'emitter',
      taxId: CONTRACTOR_TAX_ID,
    },
    {
      companyId: input.company.companyId,
      documentId: row.nfeDocumentId,
      legalName: 'Destinatário',
      role: 'recipient',
      taxId: input.recipientTaxId,
    },
  ])
}

async function seedWorld(
  database: TestDatabase,
  contractorSettings: DeliveryProofFieldSettings,
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await linkDriverMembership(database, company, company.firstDriverId)
  const [driver] = await database.db
    .select({ membershipId: fleetDrivers.membershipId })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.id, company.firstDriverId))
  if (driver?.membershipId === null || driver === undefined) throw new Error('Driver not linked')

  const overriddenDocument = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId: trip.stopId,
  })
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: CONTRACTOR_TAX_ID })
  await seedParticipants(database, {
    company,
    documentId: trip.documentId,
    recipientTaxId: PLAIN_RECIPIENT_TAX_ID,
  })
  await seedParticipants(database, {
    company,
    documentId: overriddenDocument,
    recipientTaxId: OVERRIDDEN_RECIPIENT_TAX_ID,
  })

  await database.db
    .insert(companyDeliveryProofSettings)
    .values({ companyId: company.companyId, ...GENERAL })
  await database.db
    .insert(deliveryProofSettingContractorOverrides)
    .values({ companyId: company.companyId, contractorId, ...contractorSettings })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: OVERRIDDEN_RECIPIENT_TAX_ID })
  await database.db.insert(deliveryProofSettingOverrides).values({
    companyId: company.companyId,
    taxId: OVERRIDDEN_RECIPIENT_TAX_ID,
    ...RECIPIENT_OVERRIDE,
  })

  return { company, contractorId, membershipId: driver.membershipId, overriddenDocument, trip }
}

/** O que o app do motorista mostra para a nota. */
async function readSnapshotSettings(
  database: TestDatabase,
  input: { documentId: string; world: World },
): Promise<DeliveryProofFieldSettings> {
  const snapshot = await findCurrentDriverTrip({
    companyId: input.world.company.companyId,
    membershipId: input.world.membershipId,
    now: NOW,
    repository: new DrizzleCurrentDriverTripRepository(database.db),
    scores: new DrizzleDriverScoreRepository(database.db),
  })
  const document = snapshot.trips
    .flatMap((trip) => trip.stops.flatMap((stop) => stop.documents))
    .find((entry) => entry.id === input.documentId)
  if (document === undefined) throw new Error('A nota não chegou no snapshot')
  return document.deliveryProof
}

describe('a exceção da contratante vale em todo caminho da tripulação (spec 218 RF-C3)', () => {
  testWithPostgres(
    'snapshot do app e escrita da tripulação resolvem a mesma exceção; o destinatário ainda vence',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, ONLY_CANHOTO)
        const proofs = new DrizzleDeliveryProofRepository(database.db, 'test-bucket')
        const companyId = world.company.companyId

        for (const [documentId, expected] of [
          [world.trip.documentId, ONLY_CANHOTO],
          [world.overriddenDocument, RECIPIENT_OVERRIDE],
        ] as const) {
          const shown = await readSnapshotSettings(database, { documentId, world })
          const enforced = await proofs.resolveProofFieldSettings({ companyId, documentId })
          expect({ documentId, shown }).toEqual({ documentId, shown: expected })
          expect({ documentId, enforced }).toEqual({ documentId, enforced: shown })
        }
      })
    },
  )

  testWithPostgres(
    'o escritório lê a mesma exceção e nunca é barrado: baixa sem canhoto e com canhoto sem nome passam',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, ONLY_CANHOTO)
        await seedDispatchSnapshot(
          database,
          world.company,
          world.trip,
          new Date('2026-09-17T08:00:00.000Z'),
        )
        await seedStopArrival(database, world.trip, new Date('2026-09-18T08:30:00.000Z'))
        const [, , , , deliverRoute] = wireRoutes(database)
        const deliver = (input: { documentId: string; key: string; withPhoto: boolean }) =>
          deliverRoute!.execute({
            context: fakeContext(world.company),
            correlationId: input.key,
            pathParameters: { documentId: input.documentId, id: world.trip.tripId },
            request: multipartRequest({
              fields: { deliveredAt: '2026-09-18T09:00:00.000Z' },
              ...(input.withPhoto ? { file: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' } } : {}),
              idempotencyKey: input.key,
            }),
          })

        const withoutPhoto = await deliver({
          documentId: world.trip.documentId,
          key: 'contractor-exception-office-no-photo',
          withPhoto: false,
        })
        expect(withoutPhoto.status).toBe(201)
        // A exceção é lida: o canhoto que ela exige vira pendência, nunca recusa.
        const pending = (await withoutPhoto.json()) as { data: { proofPending: boolean } }
        expect(pending.data.proofPending).toBe(true)

        const secondDocument = await seedExtraDocument(database, world.company, world.trip, {
          separationStatus: 'loaded',
          stopId: world.trip.stopId,
        })
        await seedParticipants(database, {
          company: world.company,
          documentId: secondDocument,
          recipientTaxId: PLAIN_RECIPIENT_TAX_ID,
        })
        const withPhoto = await deliver({
          documentId: secondDocument,
          key: 'contractor-exception-office-photo',
          withPhoto: true,
        })
        expect(withPhoto.status).toBe(201)
      })
    },
  )
})
