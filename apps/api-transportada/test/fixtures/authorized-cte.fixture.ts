/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O menor encadeamento que o banco aceita para uma nota ter CT-e autorizado: regra de frete, cálculo,
 * lote, sequência fiscal, tentativa e o documento fiscal. Copiado do seed de
 * `trip-fiscal-readiness.integration.ts`, sem os encargos nem o perfil fiscal.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  fiscalSequenceReservations,
  fiscalSequences,
  freightCalculations,
  freightRuleVersions,
  freightRules,
  storedObjects,
} from '../../src/database/database.schema.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>

export async function seedAuthorizedCte(
  database: TestDatabase,
  input: { readonly companyId: string; readonly nfeDocumentId: string; readonly userId: string },
): Promise<void> {
  const { companyId, nfeDocumentId, userId } = input
  const suffix = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const freightCalculationId = crypto.randomUUID()
  const batchId = crypto.randomUUID()
  const batchItemId = crypto.randomUUID()
  const fiscalSequenceId = crypto.randomUUID()
  const reservationId = crypto.randomUUID()
  const attemptId = crypto.randomUUID()
  const cteXmlObjectId = crypto.randomUUID()
  const sha = '1'.repeat(64)

  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: cteXmlObjectId,
    mimeType: 'application/xml',
    objectKey: `cte/review-${suffix}.xml`,
    provider: 's3',
    purpose: 'cte_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(freightRules).values({
    companyId,
    createdByUserId: userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: `Frete ${suffix}`,
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: userId,
    filters: {},
    freightRuleId,
    id: freightRuleVersionId,
    percentage: '0.045000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(freightCalculations).values({
    adjustments: [],
    baseAmount: '1000.0000',
    calculatedAmount: '45.0000',
    calculationDetails: {},
    companyId,
    correlationId: `correlation-freight-${suffix}`,
    createdByUserId: userId,
    freightRuleId,
    freightRuleVersionId,
    id: freightCalculationId,
    idempotencyKey: `freight-${suffix}`,
    nfeDocumentId,
    percentage: '0.045000',
    requestFingerprint: `fingerprint-freight-${suffix}`,
    ruleSnapshot: {},
    ruleVersion: 1n,
    status: 'snapshotted',
    totalAmount: '45.0000',
  })
  await database.db.insert(cteBatches).values({
    companyId,
    correlationId: `correlation-batch-${suffix}`,
    id: batchId,
    idempotencyFingerprint: `fingerprint-batch-${suffix}`,
    idempotencyKey: `batch-${suffix}`,
    name: `Lote ${suffix}`,
    operatorUserId: userId,
    status: 'submitted',
    version: 1n,
  })
  await database.db.insert(fiscalSequences).values({
    companyId,
    environment: 'homologation',
    id: fiscalSequenceId,
    lastReservedNumber: 1n,
    model: 'cte',
    nextNumber: 2n,
    series: 1n,
    version: 1n,
  })
  await database.db.insert(fiscalSequenceReservations).values({
    companyId,
    fiscalSequenceId,
    id: reservationId,
    number: 1n,
    reservationKey: `reservation-${suffix}`,
  })
  await database.db.insert(cteBatchItems).values({
    batchId,
    calculationSnapshot: {},
    companyId,
    freightCalculationId,
    id: batchItemId,
    nfeDocumentId,
    position: 1n,
  })
  await database.db.insert(cteIssuanceAttempts).values({
    attemptKind: 'issue',
    attemptNumber: 1n,
    batchId,
    batchItemId,
    companyId,
    correlationId: `correlation-attempt-${suffix}`,
    fiscalEnvironment: 'homologation',
    fiscalNumber: 5_000n,
    fiscalSeries: '1',
    id: attemptId,
    idempotencyFingerprint: `fingerprint-attempt-${suffix}`,
    idempotencyKey: `attempt-${suffix}`,
    requestFingerprint: `request-attempt-${suffix}`,
    reservationId,
    status: 'authorized',
  })
  await database.db.insert(cteFiscalDocuments).values({
    accessKey: `5${String(Math.floor(Math.random() * 1e15)).padStart(15, '0')}${'2'.repeat(28)}`,
    attemptId,
    authorizationProtocol: `protocol-cte-${suffix}`,
    authorizedAt: new Date('2026-08-26T07:00:00.000Z'),
    batchItemId,
    companyId,
    fiscalEnvironment: 'homologation',
    fiscalNumber: 5_000n,
    fiscalSeries: '1',
    status: 'authorized',
    xmlObjectId: cteXmlObjectId,
    xmlSha256: sha,
  })
}
