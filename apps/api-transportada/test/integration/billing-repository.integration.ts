/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createBillingUseCase } from '../../src/billing/application/billing.use-case'
import { DrizzleBillingRepository } from '../../src/billing/infrastructure/drizzle-billing.repository'
import { createIdempotencyFingerprintService } from '../../src/companies/application/idempotency-fingerprint.service'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  fiscalSequenceReservations,
  fiscalSequences,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  identityUsers,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { ApiError } from '../../src/shared/api.error'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test
const HMAC_KEY = Uint8Array.from({ length: 32 }, (_value, index) => index + 41)
const NOW = '2026-07-23T15:00:00.000Z'
// A criação concorrente perde na reserva ou na leitura de elegibilidade, conforme a vencedora
// tenha commitado depois ou antes dessa leitura. Ambas negam a segunda fatura com 409.
const CONCURRENT_BILLING_CONFLICT_CODES: readonly string[] = [
  'BILLING_CTE_ALREADY_INVOICED',
  'BILLING_CTE_NOT_ELIGIBLE',
]

describe('billing repository integration', () => {
  testWithPostgres(
    'serializes billing, replays idempotency, isolates eligibility, and preserves cancellation',
    async () => {
      await withDisposableDatabase(async (database) => {
        const userId = crypto.randomUUID()
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        await seedBillingGraph(database, {
          companyId,
          customerDocument: '12345678000190',
          suffix: '1',
          userId,
        })
        await seedBillingGraph(database, {
          companyId: otherCompanyId,
          customerDocument: '98765432000199',
          suffix: '2',
          userId,
        })

        const repository = new DrizzleBillingRepository(database.db)
        const useCase = createBillingUseCase({
          clock: { now: () => NOW },
          fingerprintService: createIdempotencyFingerprintService({ key: HMAC_KEY }),
          unitOfWork: repository,
        })
        const context = { companyId, userId }
        const otherContext = { companyId: otherCompanyId, userId }
        const eligible = await useCase.listEligible({ context, filters: {}, limit: 20 })
        const otherEligible = await useCase.listEligible({
          context: otherContext,
          filters: {},
          limit: 20,
        })

        expect(eligible).toHaveLength(1)
        expect(otherEligible).toHaveLength(1)
        expect(eligible[0]?.['companyId']).toBe(companyId)
        expect(otherEligible[0]?.['companyId']).toBe(otherCompanyId)
        expect(JSON.stringify(eligible)).not.toContain('xml')
        // O nome do lote sai do lote da própria empresa, nunca do lote homônimo do outro tenant.
        expect(eligible[0]?.['batchName']).toBe('Lote 1')
        expect(otherEligible[0]?.['batchName']).toBe('Lote 2')

        const batchId = requiredResultString(eligible[0], 'batchId')
        const otherBatchId = requiredResultString(otherEligible[0], 'batchId')
        // Os dois tenants têm o mesmo nome de cliente e números de CT-e vizinhos: os filtros de
        // lista e de nome só podem devolver a linha da empresa autenticada.
        const filtered = await useCase.listEligible({
          context,
          filters: {
            batchIdIn: [batchId, otherBatchId],
            cteNumberIn: ['1', '2'],
            customerName: 'Cliente',
          },
          limit: 20,
        })

        expect(filtered).toHaveLength(1)
        expect(filtered[0]?.['companyId']).toBe(companyId)
        expect(filtered[0]?.['batchId']).toBe(batchId)
        expect(
          await useCase.listEligible({
            context,
            filters: { batchIdIn: [otherBatchId] },
            limit: 20,
          }),
        ).toEqual([])
        expect(
          await useCase.listEligible({
            context,
            filters: { customerName: 'Cliente 2' },
            limit: 20,
          }),
        ).toEqual([])

        // O CT-e foi autorizado às 20:00 do dia 22; escolher 22/07 como fim do período tem de
        // incluí-lo, e o dia anterior continua excluindo.
        const authorizationDay = '2026-07-22'
        const sameDay = await useCase.listEligible({
          context,
          filters: { from: authorizationDay, to: authorizationDay },
          limit: 20,
        })
        expect(sameDay).toHaveLength(1)
        expect(sameDay[0]?.['companyId']).toBe(companyId)
        expect(
          await useCase.listEligible({
            context,
            filters: { to: '2026-07-21' },
            limit: 20,
          }),
        ).toEqual([])

        const cteDocumentId = requiredResultString(eligible[0], 'id')
        const otherCteDocumentId = requiredResultString(otherEligible[0], 'id')
        const preview = await useCase.preview({
          context,
          cteDocumentIds: [cteDocumentId, otherCteDocumentId],
        })

        expect(preview.blocked).toEqual([{ cteId: otherCteDocumentId, reason: 'not_found' }])
        expect(preview.groups).toHaveLength(1)
        expect(preview.groups[0]).toMatchObject({
          cteCount: 1,
          cteIds: [cteDocumentId],
          customerDocument: '12345678000190',
        })
        expect(JSON.stringify(preview)).not.toContain('98765432000199')

        const createInput = {
          context,
          correlationId: crypto.randomUUID(),
          cteDocumentIds: [cteDocumentId],
          dueDate: '2026-08-07T00:00:00.000Z',
        } as const
        const attempts = await Promise.allSettled([
          useCase.create({ ...createInput, idempotencyKey: 'billing-concurrent-a' }),
          useCase.create({ ...createInput, idempotencyKey: 'billing-concurrent-b' }),
        ])
        const fulfilled = attempts.filter(
          (result): result is PromiseFulfilledResult<Record<string, unknown>> =>
            result.status === 'fulfilled',
        )
        const rejected = attempts.filter(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        )

        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect(rejected[0]?.reason).toBeInstanceOf(ApiError)
        expect(rejected[0]?.reason).toMatchObject({ status: 409 })
        expect(CONCURRENT_BILLING_CONFLICT_CODES).toContain((rejected[0]?.reason as ApiError).code)
        expect(await useCase.listEligible({ context, filters: {}, limit: 20 })).toEqual([])
        expect(await useCase.preview({ context, cteDocumentIds: [cteDocumentId] })).toEqual({
          blocked: [{ cteId: cteDocumentId, reason: 'already_invoiced' }],
          groups: [],
        })

        const winnerIndex = attempts.findIndex((result) => result.status === 'fulfilled')
        const winningIdempotencyKey =
          winnerIndex === 0 ? 'billing-concurrent-a' : 'billing-concurrent-b'
        const invoice = fulfilled[0]?.value
        if (invoice === undefined) throw new Error('EXPECTED_FULFILLED_BILLING_RESULT')
        const replay = await useCase.create({
          ...createInput,
          idempotencyKey: winningIdempotencyKey,
        })
        expect(replay).toEqual(invoice)

        await expect(
          useCase.create({
            ...createInput,
            dueDate: '2026-08-08T00:00:00.000Z',
            idempotencyKey: winningIdempotencyKey,
          }),
        ).rejects.toMatchObject({
          code: 'IDEMPOTENCY_KEY_REUSED',
          status: 409,
        })

        const invoiceId = requiredResultString(invoice, 'id')
        // O detalhe lista os CT-es cobertos; a chave do tenant vizinho nunca pode aparecer.
        const detail = await useCase.get({ context, invoiceId })
        const detailItems = detail['items']
        expect(detail['itemCount']).toBe(1)
        expect(detailItems).toMatchObject([{ accessKey: `1${'0'.repeat(43)}`, cteNumber: '1' }])
        expect(JSON.stringify(detailItems)).not.toContain(`2${'0'.repeat(43)}`)
        await expect(useCase.get({ context: otherContext, invoiceId })).rejects.toMatchObject({
          code: 'BILLING_INVOICE_NOT_FOUND',
          status: 404,
        })

        // A edição é escrita sob o companyId autenticado: o tenant vizinho não altera a linha.
        await expect(
          useCase.update({
            context: otherContext,
            correlationId: crypto.randomUUID(),
            invoiceId,
            observations: 'Edicao de outro tenant',
          }),
        ).rejects.toMatchObject({ code: 'BILLING_INVOICE_NOT_FOUND', status: 404 })
        expect((await useCase.get({ context, invoiceId }))['observations']).toBe('')

        expect(detail['subtotalAmount']).toBe('350.00')
        const edited = await useCase.update({
          context,
          correlationId: crypto.randomUUID(),
          discountAmount: '10.00',
          invoiceId,
          observations: 'Ajuste comercial acordado',
          surchargeAmount: '2.50',
        })
        expect(edited).toMatchObject({
          discountAmount: '10.00',
          observations: 'Ajuste comercial acordado',
          subtotalAmount: '350.00',
          surchargeAmount: '2.50',
          totalAmount: '342.50',
        })
        expect(await useCase.get({ context, invoiceId })).toEqual(edited)

        // A listagem alimenta a coluna "CT-es" e as observações da tela; a contagem é por tenant.
        const listed = await useCase.list({ context, cursor: null, filters: {}, limit: 20 })
        expect(listed.items).toHaveLength(1)
        expect(listed.items[0]).toMatchObject({
          id: invoiceId,
          itemCount: 1,
          observations: 'Ajuste comercial acordado',
        })
        expect(listed.items[0]?.['items']).toBeUndefined()
        expect(
          (await useCase.list({ context: otherContext, cursor: null, filters: {}, limit: 20 }))
            .items,
        ).toEqual([])
        await expect(
          useCase.update({
            context,
            correlationId: crypto.randomUUID(),
            discountAmount: '350.01',
            invoiceId,
          }),
        ).rejects.toMatchObject({
          code: 'BILLING_INVOICE_DISCOUNT_EXCEEDS_SUBTOTAL',
          status: 422,
        })

        const cancelled = await useCase.cancel({
          context,
          correlationId: crypto.randomUUID(),
          invoiceId,
          reason: 'Duplicidade operacional',
        })
        expect(cancelled['status']).toBe('cancelled')
        await expect(
          useCase.cancel({
            context,
            correlationId: crypto.randomUUID(),
            invoiceId,
            reason: 'Duplicidade operacional',
          }),
        ).resolves.toEqual(cancelled)
        await expect(
          useCase.update({
            context,
            correlationId: crypto.randomUUID(),
            observations: 'Edicao apos cancelamento',
            invoiceId,
          }),
        ).rejects.toMatchObject({ code: 'BILLING_INVOICE_INVALID_STATE', status: 409 })
        expect(await useCase.listEligible({ context, filters: {}, limit: 20 })).toEqual([])
      })
    },
    30_000,
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedBillingGraph(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly customerDocument: string
    readonly suffix: string
    readonly userId: string
  },
): Promise<void> {
  const ids = {
    attempt: crypto.randomUUID(),
    batch: crypto.randomUUID(),
    batchItem: crypto.randomUUID(),
    cteDocument: crypto.randomUUID(),
    cteXmlObject: crypto.randomUUID(),
    freightCalculation: crypto.randomUUID(),
    freightRule: crypto.randomUUID(),
    freightRuleVersion: crypto.randomUUID(),
    fiscalReservation: crypto.randomUUID(),
    fiscalSequence: crypto.randomUUID(),
    import: crypto.randomUUID(),
    membership: crypto.randomUUID(),
    nfeDocument: crypto.randomUUID(),
    nfeXmlObject: crypto.randomUUID(),
  }
  const sha = input.suffix.repeat(64)
  const accessKey = `${input.suffix}${'0'.repeat(43)}`

  await database.db.insert(companies).values({ id: input.companyId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId: input.companyId,
    id: ids.membership,
    status: 'active',
    userId: input.userId,
  })
  await database.db.insert(storedObjects).values([
    {
      bucket: 'integration',
      companyId: input.companyId,
      id: ids.nfeXmlObject,
      mimeType: 'application/xml',
      objectKey: `nfe/${input.suffix}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
    {
      bucket: 'integration',
      companyId: input.companyId,
      id: ids.cteXmlObject,
      mimeType: 'application/xml',
      objectKey: `cte/${input.suffix}.xml`,
      provider: 's3',
      purpose: 'nfe_document',
      sha256: sha,
      sizeBytes: 100n,
      status: 'final',
    },
  ])
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-import-${input.suffix}`,
    id: ids.import,
    idempotencyKey: `import-${input.suffix}`,
    requestFingerprint: `fingerprint-import-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'1'.repeat(43)}`,
    authorizationProtocol: `protocol-nfe-${input.suffix}`,
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: ids.nfeDocument,
    importId: ids.import,
    issuedAt: new Date('2026-07-22T12:00:00.000Z'),
    model: '55',
    number: input.suffix,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '10000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '10000.0000',
    xmlObjectId: ids.nfeXmlObject,
    xmlSha256: sha,
  })
  await database.db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId: ids.nfeDocument,
    legalName: `Cliente ${input.suffix} Ltda`,
    role: 'recipient',
    taxId: input.customerDocument,
  })
  await database.db.insert(freightRules).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: ids.freightRule,
    name: `Frete ${input.suffix}`,
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId: input.companyId,
    createdByUserId: input.userId,
    filters: {},
    freightRuleId: ids.freightRule,
    id: ids.freightRuleVersion,
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '10000.0000',
    calculatedAmount: '350.0000',
    calculationDetails: {},
    companyId: input.companyId,
    correlationId: `correlation-freight-${input.suffix}`,
    createdByUserId: input.userId,
    freightRuleId: ids.freightRule,
    freightRuleVersionId: ids.freightRuleVersion,
    id: ids.freightCalculation,
    idempotencyKey: `freight-${input.suffix}`,
    nfeDocumentId: ids.nfeDocument,
    percentage: '0.035000',
    requestFingerprint: `fingerprint-freight-${input.suffix}`,
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '350.0000',
  })
  await database.db.insert(cteBatches).values({
    companyId: input.companyId,
    correlationId: `correlation-batch-${input.suffix}`,
    id: ids.batch,
    idempotencyFingerprint: `fingerprint-batch-${input.suffix}`,
    idempotencyKey: `batch-${input.suffix}`,
    name: `Lote ${input.suffix}`,
    operatorUserId: input.userId,
    status: 'done',
    version: 1n,
  })
  await database.db.insert(cteBatchItems).values({
    batchId: ids.batch,
    calculationSnapshot: { totalAmount: '350.0000' },
    companyId: input.companyId,
    freightCalculationId: ids.freightCalculation,
    id: ids.batchItem,
    nfeDocumentId: ids.nfeDocument,
    position: 1n,
  })
  await database.db.insert(fiscalSequences).values({
    companyId: input.companyId,
    environment: 'homologation',
    id: ids.fiscalSequence,
    lastReservedNumber: 1n,
    model: 'cte',
    nextNumber: 2n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId: input.companyId,
    fiscalSequenceId: ids.fiscalSequence,
    id: ids.fiscalReservation,
    number: 1n,
    reservationKey: `reservation-${input.suffix}`,
  })
  await database.db.insert(cteIssuanceAttempts).values({
    attemptKind: 'issue',
    attemptNumber: 1n,
    batchId: ids.batch,
    batchItemId: ids.batchItem,
    companyId: input.companyId,
    correlationId: `correlation-cte-${input.suffix}`,
    fiscalEnvironment: 'homologation',
    fiscalNumber: BigInt(input.suffix),
    fiscalSeries: '1',
    id: ids.attempt,
    idempotencyFingerprint: `fingerprint-cte-${input.suffix}`,
    idempotencyKey: `cte-${input.suffix}`,
    requestFingerprint: `request-cte-${input.suffix}`,
    reservationId: ids.fiscalReservation,
    status: 'authorized',
  })
  await database.db.insert(cteFiscalDocuments).values({
    accessKey,
    attemptId: ids.attempt,
    authorizationProtocol: `protocol-cte-${input.suffix}`,
    authorizedAt: new Date('2026-07-22T20:00:00.000Z'),
    batchItemId: ids.batchItem,
    companyId: input.companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber: BigInt(input.suffix),
    fiscalSeries: '1',
    id: ids.cteDocument,
    status: 'authorized',
    xmlObjectId: ids.cteXmlObject,
    xmlSha256: sha,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t005_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}

function requiredResultString(record: unknown, field: string): string {
  if (typeof record !== 'object' || record === null) throw new Error('EXPECTED_RECORD')
  const value = Reflect.get(record, field)
  if (typeof value !== 'string' || value.length === 0) throw new Error('EXPECTED_STRING')
  return value
}
