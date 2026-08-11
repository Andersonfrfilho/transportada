/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  calculatePercentageFreight,
  parseMoney,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import type {
  CteBatchProjection,
  CteBatchProjectionCandidate,
} from '../domain/cte-batch-projection.service.js'
import { createInvalidStateError } from '../domain/cte-batch.error.js'
import { getRequiredString } from './cte-batch-record.service.js'
import type { CteBatchUnitOfWorkPort, CteBatchWriteInput } from './cte-batch.port.js'

const FREIGHT_CALCULATION_STATUS = 'snapshotted'
const FREIGHT_IDEMPOTENCY_PREFIX = 'cte-batch'

export type FreightCalculationIndex = ReadonlyMap<string, string>

/**
 * RF12: cada NF-e selecionada recebe seu próprio cálculo de frete, com chave idempotente
 * derivada do lote, para manter a rastreabilidade do faturamento mesmo quando agrupada.
 */
export async function persistFreightCalculations({
  candidates,
  fingerprint,
  input,
  transaction,
}: {
  readonly candidates: readonly CteBatchProjectionCandidate[]
  readonly fingerprint: string
  readonly input: CteBatchWriteInput
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<FreightCalculationIndex> {
  const calculationIdByDocumentId = new Map<string, string>()
  for (const candidate of candidates) {
    // sequencial de propósito: as escritas rodam na mesma transação/conexão do lote
    const created = await transaction.createFreightCalculation(
      buildFreightCalculation({ candidate, fingerprint, input }),
    )
    calculationIdByDocumentId.set(candidate.document.documentId, getRequiredString(created, 'id'))
  }

  return calculationIdByDocumentId
}

/** `positionOffset` é a contagem que o lote já tem: a fatia seguinte continua a numeração. */
export async function persistProjections({
  batchId,
  calculationIdByDocumentId,
  companyId,
  positionOffset = 0,
  projections,
  transaction,
}: {
  readonly batchId: string
  readonly calculationIdByDocumentId: FreightCalculationIndex
  readonly companyId: string
  readonly positionOffset?: number
  readonly projections: readonly CteBatchProjection[]
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<void> {
  let position = positionOffset
  for (const projection of projections) {
    position += 1
    // sequencial de propósito: a ordem de inserção define a posição do item no lote
    await persistProjection({
      batchId,
      calculationIdByDocumentId,
      companyId,
      position: String(position),
      projection,
      transaction,
    })
  }
}

async function persistProjection({
  batchId,
  calculationIdByDocumentId,
  companyId,
  position,
  projection,
  transaction,
}: {
  readonly batchId: string
  readonly calculationIdByDocumentId: FreightCalculationIndex
  readonly companyId: string
  readonly position: string
  readonly projection: CteBatchProjection
  readonly transaction: CteBatchUnitOfWorkPort
}): Promise<void> {
  const nfeDocumentId = resolvePrimaryDocumentId(projection)
  const freightCalculationId = calculationIdByDocumentId.get(nfeDocumentId)
  if (freightCalculationId === undefined) throw createInvalidStateError()

  const item = await transaction.createBatchItem({
    batchId,
    calculationSnapshot: { ...projection, freightCalculationId },
    companyId,
    freightCalculationId,
    nfeDocumentId,
    position,
  })
  const itemId = getRequiredString(item, 'id')

  let documentPosition = 0
  for (const document of projection.documents) {
    documentPosition += 1
    await transaction.createBatchItemDocument({
      batchId,
      companyId,
      itemId,
      nfeDocumentId: document.documentId,
      position: String(documentPosition),
    })
  }

  let ordinal = 0
  for (const charge of projection.charges) {
    ordinal += 1
    await transaction.createBatchItemCharge({
      amount: charge.amount,
      baseAmount: charge.baseAmount,
      calculationType: charge.calculationType,
      companyId,
      itemId,
      label: charge.label,
      ordinal: String(ordinal),
      rate: charge.rate,
    })
  }
}

/** D3: o CT-e agrupado se ancora na NF-e de maior valor, que rege o produto predominante. */
function resolvePrimaryDocumentId(projection: CteBatchProjection): string {
  let primary = projection.documents[0]
  if (primary === undefined) throw createInvalidStateError()

  for (const document of projection.documents) {
    if (parseMoney(document.totalAmount) > parseMoney(primary.totalAmount)) primary = document
  }

  return primary.documentId
}

function buildFreightCalculation({
  candidate,
  fingerprint,
  input,
}: {
  readonly candidate: CteBatchProjectionCandidate
  readonly fingerprint: string
  readonly input: CteBatchWriteInput
}): Record<string, unknown> {
  const documentId = candidate.document.documentId
  const calculation = calculatePercentageFreight({
    invoice: {
      id: documentId,
      issuedAt: candidate.document.issuedAt,
      totalAmount: candidate.document.totalAmount,
    },
    ruleSnapshot: candidate.profile.ruleSnapshot,
  })

  return {
    adjustments: calculation.adjustments,
    baseAmount: calculation.baseAmount,
    calculatedAmount: calculation.calculatedAmount,
    calculationDetails: calculation.calculationDetails,
    companyId: input.context.companyId,
    correlationId: input.correlationId,
    createdByUserId: input.context.userId,
    freightRuleId: calculation.ruleSnapshot.freightRuleId,
    freightRuleVersionId: calculation.ruleSnapshot.freightRuleVersionId,
    idempotencyKey: `${FREIGHT_IDEMPOTENCY_PREFIX}:${input.idempotencyKey}:${documentId}`,
    maximumAmount: calculation.maximumAmount,
    minimumAmount: calculation.minimumAmount,
    nfeDocumentId: documentId,
    percentage: calculation.percentage,
    requestFingerprint: fingerprint,
    ruleSnapshot: calculation.ruleSnapshot,
    ruleVersion: calculation.ruleSnapshot.ruleVersion,
    status: FREIGHT_CALCULATION_STATUS,
    totalAmount: calculation.totalAmount,
  }
}
