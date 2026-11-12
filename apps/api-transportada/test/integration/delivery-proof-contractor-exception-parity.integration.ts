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
import { and, eq, inArray } from 'drizzle-orm'

import {
  companyDeliveryProofSettings,
  deliveryProofSettingContractorOverrides,
  deliveryProofSettingOverrides,
} from '../../src/database/company-delivery-proof-settings.schema.js'
import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { fleetDrivers } from '../../src/database/fleet.schema.js'
import { nfeParticipants } from '../../src/database/nfe.schema.js'
import { tripDocuments, trips, tripStopEvents } from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import {
  isProofRequiredBySettings,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import {
  loadProofPendingDocumentIds,
  tripHasProofPendingDocumentCondition,
} from '../../src/trips/infrastructure/proof-pending.query.js'
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

/**
 * Spec 218 RF-C3, todos os leitores: para cada camada que decide (geral, contratante, destinatário),
 * a tela do motorista (`deliveryProof` e `pendingProofs`), a escrita (`resolveProofFieldSettings`), a
 * pendência do detalhe (`loadProofPendingDocumentIds`), o filtro da lista
 * (`tripHasProofPendingDocumentCondition`) e a nota do motorista (`DrizzleDriverScoreRepository`)
 * concordam. Leitor novo entra aqui e no contrato `settings-readers-contractor`.
 */
const OTHER_EMITTER_TAX_ID = '11444777000161'
const SCENARIO_NOW = new Date('2026-09-20T12:00:00.000Z')
const DELIVERED_AT = new Date(SCENARIO_NOW.getTime() - 30 * 60 * 60 * 1000)
const SETTING_LAYERS = ['general', 'contractor', 'recipient'] as const
type SettingLayer = (typeof SETTING_LAYERS)[number]
type Scenario = Readonly<Record<SettingLayer, DeliveryProofFieldSettings>>

const QUIET: DeliveryProofFieldSettings = { ...ONLY_CANHOTO, photo: 'off' }
const CANHOTO_REQUIRED: DeliveryProofFieldSettings = { ...QUIET, photo: 'required' }
const CANHOTO_OPTIONAL: DeliveryProofFieldSettings = { ...QUIET, photo: 'optional' }
const SCENARIOS: readonly (Scenario & { readonly name: string })[] = [
  {
    contractor: CANHOTO_REQUIRED,
    general: CANHOTO_OPTIONAL,
    name: 'contratante exige o que a geral não exige',
    recipient: QUIET,
  },
  {
    contractor: QUIET,
    general: CANHOTO_REQUIRED,
    name: 'contratante dispensa o que a geral exige',
    recipient: CANHOTO_REQUIRED,
  },
]

/** Nota entregue pelo app do motorista há 30 h, sem foto, cada uma na sua viagem. */
async function seedDeliveredNote(
  database: TestDatabase,
  input: { company: Company; emitterTaxId: string; recipientTaxId: string },
): Promise<SeededTrip> {
  const trip = await seedTrip(database, input.company, 'in_transit')
  await database.db
    .update(tripDocuments)
    .set({ deliveredAt: DELIVERED_AT, separationStatus: 'delivered' })
    .where(eq(tripDocuments.id, trip.documentId))
  await database.db.insert(tripStopEvents).values({
    actorUserId: input.company.userId,
    channel: 'driver_app',
    companyId: input.company.companyId,
    createdAt: DELIVERED_AT,
    kind: 'delivered',
    recordedAt: DELIVERED_AT,
    reportedByDriverId: input.company.firstDriverId,
    stopId: trip.stopId,
    tripDocumentId: trip.documentId,
  })
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
  if (row?.nfeDocumentId === null || row === undefined) throw new Error('Seeded document vanished')
  await database.db.insert(nfeParticipants).values([
    {
      companyId: input.company.companyId,
      documentId: row.nfeDocumentId,
      role: 'emitter',
      taxId: input.emitterTaxId,
    },
    {
      companyId: input.company.companyId,
      documentId: row.nfeDocumentId,
      role: 'recipient',
      taxId: input.recipientTaxId,
    },
  ])
  return trip
}

async function seedScenario(database: TestDatabase, scenario: Scenario) {
  const company = await seedCompany(database)
  await linkDriverMembership(database, company, company.firstDriverId)
  const [driver] = await database.db
    .select({ membershipId: fleetDrivers.membershipId })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.id, company.firstDriverId))
  if (driver?.membershipId === null || driver === undefined) throw new Error('Driver not linked')
  const { membershipId } = driver
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: CONTRACTOR_TAX_ID })
  await database.db
    .insert(deliveryClients)
    .values({ companyId: company.companyId, taxId: OVERRIDDEN_RECIPIENT_TAX_ID })
  // A nota do motorista só conta entrega depois da ativação (spec 159 D1): ativa antes da janela.
  await database.db.insert(companyDeliveryProofSettings).values({
    companyId: company.companyId,
    ...scenario.general,
    scoreEffectiveSince: new Date('2026-01-01T00:00:00.000Z'),
  })
  await database.db
    .insert(deliveryProofSettingContractorOverrides)
    .values({ companyId: company.companyId, contractorId, ...scenario.contractor })
  await database.db.insert(deliveryProofSettingOverrides).values({
    companyId: company.companyId,
    taxId: OVERRIDDEN_RECIPIENT_TAX_ID,
    ...scenario.recipient,
  })

  const notes: Record<SettingLayer, SeededTrip> = {
    contractor: await seedDeliveredNote(database, {
      company,
      emitterTaxId: CONTRACTOR_TAX_ID,
      recipientTaxId: PLAIN_RECIPIENT_TAX_ID,
    }),
    general: await seedDeliveredNote(database, {
      company,
      emitterTaxId: OTHER_EMITTER_TAX_ID,
      recipientTaxId: PLAIN_RECIPIENT_TAX_ID,
    }),
    recipient: await seedDeliveredNote(database, {
      company,
      emitterTaxId: CONTRACTOR_TAX_ID,
      recipientTaxId: OVERRIDDEN_RECIPIENT_TAX_ID,
    }),
  }
  return { company, membershipId, notes }
}

