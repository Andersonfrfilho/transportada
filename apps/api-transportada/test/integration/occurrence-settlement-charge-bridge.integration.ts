/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T17 (CA9c/RF25), contra Postgres real: a ponte acerto → cobrança
 * (`DrizzleOccurrenceSettlementChargeRepository`) grava a linha de `delivery_charges` na mesma
 * transação de quem chama, regrava enquanto `recorded`, recusa a partir de `submitted` sem mudar o
 * valor, e desfaz a transação inteira quando a nota não resolve cliente/contratante.
 */
import { describe, expect } from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { deliveryCharges } from '../../src/database/delivery-client.schema.js'
import { companyOccurrenceTypes, tripDocuments } from '../../src/database/trip.schema.js'
import {
  contractors,
  deliveryClients,
  nfeAddresses,
  nfeParticipants,
} from '../../src/database/database.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleOccurrenceSettlementChargeRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement-charge.repository.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DeliveryChargeTransitionNotAllowedError } from '../../src/delivery-clients/application/delivery-charges.use-case.js'
import { OccurrenceChargePartiesUnresolvedError } from '../../src/trips/domain/trip.error.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'
import type {
  Company,
  SeededTrip,
  TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const CLIENT_TAX_ID = '98765432000109'
const CONTRACTOR_TAX_ID = '30290856000160'

async function bindDeliveryParties(database: TestDatabase, company: Company, trip: SeededTrip) {
  const [tripDocument] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
    .limit(1)
  if (tripDocument === undefined || tripDocument.nfeDocumentId === null) {
    throw new Error('EXPECTED_TRIP_DOCUMENT')
  }

  const deliveryClientId = crypto.randomUUID()
  const contractorId = crypto.randomUUID()
  await database.db.insert(deliveryClients).values({
    companyId: company.companyId,
    displayName: 'Loja Central',
    id: deliveryClientId,
    taxId: CLIENT_TAX_ID,
  })
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Spani Atacadista',
    id: contractorId,
    taxId: CONTRACTOR_TAX_ID,
  })

  for (const [role, taxId] of [
    ['emitter', CONTRACTOR_TAX_ID],
    ['recipient', CLIENT_TAX_ID],
  ] as const) {
    const participantId = crypto.randomUUID()
    await database.db.insert(nfeParticipants).values({
      companyId: company.companyId,
      documentId: tripDocument.nfeDocumentId,
      id: participantId,
      legalName: role,
      role,
      taxId,
    })
    await database.db.insert(nfeAddresses).values({
      city: 'Sertaozinho',
      cityCode: '3551702',
      companyId: company.companyId,
      number: '100',
      participantId,
      postalCode: '14160000',
      state: 'SP',
      street: 'Rua da Entrega',
    })
  }

  return { contractorId, deliveryClientId }
}

async function seedOccurrenceType(database: TestDatabase, company: Company): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id,
    name: 'Avaria',
    notifies: false,
    redeliveryPolicy: 'unset',
    stage: 'separation',
  })
  return id
}

async function registerOccurrence(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
  occurrenceTypeId: string,
): Promise<string> {
  const registered = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      note: 'avaria total',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'unset',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Avaria',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
  return registered.id
}

describe('DrizzleOccurrenceSettlementChargeRepository (spec 164 T17)', () => {
  testWithPostgres(
    'grava, regrava enquanto recorded, e recusa a partir de submitted sem mudar o valor',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const { contractorId, deliveryClientId } = await bindDeliveryParties(
          database,
          company,
          trip,
        )
        const occurrenceTypeId = await seedOccurrenceType(database, company)
        const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)

        const chargeRepository = new DrizzleDeliveryChargeRepository(database.db)
        const bridge = new DrizzleOccurrenceSettlementChargeRepository(
          chargeRepository.findChargeParties.bind(chargeRepository),
        )

        const inserted = await database.db.transaction((transaction) =>
          bridge.applyOccurrenceSettlementCharge({
            actorUserId: company.userId,
            amount: '250.0000',
            companyId: company.companyId,
            occurrenceId,
            transaction,
          }),
        )
        expect(inserted.status).toBe('recorded')

        const [firstRow] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.id, inserted.id))
          .limit(1)
        if (firstRow === undefined) throw new Error('EXPECTED_CHARGE_ROW')
        expect(firstRow.chargeType).toBe('returned_goods')
        expect(firstRow.origin).toBe('occurrence')
        expect(firstRow.occurrenceId).toBe(occurrenceId)
        expect(firstRow.deliveryClientId).toBe(deliveryClientId)
        expect(firstRow.contractorId).toBe(contractorId)
        expect(firstRow.amount).toBe('250.0000')

        // Regravar o acerto atualiza a MESMA linha enquanto `recorded` — nunca duplica.
        const updated = await database.db.transaction((transaction) =>
          bridge.applyOccurrenceSettlementCharge({
            actorUserId: company.userId,
            amount: '310.5000',
            companyId: company.companyId,
            occurrenceId,
            transaction,
          }),
        )
        expect(updated.id).toBe(inserted.id)
        expect(updated.status).toBe('recorded')

        const countRows = await database.db
          .select({ id: deliveryCharges.id })
          .from(deliveryCharges)
          .where(
            and(
              eq(deliveryCharges.companyId, company.companyId),
              eq(deliveryCharges.occurrenceId, occurrenceId),
            ),
          )
        expect(countRows.length).toBe(1)

        const [secondRow] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.id, inserted.id))
          .limit(1)
        if (secondRow === undefined) throw new Error('EXPECTED_CHARGE_ROW')
        expect(secondRow.amount).toBe('310.5000')

        // A linha avançou para `submitted` — o valor já foi ao contratante, e fica imutável.
        await database.db
          .update(deliveryCharges)
          .set({ status: 'submitted' })
          .where(eq(deliveryCharges.id, inserted.id))

        let thrown: unknown
        try {
          await database.db.transaction((transaction) =>
            bridge.applyOccurrenceSettlementCharge({
              actorUserId: company.userId,
              amount: '999.0000',
              companyId: company.companyId,
              occurrenceId,
              transaction,
            }),
          )
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(DeliveryChargeTransitionNotAllowedError)

        const [thirdRow] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.id, inserted.id))
          .limit(1)
        if (thirdRow === undefined) throw new Error('EXPECTED_CHARGE_ROW')
        expect(thirdRow.status).toBe('submitted')
        expect(thirdRow.amount).toBe('310.5000')
      })
    },
  )

  testWithPostgres(
    'nota sem cliente de entrega resolvido desfaz a transação inteira (422 DELIVERY_CLIENT_NOT_RESOLVED)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        // ⚠️ Sem `bindDeliveryParties`: a nota não resolve `nfeParticipants`/`deliveryClients`.
        const occurrenceTypeId = await seedOccurrenceType(database, company)
        const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)

        const chargeRepository = new DrizzleDeliveryChargeRepository(database.db)
        const bridge = new DrizzleOccurrenceSettlementChargeRepository(
          chargeRepository.findChargeParties.bind(chargeRepository),
        )

        let thrown: unknown
        try {
          await database.db.transaction((transaction) =>
            bridge.applyOccurrenceSettlementCharge({
              actorUserId: company.userId,
              amount: '80.0000',
              companyId: company.companyId,
              occurrenceId,
              transaction,
            }),
          )
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(OccurrenceChargePartiesUnresolvedError)

        const rows = await database.db
          .select({ id: deliveryCharges.id })
          .from(deliveryCharges)
          .where(eq(deliveryCharges.companyId, company.companyId))
        expect(rows.length).toBe(0)
      })
    },
  )
})
