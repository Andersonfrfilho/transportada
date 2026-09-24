/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T13/T18, contra Postgres real: `DrizzleOccurrenceSettlementRepository` — o acerto por
 * item substitui a lista inteira numa transação, liga a cobrança (T17) e o ressarcimento marca a
 * linha sem simular pagamento.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { deliveryCharges } from '../../src/database/delivery-client.schema.js'
import {
  companyOccurrenceTypes,
  tripDocuments,
  tripOccurrenceCases,
  tripOccurrenceItemSettlements,
} from '../../src/database/trip.schema.js'
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
import { DrizzleOccurrenceSettlementRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement.repository.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DeliveryChargeTransitionNotAllowedError } from '../../src/delivery-clients/application/delivery-charges.use-case.js'
import {
  OccurrenceCaseTransitionNotAllowedError,
  OccurrenceSettlementItemNotFoundError,
  OccurrenceSettlementItemUnknownError,
  OccurrenceSettlementNotReimbursableError,
} from '../../src/trips/domain/trip.error.js'
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

/** A ocorrência da nota inteira (`productCode: ''`) — o caso mais comum, e o item válido dela é `''`. */
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
      items: [],
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

/** Abre a tratativa direto em `decided`/`goods_paid` — a máquina de transição é escopo da T2/T4/T5/T9-T10. */
async function seedDecidedCase(
  database: TestDatabase,
  company: Company,
  occurrenceId: string,
): Promise<string> {
  const caseId = crypto.randomUUID()
  await database.db.insert(tripOccurrenceCases).values({
    companyId: company.companyId,
    decidedAt: new Date('2026-09-22T13:00:00.000Z'),
    decidedByUserId: company.userId,
    decisionKind: 'goods_paid',
    id: caseId,
    occurrenceId,
    redeliveryPolicy: 'blocked',
    status: 'decided',
  })
  return caseId
}

function createRepository(database: TestDatabase): DrizzleOccurrenceSettlementRepository {
  const chargeRepository = new DrizzleDeliveryChargeRepository(database.db)
  const bridge = new DrizzleOccurrenceSettlementChargeRepository(
    chargeRepository.findChargeParties.bind(chargeRepository),
  )
  return new DrizzleOccurrenceSettlementRepository(database.db, bridge)
}

