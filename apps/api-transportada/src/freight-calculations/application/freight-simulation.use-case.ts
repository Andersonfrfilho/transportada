/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  calculatePercentageFreight,
  createFreightRuleSnapshot,
  type FreightRuleSnapshot,
} from '../domain/freight-calculation-engine.service.js'

const CREATE_OPERATION = 'freight-simulation.create'
const TEXT_ENCODER = new TextEncoder()
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type EligibleNfeDocument = {
  readonly companyId: string
  /** Spec 065 D6: o município da entrega, que é a dimensão nova do parâmetro de frete. */
  readonly destinationCityCode?: string | null
  readonly destinationState?: string | null
  readonly id: string
  readonly issuedAt: string
  readonly senderTaxId?: string | null
  readonly status: 'authorized' | 'cancelled' | 'denied' | 'unsigned'
  readonly totalAmount: string
  readonly variant: 'complete' | 'summary' | 'event'
}

type ApplicableFreightRule = {
  readonly freightRuleId: string
  readonly freightRuleVersionId: string
  readonly maximumAmount: string
  readonly minimumAmount: string
  readonly percentage: string
  readonly validFrom: string
  readonly validUntil: string
  readonly version: string
}

type FreightSimulationIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: FreightCalculationDetail
}

type FreightSimulationCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type FreightCalculationDetail = {
  readonly adjustments: readonly {
    readonly amount: string
    readonly description: string
    readonly type: 'minimum_amount' | 'maximum_amount'
  }[]
  readonly baseAmount: string
  readonly calculatedAmount: string
  readonly calculationDetails: {
    readonly formula: string
    readonly roundingMode: 'half_up'
    readonly scale: 4
  }
  readonly companyId: string
  readonly correlationId: string
  readonly createdAt: string
  readonly createdByUserId: string
  readonly freightRuleId: string
  readonly freightRuleVersionId: string
  readonly id: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly nfeDocumentId: string
  readonly percentage: string
  readonly ruleSnapshot: FreightRuleSnapshot
  readonly ruleVersion: string
  readonly status: 'snapshotted' | 'rejected'
  readonly totalAmount: string
  readonly updatedAt: string
}

export type FreightSimulationInput = {
  readonly context: FreightSimulationCompanyContext
  readonly correlationId: string
  readonly documentId: string
  readonly idempotencyKey: string
}

export type FreightSimulationFingerprintPort = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}

export type FreightSimulationTransactionPort = {
  appendAudit(input: Record<string, unknown>): Promise<void>
  createCalculation(input: Record<string, unknown>): Promise<FreightCalculationDetail>
  findApplicableRule(input: {
    readonly companyId: string
    readonly destinationCityCode?: string | null
    readonly destinationState?: string | null
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: string | null
  }): Promise<Record<string, string> | null>
  findDocument(input: {
    readonly companyId: string
    readonly documentId: string
  }): Promise<EligibleNfeDocument | null>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<FreightSimulationIdempotencyRecord | null>
  saveIdempotency(input: Record<string, unknown>): Promise<void>
}

