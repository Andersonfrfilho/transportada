/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createFreightSimulationUseCase,
  type FreightCalculationDetail,
  type FreightSimulationFingerprintPort,
  type FreightSimulationInput,
  type FreightSimulationTransactionPort,
  type FreightSimulationUnitOfWorkPort,
} from '../src/freight-calculations/application/freight-simulation.use-case.js'
import { ApiError } from '../src/shared/api.error.js'

const COMPANY_CONTEXT = {
  companyId: 'company-001',
  membershipId: 'membership-001',
  permissions: new Set(['freight.simulate', 'invoices.read']),
  roles: new Set(['fiscal']),
  kind: 'company',
  userId: 'user-001',
} as const

const CORRELATION_ID = 'correlation-001'
const IDEMPOTENCY_KEY = 'freight-simulation-idempotency-0001'
const DOCUMENT_ID = 'nfe-001'
const CALCULATION_ID = 'calculation-001'
const FINGERPRINT = 'freight-simulation-fingerprint-001'

const FREIGHT_INPUT = {
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  documentId: DOCUMENT_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
} as const satisfies FreightSimulationInput

const PERSISTED_CALCULATION = {
  adjustments: [],
  baseAmount: '10000.0000',
  calculatedAmount: '350.0000',
  calculationDetails: {
    formula: 'invoiceTotalAmount * percentage',
    roundingMode: 'half_up',
    scale: 4,
  },
  companyId: COMPANY_CONTEXT.companyId,
  correlationId: CORRELATION_ID,
  createdAt: '2026-07-22T19:00:00.000Z',
  createdByUserId: COMPANY_CONTEXT.userId,
  freightRuleId: 'rule-001',
  freightRuleVersionId: 'rule-version-001',
  id: CALCULATION_ID,
  maximumAmount: null,
  minimumAmount: null,
  nfeDocumentId: DOCUMENT_ID,
  percentage: '0.035000',
  ruleSnapshot: {
    freightRuleId: 'rule-001',
    freightRuleVersionId: 'rule-version-001',
    maximumAmount: null,
    minimumAmount: null,
    percentage: '0.035000',
    ruleVersion: '1',
    type: 'percentage_of_invoice_total',
    validFrom: '2026-07-01T00:00:00.000Z',
    validUntil: null,
  },
  ruleVersion: '1',
  status: 'snapshotted',
  totalAmount: '350.0000',
  updatedAt: '2026-07-22T19:00:00.000Z',
} as const satisfies FreightCalculationDetail

describe('freight simulation application contract', () => {
  test('persists one tenant-scoped snapshot using the applicable rule for an authorized complete NF-e', async () => {
    const unitOfWork = new FreightSimulationUnitOfWorkFixture()
    const useCase = createFreightSimulationUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const result = await useCase.execute({
      ...FREIGHT_INPUT,
      documentId: 'other-company-document',
    })

    expect(result).toEqual(PERSISTED_CALCULATION)
    expect(unitOfWork.documentRequests).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        documentId: DOCUMENT_ID,
      },
    ])
    expect(unitOfWork.ruleRequests).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        issuedAt: '2026-07-22T12:00:00.000Z',
        ruleType: 'percentage_of_invoice_total',
      },
    ])
    expect(unitOfWork.createdCalculations).toEqual([
      {
        baseAmount: '10000.0000',
        calculatedAmount: '350.0000',
        calculationDetails: {
          formula: 'invoiceTotalAmount * percentage',
          roundingMode: 'half_up',
          scale: 4,
        },
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        createdByUserId: COMPANY_CONTEXT.userId,
        freightRuleId: 'rule-001',
        freightRuleVersionId: 'rule-version-001',
        idempotencyKey: IDEMPOTENCY_KEY,
        maximumAmount: null,
        minimumAmount: null,
        nfeDocumentId: DOCUMENT_ID,
        percentage: '0.035000',
        requestFingerprint: FINGERPRINT,
        ruleSnapshot: {
          freightRuleId: 'rule-001',
          freightRuleVersionId: 'rule-version-001',
          maximumAmount: null,
          minimumAmount: null,
          percentage: '0.035000',
          ruleVersion: '1',
          type: 'percentage_of_invoice_total',
          validFrom: '2026-07-01T00:00:00.000Z',
          validUntil: null,
        },
        ruleVersion: '1',
        status: 'snapshotted',
        totalAmount: '350.0000',
      },
    ])
    expect(unitOfWork.idempotencyRecords).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        fingerprint: FINGERPRINT,
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: 'freight-simulation.create',
        response: PERSISTED_CALCULATION,
      },
    ])
    expect(unitOfWork.audits).toEqual([
      {
        action: 'freight-calculation.created',
        actorUserId: COMPANY_CONTEXT.userId,
        afterSnapshot: {
          calculationId: CALCULATION_ID,
          documentId: DOCUMENT_ID,
          freightRuleId: 'rule-001',
          totalAmount: '350.0000',
        },
        beforeSnapshot: null,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        entityId: CALCULATION_ID,
        entityType: 'freight-calculation',
      },
    ])
  })

  test('replays a matching idempotency request without recalculating or duplicating persistence', async () => {
    const unitOfWork = new FreightSimulationUnitOfWorkFixture()
    unitOfWork.replayedIdempotency = {
      fingerprint: FINGERPRINT,
      response: PERSISTED_CALCULATION,
    }
    const useCase = createFreightSimulationUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const result = await useCase.execute(FREIGHT_INPUT)

    expect(result).toEqual(PERSISTED_CALCULATION)
    expect(unitOfWork.createdCalculations).toEqual([])
    expect(unitOfWork.idempotencyRecords).toEqual([])
    expect(unitOfWork.audits).toEqual([])
  })

  test('rejects a divergent idempotency replay without exposing tenant or fingerprint details', async () => {
    const unitOfWork = new FreightSimulationUnitOfWorkFixture()
    unitOfWork.replayedIdempotency = {
      fingerprint: 'another-fingerprint',
      response: PERSISTED_CALCULATION,
    }
    const useCase = createFreightSimulationUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const error = await captureApiError(() => useCase.execute(FREIGHT_INPUT))

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(FINGERPRINT)
  })

  test('rejects missing applicable rules with a safe configuration error', async () => {
    const unitOfWork = new FreightSimulationUnitOfWorkFixture()
    unitOfWork.applicableRule = null
    const useCase = createFreightSimulationUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const error = await captureApiError(() => useCase.execute(FREIGHT_INPUT))

    expect(error).toMatchObject({
      code: 'FREIGHT_RULE_NOT_FOUND',
      message: 'No applicable freight rule found',
      status: 409,
    })
  })

  test('rejects summary, event, non-authorized, or incomplete NF-e as not eligible for simulation', async () => {
    const scenarios = [
      { status: 'cancelled', totalAmount: '10000.0000', variant: 'complete' },
      { status: 'authorized', totalAmount: '10000.0000', variant: 'summary' },
      { status: 'authorized', totalAmount: '10000.0000', variant: 'event' },
      { status: 'authorized', totalAmount: '', variant: 'complete' },
    ] as const

    for (const scenario of scenarios) {
      const unitOfWork = new FreightSimulationUnitOfWorkFixture()
      unitOfWork.document = {
        ...unitOfWork.document,
        status: scenario.status,
        totalAmount: scenario.totalAmount,
        variant: scenario.variant,
      }
      const useCase = createFreightSimulationUseCase({
        fingerprintService: createFingerprintFixture(FINGERPRINT),
        unitOfWork,
      })

      const error = await captureApiError(() => useCase.execute(FREIGHT_INPUT))
      expect(error).toMatchObject({
        code: 'FREIGHT_DOCUMENT_NOT_ELIGIBLE',
        message: 'NF-e is not eligible for freight simulation',
        status: 409,
      })
    }
  })
})

