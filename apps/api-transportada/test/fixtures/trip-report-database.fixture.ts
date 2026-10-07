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
  readonly emitterTaxId?: string
  readonly number?: string
  readonly recipientName?: string
  readonly series?: string
  readonly state?: string
  readonly totalValue?: string
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
      ...(seed.number === undefined ? {} : { number: seed.number }),
      ...(seed.series === undefined ? {} : { series: seed.series }),
      ...(seed.totalValue === undefined ? {} : { totalValue: seed.totalValue }),
    })
    .where(eq(nfeDocuments.id, nfeDocumentId))
  if (seed.emitterTaxId !== undefined) {
    await database.db.insert(nfeParticipants).values({
      companyId,
      documentId: nfeDocumentId,
      legalName: 'Emitente',
      role: 'emitter',
      taxId: seed.emitterTaxId,
    })
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
    phone: RECIPIENT_PHONE,
    state: seed.state ?? 'SP',
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
  const ruleId = crypto.randomUUID()
  const versionId = crypto.randomUUID()
  const calculationId = crypto.randomUUID()
  const tripDocumentId = crypto.randomUUID()
  const common = { companyId: company.companyId, createdByUserId: company.userId }

  await database.db.insert(freightRules).values({
    ...common,
    currentVersion: 1n,
    id: ruleId,
    name: 'Frete do relatorio',
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
