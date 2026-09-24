/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T27 (CA9c/CA9d) contra Postgres real: a prova do dinheiro ponta a ponta — acerto por item
 * → cobrança em `delivery_charges` → lote do período pela seleção (`chargeIds`) → demonstrativo em
 * PDF — sobre as **mesmas** linhas, num fluxo só. Três coisas que só o banco prova:
 *
 * 1. a cobrança **nasce e converge**: regravar o mesmo acerto não duplica a linha de
 *    `delivery_charges` (mesmo id, valor atualizado);
 * 2. regravar sobre uma linha já `submitted` é recusada com 409
 *    `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED`, e o valor não muda;
 * 3. gerar o demonstrativo **não escreve nada** em `billing_*`, `cte_*`, `nfse_*` nem
 *    `fiscal_sequences` — provado por contagem lida antes e depois do fluxo inteiro, nunca por
 *    ausência de erro.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { deliveryCharges } from '../../src/database/delivery-client.schema.js'
import {
  companyOccurrenceTypes,
  tripDocuments,
  tripOccurrenceCases,
} from '../../src/database/trip.schema.js'
import {
  contractors,
  deliveryClients,
  nfeAddresses,
  nfeParticipants,
} from '../../src/database/database.schema.js'
import { createExtraChargeBatchesUseCase } from '../../src/delivery-clients/application/extra-charge-batches.use-case.js'
import { createOccurrenceStatementUseCase } from '../../src/delivery-clients/application/occurrence-statement.use-case.js'
import type { OccurrenceStatementArchivePort } from '../../src/delivery-clients/application/occurrence-statement.port.js'
import { DrizzleDeliveryChargeRepository } from '../../src/delivery-clients/infrastructure/drizzle-delivery-charge.repository.js'
import { DrizzleExtraChargeBatchRepository } from '../../src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.js'
import { DrizzleOccurrenceStatementRepository } from '../../src/delivery-clients/infrastructure/drizzle-occurrence-statement.repository.js'
import { createOccurrenceStatementPdfGateway } from '../../src/delivery-clients/infrastructure/occurrence-statement-pdf.gateway.js'
import { DeliveryChargeTransitionNotAllowedError } from '../../src/delivery-clients/application/delivery-charges.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { TRIP_OCCURRENCE_STAGE } from '../../src/shared/trip-occurrence.constant.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleOccurrenceSettlementChargeRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement-charge.repository.js'
import { DrizzleOccurrenceSettlementRepository } from '../../src/trips/infrastructure/drizzle-occurrence-settlement.repository.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
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

/** Lista do Risco 6 do `plan.md`: o demonstrativo não é documento fiscal, e nada aqui pode tocá-las. */
const FISCAL_TABLES = [
  'billing_invoices',
  'billing_invoice_items',
  'billing_invoice_documents',
  'cte_fiscal_documents',
  'cte_issuance_attempts',
  'nfse_service_invoices',
  'fiscal_sequences',
  'fiscal_sequence_reservations',
] as const

async function bindDeliveryParties(
  database: TestDatabase,
  company: Company,
  trip: SeededTrip,
): Promise<{ readonly contractorId: string; readonly deliveryClientId: string }> {
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
    /** A mesma data cai dentro do período fechado abaixo (`2026-09-01`..`2026-09-30`). */
    now: () => new Date('2026-09-22T12:00:00.000Z'),
    storage: fakeAttachmentStorage([]),
    unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(database.db, 'test-bucket'),
  })
  if (registered === null) throw new Error('EXPECTED_OCCURRENCE')
  return registered.id
}

/** Abre a tratativa direto em `decided`/`goods_paid` — a máquina de transição é escopo de outra task. */
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

function createSettlementRepository(database: TestDatabase): DrizzleOccurrenceSettlementRepository {
  const chargeRepository = new DrizzleDeliveryChargeRepository(database.db)
  const bridge = new DrizzleOccurrenceSettlementChargeRepository(
    chargeRepository.findChargeParties.bind(chargeRepository),
  )
  return new DrizzleOccurrenceSettlementRepository(database.db, bridge)
}

function createBatchUseCase(database: TestDatabase) {
  const statements = createOccurrenceStatementUseCase({
    archive: buildArchive(),
    clock: () => new Date('2026-10-01T09:00:00.000Z'),
    createObjectId: () => crypto.randomUUID(),
    renderer: createOccurrenceStatementPdfGateway(),
    repository: new DrizzleOccurrenceStatementRepository(database.db),
    sha256: () => 'a'.repeat(64),
  })
  const batches = createExtraChargeBatchesUseCase({
    batches: new DrizzleExtraChargeBatchRepository(database.db),
    charges: new DrizzleDeliveryChargeRepository(database.db),
    createToken: () => 'token-opaco-de-trinta-e-dois-bytes-ou-mais',
    statement: { generate: (input) => statements.generate(input) },
  })
  return { batches, statements }
}

function buildArchive(): OccurrenceStatementArchivePort {
  const stored = new Map<string, Uint8Array>()
  return {
    async loadObject(location) {
      return stored.get(location.objectKey) ?? new Uint8Array([1, 2, 3, 4])
    },
    async put(document) {
      const objectKey = `statements/${document.batchId}/${document.objectId}.pdf`
      stored.set(objectKey, document.bytes)
      return { bucket: 'integration', objectKey, provider: 'object-storage' }
    },
  }
}