describe('DrizzleOccurrenceSettlementRepository (spec 164 T13/T18)', () => {
  testWithPostgres('grava o acerto, liga a cobrança, e regravar substitui a lista', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      await bindDeliveryParties(database, company, trip)
      const occurrenceTypeId = await seedOccurrenceType(database, company)
      const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
      const caseId = await seedDecidedCase(database, company, occurrenceId)
      const repository = createRepository(database)

      const first = await repository.recordSettlement({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        items: [
          {
            amount: '150.5000',
            amountSource: 'nfe',
            payerId: company.firstDriverId,
            payerKind: 'driver',
            productCode: '',
          },
        ],
      })
      expect(first.total).toBe('150.5000')

      const [chargeRow] = await database.db
        .select()
        .from(deliveryCharges)
        .where(eq(deliveryCharges.occurrenceId, occurrenceId))
        .limit(1)
      if (chargeRow === undefined) throw new Error('EXPECTED_CHARGE_ROW')
      expect(chargeRow.amount).toBe('150.5000')
      expect(chargeRow.chargeType).toBe('returned_goods')
      expect(chargeRow.status).toBe('recorded')

      /** Regravar substitui — nunca acumula (`delete` + `insert`, mesma transação). */
      const second = await repository.recordSettlement({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        items: [
          {
            amount: '80.0000',
            amountSource: 'manual',
            payerKind: 'contractor',
            productCode: '',
          },
        ],
      })
      expect(second.total).toBe('80.0000')

      const settlementRows = await database.db
        .select()
        .from(tripOccurrenceItemSettlements)
        .where(eq(tripOccurrenceItemSettlements.caseId, caseId))
      expect(settlementRows.length).toBe(1)
      expect(settlementRows[0]?.amount).toBe('80.0000')
      expect(settlementRows[0]?.payerKind).toBe('contractor')
      expect(settlementRows[0]?.payerId).toBeNull()

      const [chargeRowAfter] = await database.db
        .select()
        .from(deliveryCharges)
        .where(eq(deliveryCharges.occurrenceId, occurrenceId))
        .limit(1)
      if (chargeRowAfter === undefined) throw new Error('EXPECTED_CHARGE_ROW')
      expect(chargeRowAfter.amount).toBe('80.0000')
    })
  })

  testWithPostgres(
    'item fora da ocorrência desfaz a transação inteira, sem gravar nada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await bindDeliveryParties(database, company, trip)
        const occurrenceTypeId = await seedOccurrenceType(database, company)
        const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
        const caseId = await seedDecidedCase(database, company, occurrenceId)
        const repository = createRepository(database)

        let thrown: unknown
        try {
          await repository.recordSettlement({
            actorUserId: company.userId,
            caseId,
            companyId: company.companyId,
            items: [
              {
                amount: '10.0000',
                amountSource: 'manual',
                payerKind: 'contractor',
                productCode: 'PRODUTO-FORA-DA-NOTA',
              },
            ],
          })
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(OccurrenceSettlementItemUnknownError)

        const settlementRows = await database.db
          .select()
          .from(tripOccurrenceItemSettlements)
          .where(eq(tripOccurrenceItemSettlements.caseId, caseId))
        expect(settlementRows.length).toBe(0)

        const chargeRows = await database.db
          .select({ id: deliveryCharges.id })
          .from(deliveryCharges)
          .where(eq(deliveryCharges.occurrenceId, occurrenceId))
        expect(chargeRows.length).toBe(0)
      })
    },
  )

  /**
   * Revisão final (B4): esvaziar a lista apagava os itens e deixava a cobrança viva, com o valor
   * antigo — elegível para fechar em lote e cobrar a contratante por um prejuízo sem nenhum item
   * que o sustente. E, com a cobrança já `submitted`, o `delete` passava mesmo assim, apagando a
   * evidência de uma cobrança já enviada.
   */
  testWithPostgres('lista vazia remove a cobrança na mesma transação', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      await bindDeliveryParties(database, company, trip)
      const occurrenceTypeId = await seedOccurrenceType(database, company)
      const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
      const caseId = await seedDecidedCase(database, company, occurrenceId)
      const repository = createRepository(database)

      await repository.recordSettlement({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        items: [
          { amount: '150.5000', amountSource: 'manual', payerKind: 'carrier', productCode: '' },
        ],
      })

      const emptied = await repository.recordSettlement({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        items: [],
      })
      expect(emptied.total).toBe('0.0000')

      const settlementRows = await database.db
        .select({ id: tripOccurrenceItemSettlements.id })
        .from(tripOccurrenceItemSettlements)
        .where(eq(tripOccurrenceItemSettlements.caseId, caseId))
      expect(settlementRows.length).toBe(0)

      const chargeRows = await database.db
        .select({ id: deliveryCharges.id })
        .from(deliveryCharges)
        .where(eq(deliveryCharges.occurrenceId, occurrenceId))
      expect(chargeRows.length).toBe(0)
    })
  })

  testWithPostgres('esvaziar o acerto de cobrança já submitted recusa com 409', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      await bindDeliveryParties(database, company, trip)
      const occurrenceTypeId = await seedOccurrenceType(database, company)
      const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
      const caseId = await seedDecidedCase(database, company, occurrenceId)
      const repository = createRepository(database)

      await repository.recordSettlement({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        items: [
          { amount: '150.5000', amountSource: 'manual', payerKind: 'carrier', productCode: '' },
        ],
      })
      await database.db
        .update(deliveryCharges)
        .set({ status: 'submitted' })
        .where(eq(deliveryCharges.occurrenceId, occurrenceId))

      let thrown: unknown
      try {
        await repository.recordSettlement({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          items: [],
        })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(DeliveryChargeTransitionNotAllowedError)

      /** A transação inteira desfez: o item continua ali, e a cobrança enviada também. */
      const settlementRows = await database.db
        .select({ id: tripOccurrenceItemSettlements.id })
        .from(tripOccurrenceItemSettlements)
        .where(eq(tripOccurrenceItemSettlements.caseId, caseId))
      expect(settlementRows.length).toBe(1)

      const [chargeRow] = await database.db
        .select({ amount: deliveryCharges.amount, status: deliveryCharges.status })
        .from(deliveryCharges)
        .where(eq(deliveryCharges.occurrenceId, occurrenceId))
        .limit(1)
      if (chargeRow === undefined) throw new Error('EXPECTED_CHARGE_ROW')
      expect(chargeRow.status).toBe('submitted')
      expect(chargeRow.amount).toBe('150.5000')
    })
  })

  testWithPostgres('tratativa fora de decided/goods_paid recusa com 409', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      await bindDeliveryParties(database, company, trip)
      const occurrenceTypeId = await seedOccurrenceType(database, company)
      const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
      const caseId = crypto.randomUUID()
      await database.db.insert(tripOccurrenceCases).values({
        companyId: company.companyId,
        id: caseId,
        occurrenceId,
        redeliveryPolicy: 'blocked',
        status: 'recorded',
      })
      const repository = createRepository(database)

      let thrown: unknown
      try {
        await repository.recordSettlement({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          items: [
            { amount: '10.0000', amountSource: 'manual', payerKind: 'contractor', productCode: '' },
          ],
        })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(OccurrenceCaseTransitionNotAllowedError)
    })
  })

  testWithPostgres(
    'ressarcimento marca a linha, é idempotente, e recusa payer_kind carrier',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        await bindDeliveryParties(database, company, trip)
        const occurrenceTypeId = await seedOccurrenceType(database, company)
        const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
        const caseId = await seedDecidedCase(database, company, occurrenceId)
        const repository = createRepository(database)

        await repository.recordSettlement({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          items: [
            {
              amount: '150.5000',
              amountSource: 'nfe',
              payerId: company.firstDriverId,
              payerKind: 'driver',
              productCode: '',
            },
          ],
        })

        const first = await repository.reimburseSettlementItem({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          productCode: '',
        })
        expect(first.kind).toBe('changed')

        const [row] = await database.db
          .select()
          .from(tripOccurrenceItemSettlements)
          .where(eq(tripOccurrenceItemSettlements.caseId, caseId))
          .limit(1)
        if (row === undefined) throw new Error('EXPECTED_SETTLEMENT_ROW')
        expect(row.reimbursedAt).not.toBeNull()
        expect(row.reimbursedByUserId).toBe(company.userId)

        /** Repetir converge — idempotente, não lança e não regrava a hora. */
        const second = await repository.reimburseSettlementItem({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          productCode: '',
        })
        expect(second.kind).toBe('unchanged')

        let thrown: unknown
        try {
          await repository.reimburseSettlementItem({
            actorUserId: company.userId,
            caseId,
            companyId: company.companyId,
            productCode: 'NUNCA-ACERTADO',
          })
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(OccurrenceSettlementItemNotFoundError)
      })
    },
  )

  testWithPostgres('payer_kind carrier recusa o ressarcimento com 422', async () => {
    await withDisposableDatabase(async (database) => {
      const company = await seedCompany(database)
      const trip = await seedTrip(database, company, 'in_transit')
      await bindDeliveryParties(database, company, trip)
      const occurrenceTypeId = await seedOccurrenceType(database, company)
      const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
      const caseId = await seedDecidedCase(database, company, occurrenceId)
      const repository = createRepository(database)

      await repository.recordSettlement({
        actorUserId: company.userId,
        caseId,
        companyId: company.companyId,
        items: [
          { amount: '40.0000', amountSource: 'manual', payerKind: 'carrier', productCode: '' },
        ],
      })

      let thrown: unknown
      try {
        await repository.reimburseSettlementItem({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          productCode: '',
        })
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(OccurrenceSettlementNotReimbursableError)

      const [row] = await database.db
        .select()
        .from(tripOccurrenceItemSettlements)
        .where(eq(tripOccurrenceItemSettlements.caseId, caseId))
        .limit(1)
      if (row === undefined) throw new Error('EXPECTED_SETTLEMENT_ROW')
      expect(row.reimbursedAt).toBeNull()
    })
  })
})
