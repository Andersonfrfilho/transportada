/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T3.3 (CA02, CA03, RF5, RF6), contra Postgres real: o que o app mostra é o que o servidor cobra.
 * O mesmo tipo, no mesmo mundo, aparece com exigências diferentes em duas notas (destinatários distintos,
 * mesmo contratante) — no **snapshot** (`GET /me/trips/current`) e no **registro**. Para cada nota e
 * cada campo que o snapshot diz `required`, o registro sem aquele campo é recusado com o erro estável
 * do campo e o registro com todos os exigidos grava: a paridade é conferida pelo comportamento, não
 * por uma segunda cópia da regra.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { contractors, deliveryClients } from '../../src/database/delivery-client.schema.js'
import { fleetDrivers } from '../../src/database/fleet.schema.js'
import { nfeParticipants } from '../../src/database/nfe.schema.js'
import {
  companyOccurrenceTypeContractorOverrides,
  companyOccurrenceTypeRecipientOverrides,
  companyOccurrenceTypes,
  tripDocuments,
} from '../../src/database/trip.schema.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import type { FieldOccurrenceType } from '../../src/trips/application/list-field-occurrence-types.use-case.js'
import {
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrenceSignatureRequiredError,
} from '../../src/trips/domain/trip.error.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import {
  registerStreetOccurrence,
  seedConfirmedUpload,
} from '../fixtures/street-occurrence-registration.fixture.js'
import {
  linkDriverMembership,
  seedCompany,
  seedExtraDocument,
  seedTrip,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const EMITTER_TAX_ID = '30290856000160'
const FIRST_RECIPIENT_TAX_ID = '12345678000190'
const SECOND_RECIPIENT_TAX_ID = '98765432000110'
const NOW = new Date('2026-09-17T12:00:00.000Z')

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type Mode = 'off' | 'optional' | 'required'
type World = {
  readonly company: Company
  readonly contractorId: string
  readonly firstDocument: string
  readonly membershipId: string
  readonly secondDocument: string
  readonly trip: SeededTrip
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (reason: unknown) => reason,
  )
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
      role: 'emitter',
      taxId: EMITTER_TAX_ID,
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

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'in_transit')
  await linkDriverMembership(database, company, company.firstDriverId)
  const [driver] = await database.db
    .select({ membershipId: fleetDrivers.membershipId })
    .from(fleetDrivers)
    .where(eq(fleetDrivers.id, company.firstDriverId))
  if (driver?.membershipId === null || driver === undefined) throw new Error('Driver not linked')

  const secondDocument = await seedExtraDocument(database, company, trip, {
    separationStatus: 'loaded',
    stopId: trip.stopId,
  })
  const contractorId = crypto.randomUUID()
  await database.db
    .insert(contractors)
    .values({ companyId: company.companyId, id: contractorId, taxId: EMITTER_TAX_ID })
  for (const taxId of [FIRST_RECIPIENT_TAX_ID, SECOND_RECIPIENT_TAX_ID]) {
    await database.db.insert(deliveryClients).values({ companyId: company.companyId, taxId })
  }
  await seedParticipants(database, {
    company,
    documentId: trip.documentId,
    recipientTaxId: FIRST_RECIPIENT_TAX_ID,
  })
  await seedParticipants(database, {
    company,
    documentId: secondDocument,
    recipientTaxId: SECOND_RECIPIENT_TAX_ID,
  })
  return {
    company,
    contractorId,
    firstDocument: trip.documentId,
    membershipId: driver.membershipId,
    secondDocument,
    trip,
  }
}

async function seedType(
  database: TestDatabase,
  input: { company: Company; name: string; photo: Mode; note: Mode; signature: Mode },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    attachmentMode: input.photo,
    companyId: input.company.companyId,
    id,
    name: input.name,
    noteMode: input.note,
    signatureMode: input.signature,
    stage: 'delivery',
  })
  return id
}

/** O que o app mostra para a nota: o tipo resolvido dentro do snapshot. */
async function readSnapshotType(
  database: TestDatabase,
  input: { documentId: string; typeId: string; world: World },
): Promise<FieldOccurrenceType> {
  const snapshot = await findCurrentDriverTrip({
    companyId: input.world.company.companyId,
    membershipId: input.world.membershipId,
    now: NOW,
    repository: new DrizzleCurrentDriverTripRepository(database.db),
    scores: new DrizzleDriverScoreRepository(database.db),
  })
  const documents = snapshot.trips.flatMap((trip) => trip.stops.flatMap((stop) => stop.documents))
  const type = documents
    .find((document) => document.id === input.documentId)
    ?.occurrenceTypes?.find((entry) => entry.id === input.typeId)
  if (type === undefined) throw new Error('O tipo não chegou no snapshot da nota')
  return type
}