/** O que cada leitor diz de uma nota, na forma comparável entre todos. */
type ReaderVerdicts = {
  readonly enforced: DeliveryProofFieldSettings
  readonly inDriverPendingProofs: boolean
  readonly inPendingFilter: boolean
  readonly inPendingList: boolean
  readonly penalizedInScore: boolean
  readonly shown: DeliveryProofFieldSettings
}

async function readAllReaders(
  database: TestDatabase,
  world: Awaited<ReturnType<typeof seedScenario>>,
): Promise<Record<SettingLayer, ReaderVerdicts>> {
  const companyId = world.company.companyId
  const proofs = new DrizzleDeliveryProofRepository(database.db, 'test-bucket')
  const snapshot = await findCurrentDriverTrip({
    companyId,
    membershipId: world.membershipId,
    now: SCENARIO_NOW,
    repository: new DrizzleCurrentDriverTripRepository(database.db),
    scores: new DrizzleDriverScoreRepository(database.db),
  })
  const shownDocuments = snapshot.trips.flatMap((trip) =>
    trip.stops.flatMap((stop) => stop.documents),
  )
  const documentIds = SETTING_LAYERS.map((layer) => world.notes[layer].documentId)
  const pendingList = await loadProofPendingDocumentIds(database.db, {
    companyId,
    tripDocumentIds: documentIds,
  })
  const filteredTrips = await database.db
    .select({ id: trips.id })
    .from(trips)
    .where(and(eq(trips.companyId, companyId), tripHasProofPendingDocumentCondition()))
  const filteredTripIds = new Set(filteredTrips.map((row) => row.id))
  const penalties = await new DrizzleDriverScoreRepository(database.db).readPenalties({
    companyId,
    driverId: world.company.firstDriverId,
    now: SCENARIO_NOW,
  })
  const penalizedIds = new Set(penalties.penalties.map((penalty) => penalty.tripDocumentId))
  const pendingProofIds = new Set(snapshot.pendingProofs.map((proof) => proof.documentId))

  const entries = await Promise.all(
    SETTING_LAYERS.map(async (layer) => {
      const { documentId, tripId } = world.notes[layer]
      const shown = shownDocuments.find((document) => document.id === documentId)?.deliveryProof
      if (shown === undefined) throw new Error(`A nota ${layer} não chegou na tela do motorista`)
      const verdicts: ReaderVerdicts = {
        enforced: await proofs.resolveProofFieldSettings({ companyId, documentId }),
        inDriverPendingProofs: pendingProofIds.has(documentId),
        inPendingFilter: filteredTripIds.has(tripId),
        inPendingList: pendingList.has(documentId),
        penalizedInScore: penalizedIds.has(documentId),
        shown,
      }
      return [layer, verdicts] as const
    }),
  )
  return Object.fromEntries(entries) as Record<SettingLayer, ReaderVerdicts>
}

function expectedVerdicts(settings: DeliveryProofFieldSettings): ReaderVerdicts {
  const isRequired = isProofRequiredBySettings(settings)
  return {
    enforced: settings,
    inDriverPendingProofs: settings.photo === 'required',
    inPendingFilter: isRequired,
    inPendingList: isRequired,
    penalizedInScore: settings.photo === 'required',
    shown: settings,
  }
}

describe('todos os leitores concordam com as três camadas (spec 218 RF-C3)', () => {
  for (const scenario of SCENARIOS) {
    testWithPostgres(scenario.name, async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedScenario(database, scenario)
        const read = await readAllReaders(database, world)
        const expected = Object.fromEntries(
          SETTING_LAYERS.map((layer) => [layer, expectedVerdicts(scenario[layer])]),
        ) as Record<SettingLayer, ReaderVerdicts>
        expect(read).toEqual(expected)
        // Sanidade do pré-requisito: a filtragem por documento não esconde a nota da tela.
        expect(
          await database.db
            .select({ id: tripDocuments.id })
            .from(tripDocuments)
            .where(
              inArray(
                tripDocuments.id,
                SETTING_LAYERS.map((layer) => world.notes[layer].documentId),
              ),
            ),
        ).toHaveLength(SETTING_LAYERS.length)
      })
    })
  }
})
