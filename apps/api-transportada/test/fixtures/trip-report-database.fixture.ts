/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Semente do relatório de viagens: dá à nota que `seedTrip`/`seedExtraDocument` criam o emitente, o
 * destinatário com endereço e o contratante que a consulta junta.
 */
import { eq } from 'drizzle-orm'

import {
  contractors,
  freightCalculations,
  freightRules,
  freightRuleVersions,
  cteBatches,
  cteBatchItemDocuments,
  cteBatchItems,
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  tripDocuments,
} from '../../src/database/database.schema.js'
import {
  seedNfeDocument,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from './trip-field-office-database.fixture.js'

export type ReportDocumentSeed = {
  readonly city?: string
  readonly emitterAddress?: ReportAddressSeed
  readonly emitterLegalName?: string
  readonly emitterTaxId?: string
  readonly fiscalStatus?: 'authorized' | 'cancelled' | 'denied'
  readonly issuedAt?: Date
  readonly number?: string
  readonly recipientAddress?: ReportAddressSeed
  readonly recipientName?: string
  readonly series?: string
  readonly state?: string
  readonly totalValue?: string
}

export type ReportAddressSeed = {
  readonly city?: string
  readonly district?: string
  readonly number?: string
  readonly state?: string
  readonly street?: string
}

const RECIPIENT_PHONE = '11999990000'

export async function seedContractor(
  database: TestDatabase,
  input: { readonly companyId: string; readonly displayName: string; readonly taxId: string },
): Promise<string> {
  const id = crypto.randomUUID()
  await database.db.insert(contractors).values({ ...input, id })
  return id
}

async function resolveNfeDocumentId(
  database: TestDatabase,
  tripDocumentId: string,
): Promise<string> {
  const [row] = await database.db
    .select({ nfeDocumentId: tripDocuments.nfeDocumentId })
    .from(tripDocuments)
    .where(eq(tripDocuments.id, tripDocumentId))
  if (row?.nfeDocumentId == null) throw new Error('The seeded trip document has no direct note')
  return row.nfeDocumentId
}

export async function decorateReportDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly nfeDocumentId: string
    readonly seed: ReportDocumentSeed
  },
): Promise<void> {
  const { companyId, nfeDocumentId, seed } = input
  await database.db
    .update(nfeDocuments)
    .set({
      ...(seed.number === undefined
        ? {}
        : { accessKey: `${'9'.repeat(32)}${seed.number.padStart(12, '0')}`, number: seed.number }),
      ...(seed.series === undefined ? {} : { series: seed.series }),
      ...(seed.issuedAt === undefined ? {} : { issuedAt: seed.issuedAt }),
      ...(seed.fiscalStatus === undefined ? {} : { status: seed.fiscalStatus }),
      ...(seed.totalValue === undefined ? {} : { totalValue: seed.totalValue }),
    })
    .where(eq(nfeDocuments.id, nfeDocumentId))
  if (seed.emitterTaxId !== undefined) {
    const emitterId = crypto.randomUUID()
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId: nfeDocumentId,
      id: emitterId,
      legalName: seed.emitterLegalName ?? 'Emitente',
      role: 'emitter',
      taxId: seed.emitterTaxId,
      tradeName: 'Fantasia Comum',
    })
    if (seed.emitterAddress !== undefined) {
      await database.db
        .insert(nfeAddresses)
        .values({ ...seed.emitterAddress, companyId, participantId: emitterId })
    }
  }
  const recipientId = crypto.randomUUID()
  await database.db.insert(nfeParticipants).values({
    companyId,
    documentId: nfeDocumentId,
    id: recipientId,
    legalName: seed.recipientName ?? 'Destinatario',
    role: 'recipient',
    taxId: '99887766000155',
  })
  await database.db.insert(nfeAddresses).values({
    city: seed.city ?? 'Campinas',
    companyId,
    participantId: recipientId,
    district: seed.recipientAddress?.district ?? null,
    number: seed.recipientAddress?.number ?? null,
    phone: RECIPIENT_PHONE,
    state: seed.state ?? 'SP',
    street: seed.recipientAddress?.street ?? null,
  })
}