class FreightSimulationUnitOfWorkFixture implements FreightSimulationUnitOfWorkPort {
  public readonly audits: Array<Record<string, unknown>> = []
  public readonly createdCalculations: Array<Record<string, unknown>> = []
  public readonly documentRequests: Array<Record<string, string>> = []
  public readonly idempotencyRecords: Array<Record<string, unknown>> = []
  public readonly ruleRequests: Array<Record<string, string>> = []
  public document = {
    companyId: COMPANY_CONTEXT.companyId,
    id: DOCUMENT_ID,
    issuedAt: '2026-07-22T12:00:00.000Z',
    status: 'authorized',
    totalAmount: '10000.0000',
    variant: 'complete',
  } as const
  public applicableRule: Record<string, string> | null = {
    freightRuleId: 'rule-001',
    freightRuleVersionId: 'rule-version-001',
    maximumAmount: '',
    minimumAmount: '',
    percentage: '0.035000',
    validFrom: '2026-07-01T00:00:00.000Z',
    validUntil: '',
    version: '1',
  }
  public replayedIdempotency: {
    readonly fingerprint: string
    readonly response: FreightCalculationDetail
  } | null = null

  async appendAudit(input: Record<string, unknown>): Promise<void> {
    this.audits.push(structuredClone(input))
  }

  async createCalculation(input: Record<string, unknown>): Promise<FreightCalculationDetail> {
    this.createdCalculations.push(structuredClone(input))
    return PERSISTED_CALCULATION
  }

  async execute<TResponse>(
    operation: (transaction: FreightSimulationTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return operation(this)
  }

  async findApplicableRule(input: {
    readonly companyId: string
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
  }): Promise<Record<string, string> | null> {
    this.ruleRequests.push(structuredClone(input))
    return this.applicableRule
  }

  async findDocument(input: { readonly companyId: string; readonly documentId: string }): Promise<{
    readonly companyId: string
    readonly id: string
    readonly issuedAt: string
    readonly status: 'authorized' | 'cancelled' | 'denied'
    readonly totalAmount: string
    readonly variant: 'complete' | 'summary' | 'event'
  } | null> {
    this.documentRequests.push(structuredClone(input))
    return this.document
  }

  async findIdempotency(): Promise<{
    readonly fingerprint: string
    readonly response: FreightCalculationDetail
  } | null> {
    return this.replayedIdempotency
  }

  async saveIdempotency(input: Record<string, unknown>): Promise<void> {
    this.idempotencyRecords.push(structuredClone(input))
  }
}

function createFingerprintFixture(fingerprint: string): FreightSimulationFingerprintPort {
  return {
    async create(input) {
      expect(input.operation).toBe('freight-simulation.create')
      return fingerprint
    },
  }
}

async function captureApiError(factory: () => Promise<unknown>): Promise<ApiError> {
  try {
    await factory()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }

  throw new Error('Expected ApiError')
}
