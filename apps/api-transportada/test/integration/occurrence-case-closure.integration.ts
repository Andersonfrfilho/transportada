/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164, revisão final (B1/B3), contra Postgres real: o caminho principal do dinheiro fecha.
 * `decide` com `goods_paid` → acerto gravado → `closure` fechando de verdade. A prova da T27 insere
 * a tratativa já `decided` e nunca chega ao fechamento; esta percorre a máquina inteira pelos casos
 * de uso, e é a que falha enquanto `hasSettlementItems` é o literal `false` do chamador — o
 * fechamento respondia 422 `OCCURRENCE_CASE_SETTLEMENT_WITHOUT_ITEMS` para sempre, com o acerto
 * gravado ao lado.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { deliveryCharges } from '../../src/database/delivery-client.schema.js'
import { companyOccurrenceTypes, tripOccurrenceCases } from '../../src/database/trip.schema.js'
import {
  contractors,
  deliveryClients,
  nfeAddresses,
  nfeParticipants,
} from '../../src/database/database.schema.js'
import { tripDocuments } from '../../src/database/trip.schema.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleOccurrenceCaseRepository } from '../../src/trips/infrastructure/drizzle-occurrence-case.repository.js'
import { DrizzleOccurrenceSettlementRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement.repository.js'
import { DrizzleOccurrenceSettlementChargeRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement-charge.repository.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { createOccurrenceCaseUseCase } from '../../src/trips/application/occurrence-case.use-case.js'
import { OccurrenceCaseSettlementWithoutItemsError } from '../../src/trips/domain/trip.error.js'
import {
  fakeAttachmentStorage,
  fakeContext,
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

async function bindDeliveryParties(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<void> {
  const [tripDocument] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, trip.documentId))
    .limit(1)
  if (tripDocument === undefined || tripDocument.nfeDocumentId === null) {
    throw new Error('EXPECTED_TRIP_DOCUMENT')
  }

  await database.db.insert(deliveryClients).values({
    companyId: company.companyId,
    displayName: 'Loja Central',
    id: crypto.randomUUID(),
    taxId: CLIENT_TAX_ID,
  })
  await database.db.insert(contractors).values({
    companyId: company.companyId,
    displayName: 'Spani Atacadista',
    id: crypto.randomUUID(),
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
}

async function registerOccurrenceWithCase(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<{ readonly caseId: string; readonly occurrenceId: string }> {
  const occurrenceTypeId = crypto.randomUUID()
  await database.db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId: company.companyId,
    id: occurrenceTypeId,
    name: 'Avaria total',
    notifies: false,
    redeliveryPolicy: 'allowed',
    stage: 'separation',
  })

  const registered = await persistSeparationOccurrenceWithAttachment({
    attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
    input: {
      actorUserId: company.userId,
      companyId: company.companyId,
      documentId: trip.documentId,
      items: [],
      note: 'avaria total',
      occurrenceTypeId,
      productCode: '',
      productCodes: [],
      redeliveryPolicy: 'allowed',
      stage: TRIP_OCCURRENCE_STAGE.separation,
      tripId: trip.tripId,
      typeName: 'Avaria total',
    },
    newObjectId: () => crypto.randomUUID(),
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')

  const [openedCase] = await database.db
    .select({ id: tripOccurrenceCases.id })
    .from(tripOccurrenceCases)
    .where(eq(tripOccurrenceCases.occurrenceId, registered.id))
    .limit(1)
  if (openedCase === undefined) throw new Error('EXPECTED_OCCURRENCE_CASE')

  return { caseId: openedCase.id, occurrenceId: registered.id }
}

describe('fechamento da tratativa goods_paid (spec 164, revisão final B1)', () => {
  testWithPostgres(
    'goods_paid com acerto gravado fecha de verdade, e sem acerto recusa com 422',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await bindDeliveryParties(database, company, trip)
        const { caseId, occurrenceId } = await registerOccurrenceWithCase(database, company, trip)

        const chargeRepository = new DrizzleDeliveryChargeRepository(database.db)
        const settlements = new DrizzleOccurrenceSettlementRepository(
          database.db,
          new DrizzleOccurrenceSettlementChargeRepository(
            chargeRepository.findChargeParties.bind(chargeRepository),
          ),
        )
        const cases = new DrizzleOccurrenceCaseRepository(database.db)
        const useCase = createOccurrenceCaseUseCase({ repository: cases })
        const context = fakeContext(company).scope

        expect((await useCase.review({ caseId, context })).status).toBe('under_review')
        expect((await useCase.contractorSubmission({ caseId, context })).status).toBe(
          'awaiting_contractor',
        )
        expect(
          (
            await useCase.decide({
              caseId,
              context,
              kind: 'goods_paid',
              note: 'contratante aceitou pagar a mercadoria',
            })
          ).status,
        ).toBe('decided')

        /** Sem nenhum item acertado, fechar `goods_paid` continua sendo 422 — a regra é real. */
        let refused: unknown
        try {
          await useCase.closure({ caseId, context })
        } catch (error) {
          refused = error
        }
        expect(refused).toBeInstanceOf(OccurrenceCaseSettlementWithoutItemsError)

        const recorded = await settlements.recordSettlement({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          items: [
            {
              amount: '412.5000',
              amountSource: 'manual',
              payerKind: 'carrier',
              productCode: '',
            },
          ],
        })
        expect(recorded.total).toBe('412.5000')

        const closed = await useCase.closure({ caseId, context })
        expect(closed).toEqual({ kind: 'changed', status: 'closed' })

        const [finalCase] = await database.db
          .select({
            resolvedAt: tripOccurrenceCases.resolvedAt,
            status: tripOccurrenceCases.status,
          })
          .from(tripOccurrenceCases)
          .where(eq(tripOccurrenceCases.id, caseId))
          .limit(1)
        if (finalCase === undefined) throw new Error('EXPECTED_OCCURRENCE_CASE')
        expect(finalCase.status).toBe('closed')
        expect(finalCase.resolvedAt).not.toBeNull()

        const [charge] = await database.db
          .select({ amount: deliveryCharges.amount })
          .from(deliveryCharges)
          .where(eq(deliveryCharges.occurrenceId, occurrenceId))
          .limit(1)
        if (charge === undefined) throw new Error('EXPECTED_CHARGE_ROW')
        expect(charge.amount).toBe('412.5000')
      })
    },
  )
})