export async function decorateTripDocument(
  database: TestDatabase,
  input: {
    readonly companyId: string
    readonly seed: ReportDocumentSeed
    readonly tripDocumentId: string
  },
): Promise<string> {
  const nfeDocumentId = await resolveNfeDocumentId(database, input.tripDocumentId)
  await decorateReportDocument(database, { ...input, nfeDocumentId })
  return nfeDocumentId
}

/** Cálculo de frete da nota: exigido pelo item do lote de CT-e e pela viagem que resolve a nota por frete. */
export async function seedFreightCalculation(
  database: TestDatabase,
  input: { readonly company: Company; readonly nfeDocumentId: string },
): Promise<string> {
  const { company, nfeDocumentId } = input
  const ruleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const calculationId = crypto.randomUUID()
  const common = { companyId: company.companyId, createdByUserId: company.userId }

  await database.db.insert(freightRules).values({
    ...common,
    currentVersion: 1n,
    id: ruleId,
    name: `Frete do relatorio ${ruleId}`,
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    ...common,
    filters: {},
    freightRuleId: ruleId,
    id: versionId,
    percentage: '0.035000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    ...common,
    adjustments: [],
    baseAmount: '10000.0000',
    calculatedAmount: '350.0000',
    calculationDetails: {},
    correlationId: `correlation-${calculationId}`,
    freightRuleId: ruleId,
    freightRuleVersionId: versionId,
    id: calculationId,
    idempotencyKey: `freight-${calculationId}`,
    nfeDocumentId,
    percentage: '0.035000',
    requestFingerprint: `fingerprint-${calculationId}`,
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '350.0000',
  })
  return calculationId
}

/** A nota chega à viagem só pelo cálculo de frete: `nfe_document_id` nulo e `freight_calculation_id` preenchido. */
export async function seedFreightLinkedDocument(
  database: TestDatabase,
  input: {
    readonly company: Company
    readonly seed: ReportDocumentSeed
    readonly trip: SeededTrip
  },
): Promise<{ readonly nfeDocumentId: string; readonly tripDocumentId: string }> {
  const { company, trip } = input
  const nfeDocumentId = await seedNfeDocument(database, company)
  const calculationId = await seedFreightCalculation(database, { company, nfeDocumentId })
  const tripDocumentId = crypto.randomUUID()
  await database.db.insert(tripDocuments).values({
    companyId: company.companyId,
    freightCalculationId: calculationId,
    id: tripDocumentId,
    separationStatus: 'loaded',
    tripId: trip.tripId,
  })
  await decorateReportDocument(database, { ...input, companyId: company.companyId, nfeDocumentId })
  return { nfeDocumentId, tripDocumentId }
}

/** Vincula a nota a um lote de CT-e no status dado, pelo mesmo caminho de tabelas que a consulta do relatório percorre. */
export async function seedCteBatchLink(
  database: TestDatabase,
  input: {
    readonly batchStatus: 'cancelled' | 'done' | 'draft'
    readonly company: Company
    readonly nfeDocumentId: string
  },
): Promise<void> {
  const { batchStatus, company, nfeDocumentId } = input
  const batchId = crypto.randomUUID()
  const itemId = crypto.randomUUID()
  const common = { batchId, companyId: company.companyId }
  await database.db.insert(cteBatches).values({
    companyId: company.companyId,
    correlationId: `correlation-${batchId}`,
    id: batchId,
    idempotencyFingerprint: `fingerprint-${batchId}`,
    idempotencyKey: `batch-${batchId}`,
    name: `Lote ${batchId}`,
    operatorUserId: company.userId,
    status: batchStatus,
  })
  await database.db.insert(cteBatchItems).values({
    ...common,
    calculationSnapshot: {},
    freightCalculationId: await seedFreightCalculation(database, { company, nfeDocumentId }),
    id: itemId,
    nfeDocumentId,
    position: 1n,
  })
  await database.db
    .insert(cteBatchItemDocuments)
    .values({ ...common, itemId, nfeDocumentId, position: 1n })
}