async function countFiscalRows(database: TestDatabase): Promise<Readonly<Record<string, number>>> {
  const counts: Record<string, number> = {}
  for (const table of FISCAL_TABLES) {
    const rows = (await database.db.execute(
      `select count(*)::int as total from "${table}"`,
    )) as unknown as ReadonlyArray<{ readonly total: number }>
    counts[table] = rows[0]?.total ?? 0
  }
  return counts
}

describe('a prova do dinheiro ponta a ponta contra Postgres (spec 164 T27)', () => {
  testWithPostgres(
    'acerto → cobrança nasce e converge → lote por seleção → demonstrativo, sem tocar em nada fiscal',
    async () => {
      await withDisposableDatabase(async (database) => {
        const company = await seedCompany(database)
        const trip = await seedTrip(database, company, 'in_transit')
        const { contractorId } = await bindDeliveryParties(database, company, trip)
        const occurrenceTypeId = await seedOccurrenceType(database, company)
        const occurrenceId = await registerOccurrence(database, company, trip, occurrenceTypeId)
        const caseId = await seedDecidedCase(database, company, occurrenceId)
        const settlements = createSettlementRepository(database)
        const context = { companyId: company.companyId, userId: company.userId } as CompanyContext

        const fiscalBefore = await countFiscalRows(database)

        /** 1) O acerto grava o item e a cobrança nasce `recorded`, com origem e tipo corretos. */
        const first = await settlements.recordSettlement({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          items: [
            {
              amount: '250.0000',
              amountSource: 'nfe',
              payerId: company.firstDriverId,
              payerKind: 'driver',
              productCode: '',
            },
          ],
        })
        expect(first.total).toBe('250.0000')

        const [chargeAfterFirst] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.occurrenceId, occurrenceId))
          .limit(1)
        if (chargeAfterFirst === undefined) throw new Error('EXPECTED_CHARGE_ROW')
        expect(chargeAfterFirst.chargeType).toBe('returned_goods')
        expect(chargeAfterFirst.origin).toBe('occurrence')
        expect(chargeAfterFirst.status).toBe('recorded')
        expect(chargeAfterFirst.amount).toBe('250.0000')
        const chargeId = chargeAfterFirst.id

        /** 2) Regravar o mesmo acerto converge: mesma linha, valor atualizado, nunca uma segunda. */
        const second = await settlements.recordSettlement({
          actorUserId: company.userId,
          caseId,
          companyId: company.companyId,
          items: [
            {
              amount: '310.5000',
              amountSource: 'nfe',
              payerId: company.firstDriverId,
              payerKind: 'driver',
              productCode: '',
            },
          ],
        })
        expect(second.total).toBe('310.5000')

        const chargeRowsByOccurrence = await database.db
          .select({ id: deliveryCharges.id })
          .from(deliveryCharges)
          .where(eq(deliveryCharges.occurrenceId, occurrenceId))
        expect(chargeRowsByOccurrence.length).toBe(1)
        expect(chargeRowsByOccurrence[0]?.id).toBe(chargeId)

        const [chargeAfterSecond] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.id, chargeId))
          .limit(1)
        expect(chargeAfterSecond?.amount).toBe('310.5000')

        /** 3) O lote fecha pela seleção explícita (`chargeIds`), sobre a mesma linha. */
        const { batches, statements } = createBatchUseCase(database)
        const batch = await batches.close({
          chargeIds: [chargeId],
          context,
          contractorId,
          periodEnd: '2026-09-30',
          periodStart: '2026-09-01',
        })
        expect(batch.totalAmount).toBe('310.5000')

        const [chargeAfterBatch] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.id, chargeId))
          .limit(1)
        expect(chargeAfterBatch?.status).toBe('submitted')
        expect(chargeAfterBatch?.batchId).toBe(batch.id)

        /** 4) O demonstrativo já foi gerado no fechamento e serve o mesmo PDF na leitura — mesmo
         * caso de uso, mesmo arquivo de memória do arquivo (`statements`), nunca um segundo par. */
        const document = await statements.read({ batchId: batch.id, context })
        expect(document.contentType).toBe('application/pdf')
        expect(Buffer.from(document.bytes).subarray(0, 5).toString('latin1')).toBe('%PDF-')

        /** 5) Regravar sobre a linha já `submitted` é recusado, e o valor não muda. */
        let thrown: unknown
        try {
          await settlements.recordSettlement({
            actorUserId: company.userId,
            caseId,
            companyId: company.companyId,
            items: [
              {
                amount: '999.0000',
                amountSource: 'manual',
                payerKind: 'contractor',
                productCode: '',
              },
            ],
          })
        } catch (error) {
          thrown = error
        }
        expect(thrown).toBeInstanceOf(DeliveryChargeTransitionNotAllowedError)

        const [chargeAfterRejectedRewrite] = await database.db
          .select()
          .from(deliveryCharges)
          .where(eq(deliveryCharges.id, chargeId))
          .limit(1)
        expect(chargeAfterRejectedRewrite?.amount).toBe('310.5000')
        expect(chargeAfterRejectedRewrite?.status).toBe('submitted')

        /** 6) Nada, em nenhum passo do fluxo, tocou tabela fiscal alguma. */
        const fiscalAfter = await countFiscalRows(database)
        expect(fiscalAfter).toEqual(fiscalBefore)
      })
    },
  )
})