export type FreightSimulationUnitOfWorkPort = {
  execute<TResponse>(
    operation: (transaction: FreightSimulationTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse>
}

export function createFreightSimulationUseCase(dependencies: {
  readonly fingerprintService: FreightSimulationFingerprintPort
  readonly unitOfWork: FreightSimulationUnitOfWorkPort
}): {
  readonly execute: (input: FreightSimulationInput) => Promise<FreightCalculationDetail>
} {
  return {
    execute: async (input) => {
      const fingerprint = await dependencies.fingerprintService.create({
        fields: createFingerprintFields(input),
        operation: CREATE_OPERATION,
      })

      return dependencies.unitOfWork.execute(async (transaction) => {
        const replay = await transaction.findIdempotency({
          companyId: input.context.companyId,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
        })
        if (replay !== null) {
          if (replay.fingerprint !== fingerprint) {
            throw createIdempotencyConflict()
          }
          return replay.response
        }

        const document = await transaction.findDocument({
          companyId: input.context.companyId,
          documentId: resolveDocumentLookupId(input.documentId),
        })
        if (document === null || document.companyId !== input.context.companyId) {
          throw createDocumentNotEligibleError()
        }
        assertEligibleDocument(document)

        const applicableRule = await transaction.findApplicableRule({
          companyId: input.context.companyId,
          destinationCityCode: document.destinationCityCode ?? null,
          destinationState: document.destinationState ?? null,
          issuedAt: document.issuedAt,
          ruleType: 'percentage_of_invoice_total',
          senderTaxId: document.senderTaxId ?? null,
        })
        if (applicableRule === null) {
          throw new ApiError({
            code: 'FREIGHT_RULE_NOT_FOUND',
            message: 'No applicable freight rule found',
            status: 409,
          })
        }

        const calculationDraft = createCalculationDraft({
          applicableRule,
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          createdByUserId: input.context.userId,
          document,
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint,
        })
        const persistedCalculation = await transaction.createCalculation(calculationDraft)

        await transaction.saveIdempotency({
          companyId: input.context.companyId,
          fingerprint,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
          response: persistedCalculation,
        })
        await transaction.appendAudit({
          action: 'freight-calculation.created',
          actorUserId: input.context.userId,
          afterSnapshot: {
            calculationId: persistedCalculation.id,
            documentId: persistedCalculation.nfeDocumentId,
            freightRuleId: persistedCalculation.freightRuleId,
            totalAmount: persistedCalculation.totalAmount,
          },
          beforeSnapshot: null,
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          entityId: persistedCalculation.id,
          entityType: 'freight-calculation',
        })

        return persistedCalculation
      })
    },
  }
}

function assertEligibleDocument(document: EligibleNfeDocument): void {
  if (document.status !== 'authorized') {
    throw createDocumentNotEligibleError()
  }
  if (document.variant !== 'complete') {
    throw createDocumentNotEligibleError()
  }
  if (document.totalAmount.length === 0) {
    throw createDocumentNotEligibleError()
  }
}

function createCalculationDraft(input: {
  readonly applicableRule: Record<string, string>
  readonly companyId: string
  readonly correlationId: string
  readonly createdByUserId: string
  readonly document: EligibleNfeDocument
  readonly idempotencyKey: string
  readonly requestFingerprint: string
}): Record<string, unknown> {
  const applicableRule = input.applicableRule as ApplicableFreightRule
  const ruleSnapshot = createFreightRuleSnapshot({
    freightRuleId: applicableRule.freightRuleId,
    freightRuleVersionId: applicableRule.freightRuleVersionId,
    maximumAmount: emptyToNull(applicableRule.maximumAmount),
    minimumAmount: emptyToNull(applicableRule.minimumAmount),
    percentage: applicableRule.percentage,
    ruleVersion: applicableRule.version,
    type: 'percentage_of_invoice_total',
    validFrom: applicableRule.validFrom,
    validUntil: emptyToNull(applicableRule.validUntil),
  })
  const result = calculatePercentageFreight({
    invoice: {
      id: input.document.id,
      issuedAt: input.document.issuedAt,
      totalAmount: input.document.totalAmount,
    },
    ruleSnapshot,
  })

  return {
    companyId: input.companyId,
    baseAmount: result.baseAmount,
    calculatedAmount: result.calculatedAmount,
    calculationDetails: result.calculationDetails,
    correlationId: input.correlationId,
    createdByUserId: input.createdByUserId,
    freightRuleId: ruleSnapshot.freightRuleId,
    freightRuleVersionId: ruleSnapshot.freightRuleVersionId,
    idempotencyKey: input.idempotencyKey,
    maximumAmount: result.maximumAmount,
    minimumAmount: result.minimumAmount,
    nfeDocumentId: input.document.id,
    percentage: result.percentage,
    requestFingerprint: input.requestFingerprint,
    ruleSnapshot,
    ruleVersion: ruleSnapshot.ruleVersion,
    status: 'snapshotted',
    totalAmount: result.totalAmount,
  }
}

function createDocumentNotEligibleError(): ApiError {
  return new ApiError({
    code: 'FREIGHT_DOCUMENT_NOT_ELIGIBLE',
    message: 'NF-e is not eligible for freight simulation',
    status: 409,
  })
}

function createFingerprintFields(input: FreightSimulationInput): readonly Uint8Array[] {
  const values = [input.context.companyId, input.documentId]
  return values.map((value) => TEXT_ENCODER.encode(value))
}

function createIdempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

function resolveDocumentLookupId(documentId: string): string {
  if (documentId.startsWith('nfe-')) {
    return documentId
  }
  if (UUID_PATTERN.test(documentId)) {
    return documentId
  }

  throw createDocumentNotEligibleError()
}

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value
}