/**
 * A paridade: cada campo `required` do snapshot é cobrado pelo registro (erro estável do campo, com
 * todos os outros exigidos presentes), e o registro com exatamente os exigidos grava.
 */
async function expectRegistrationMatchesSnapshot(
  database: TestDatabase,
  input: { documentId: string; shown: FieldOccurrenceType; world: World },
): Promise<void> {
  const { shown, world } = input
  const scope = { company: world.company, trip: world.trip }
  const photo = await seedConfirmedUpload(database, scope)
  const signature = await seedConfirmedUpload(database, scope)
  const full = {
    note: shown.noteMode === 'required' ? 'cliente recusou' : '',
    photo: shown.photoMode === 'required',
    signature: shown.signatureMode === 'required',
  }
  const register = (given: typeof full) =>
    registerStreetOccurrence(database, {
      ...scope,
      attachmentObjectId: given.photo ? photo : null,
      documentId: input.documentId,
      note: given.note,
      signatureObjectId: given.signature ? signature : null,
      typeId: shown.id,
    })

  if (full.photo) {
    expect(await rejection(register({ ...full, photo: false }))).toBeInstanceOf(
      TripOccurrenceAttachmentRequiredError,
    )
  }
  if (full.note !== '') {
    expect(await rejection(register({ ...full, note: '' }))).toBeInstanceOf(
      TripOccurrenceNoteRequiredError,
    )
  }
  if (full.signature) {
    expect(await rejection(register({ ...full, signature: false }))).toBeInstanceOf(
      TripOccurrenceSignatureRequiredError,
    )
  }
  expect((await register(full)).id).toBeString()
}

function summarize(type: FieldOccurrenceType): Record<string, Mode> {
  return { note: type.noteMode, photo: type.photoMode, signature: type.signatureMode }
}

describe('o que o app mostra é o que o servidor cobra (spec 246 T3.3, CA02, CA03)', () => {
  testWithPostgres(
    'mesmo tipo, required numa nota e optional noutra: snapshot e registro dizem o mesmo (CA02)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          name: 'Recusa total',
          note: 'optional',
          photo: 'optional',
          signature: 'off',
        })
        await database.db.insert(companyOccurrenceTypeRecipientOverrides).values({
          attachmentMode: 'required',
          companyId: world.company.companyId,
          occurrenceTypeId: typeId,
          signatureMode: 'required',
          taxId: FIRST_RECIPIENT_TAX_ID,
        })

        const first = await readSnapshotType(database, {
          documentId: world.firstDocument,
          typeId,
          world,
        })
        const second = await readSnapshotType(database, {
          documentId: world.secondDocument,
          typeId,
          world,
        })
        expect(summarize(first)).toEqual({
          note: 'optional',
          photo: 'required',
          signature: 'required',
        })
        expect(summarize(second)).toEqual({ note: 'optional', photo: 'optional', signature: 'off' })

        await expectRegistrationMatchesSnapshot(database, {
          documentId: world.firstDocument,
          shown: first,
          world,
        })
        await expectRegistrationMatchesSnapshot(database, {
          documentId: world.secondDocument,
          shown: second,
          world,
        })
      })
    },
    90_000,
  )

  testWithPostgres(
    'destinatário vence contratante vence tipo, campo a campo, nos dois lados (CA03)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const typeId = await seedType(database, {
          company: world.company,
          name: 'Avaria',
          note: 'required',
          photo: 'required',
          signature: 'optional',
        })
        await database.db.insert(companyOccurrenceTypeContractorOverrides).values({
          attachmentMode: 'optional',
          companyId: world.company.companyId,
          contractorId: world.contractorId,
          noteMode: 'optional',
          occurrenceTypeId: typeId,
        })
        await database.db.insert(companyOccurrenceTypeRecipientOverrides).values({
          attachmentMode: 'required',
          companyId: world.company.companyId,
          occurrenceTypeId: typeId,
          taxId: SECOND_RECIPIENT_TAX_ID,
        })

        const first = await readSnapshotType(database, {
          documentId: world.firstDocument,
          typeId,
          world,
        })
        const second = await readSnapshotType(database, {
          documentId: world.secondDocument,
          typeId,
          world,
        })
        // Contratante afrouxa foto e observação; o destinatário da nota 2 endurece só a foto, e a
        // observação (nula nele) herda a do contratante, não a do tipo.
        expect(summarize(first)).toEqual({
          note: 'optional',
          photo: 'optional',
          signature: 'optional',
        })
        expect(summarize(second)).toEqual({
          note: 'optional',
          photo: 'required',
          signature: 'optional',
        })

        await expectRegistrationMatchesSnapshot(database, {
          documentId: world.firstDocument,
          shown: first,
          world,
        })
        await expectRegistrationMatchesSnapshot(database, {
          documentId: world.secondDocument,
          shown: second,
          world,
        })
      })
    },
    90_000,
  )
})
