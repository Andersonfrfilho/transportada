/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  createFreightRulesUseCase,
  type CreateFreightRuleInput,
  type FreightRuleSummary,
  type FreightRulesFingerprintPort,
  type FreightRulesTransactionPort,
  type FreightRulesUnitOfWorkPort,
} from '../src/freight-rules/application/freight-rules.use-case.js'
import { ApiError } from '../src/shared/api.error.js'

const COMPANY_CONTEXT = {
  companyId: 'company-001',
  membershipId: 'membership-001',
  permissions: new Set(['settings.manage']),
  userId: 'user-001',
} as const

const OTHER_COMPANY_ID = 'company-999'
const CORRELATION_ID = 'correlation-001'
const IDEMPOTENCY_KEY = 'freight-rule-idempotency-0001'
const RULE_ID = 'rule-001'
const RULE_VERSION_ID = 'rule-version-001'
const FINGERPRINT = 'fingerprint-001'

const BASE_RULE_INPUT = {
  context: COMPANY_CONTEXT,
  correlationId: CORRELATION_ID,
  description: 'Percentual padrao',
  idempotencyKey: IDEMPOTENCY_KEY,
  maximumAmount: '500.0000',
  minimumAmount: '100.0000',
  name: 'Regra percentual padrao',
  percentage: '0.035000',
  priority: '1',
  validFrom: '2026-07-01T00:00:00.000Z',
  validUntil: null,
} as const satisfies CreateFreightRuleInput

const CREATED_RULE = {
  companyId: COMPANY_CONTEXT.companyId,
  createdAt: '2026-07-22T18:00:00.000Z',
  createdByUserId: COMPANY_CONTEXT.userId,
  currentVersion: '1',
  description: 'Percentual padrao',
  id: RULE_ID,
  name: 'Regra percentual padrao',
  priority: '1',
  status: 'draft',
  type: 'percentage_of_invoice_total',
  updatedAt: '2026-07-22T18:00:00.000Z',
} as const satisfies FreightRuleSummary

describe('freight rules application contract', () => {
  test('creates a tenant-scoped freight rule, its first immutable version, audit, and idempotency record', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })
    const attackerInput = {
      ...BASE_RULE_INPUT,
      companyId: OTHER_COMPANY_ID,
    } as CreateFreightRuleInput & { readonly companyId: string }

    const result = await useCase.create(attackerInput)

    expect(result).toEqual(CREATED_RULE)
    expect(unitOfWork.createdRules).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        createdByUserId: COMPANY_CONTEXT.userId,
        currentVersion: '1',
        description: BASE_RULE_INPUT.description,
        name: BASE_RULE_INPUT.name,
        priority: '1',
        status: 'draft',
        type: 'percentage_of_invoice_total',
      },
    ])
    expect(unitOfWork.createdVersions).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        createdByUserId: COMPANY_CONTEXT.userId,
        filters: { destinationCityCodes: [], destinationStates: [], senderTaxIds: [] },
        freightRuleId: RULE_ID,
        maximumAmount: '500.0000',
        minimumAmount: '100.0000',
        percentage: '0.035000',
        snapshot: {
          freightRuleId: RULE_ID,
          freightRuleVersionId: RULE_VERSION_ID,
          maximumAmount: '500.0000',
          minimumAmount: '100.0000',
          percentage: '0.035000',
          ruleVersion: '1',
          type: 'percentage_of_invoice_total',
          validFrom: '2026-07-01T00:00:00.000Z',
          validUntil: null,
        },
        status: 'draft',
        validFrom: '2026-07-01T00:00:00.000Z',
        validUntil: null,
        version: '1',
      },
    ])
    expect(unitOfWork.audits).toEqual([
      {
        action: 'freight-rule.created',
        actorUserId: COMPANY_CONTEXT.userId,
        afterSnapshot: {
          currentVersion: '1',
          freightRuleId: RULE_ID,
          priority: '1',
          status: 'draft',
          type: 'percentage_of_invoice_total',
        },
        beforeSnapshot: null,
        companyId: COMPANY_CONTEXT.companyId,
        correlationId: CORRELATION_ID,
        entityId: RULE_ID,
        entityType: 'freight-rule',
      },
    ])
    expect(unitOfWork.idempotencyRecords).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        fingerprint: FINGERPRINT,
        idempotencyKey: IDEMPOTENCY_KEY,
        operation: 'freight-rule.create',
        response: CREATED_RULE,
      },
    ])
  })

  test('replays a matching rule create idempotency request without duplicating rule, version, or audit', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    unitOfWork.replayedIdempotency = {
      fingerprint: FINGERPRINT,
      response: CREATED_RULE,
    }
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const result = await useCase.create(BASE_RULE_INPUT)

    expect(result).toEqual(CREATED_RULE)
    expect(unitOfWork.createdRules).toEqual([])
    expect(unitOfWork.createdVersions).toEqual([])
    expect(unitOfWork.audits).toEqual([])
    expect(unitOfWork.idempotencyRecords).toEqual([])
  })

  test('rejects a divergent create idempotency replay without exposing tenant or fingerprint details', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    unitOfWork.replayedIdempotency = {
      fingerprint: 'another-fingerprint',
      response: CREATED_RULE,
    }
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const error = await captureApiError(() => useCase.create(BASE_RULE_INPUT))

    expect(error).toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'Idempotency key cannot be reused',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(FINGERPRINT)
    expect(unitOfWork.createdRules).toEqual([])
    expect(unitOfWork.createdVersions).toEqual([])
  })

  test('creates a new immutable rule version when percentage or validity changes and preserves the prior version', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const updatedRule = await useCase.update({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      expectedCurrentVersion: '1',
      filters: { destinationCityCodes: [], destinationStates: ['mg'], senderTaxIds: ['61084018000109'] },
      freightRuleId: RULE_ID,
      maximumAmount: '550.0000',
      minimumAmount: '110.0000',
      percentage: '0.040000',
      validFrom: '2026-08-01T00:00:00.000Z',
      validUntil: null,
    })

    expect(updatedRule).toEqual(CREATED_RULE)
    expect(unitOfWork.updatedRuleVersionPointers).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        currentVersion: '2',
        freightRuleId: RULE_ID,
        previousVersion: '1',
      },
    ])
    expect(unitOfWork.createdVersions).toContainEqual({
      companyId: COMPANY_CONTEXT.companyId,
      createdByUserId: COMPANY_CONTEXT.userId,
      filters: { destinationCityCodes: [], destinationStates: ['MG'], senderTaxIds: ['61084018000109'] },
      freightRuleId: RULE_ID,
      maximumAmount: '550.0000',
      minimumAmount: '110.0000',
      percentage: '0.040000',
      snapshot: {
        freightRuleId: RULE_ID,
        freightRuleVersionId: RULE_VERSION_ID,
        maximumAmount: '550.0000',
        minimumAmount: '110.0000',
        percentage: '0.040000',
        ruleVersion: '2',
        type: 'percentage_of_invoice_total',
        validFrom: '2026-08-01T00:00:00.000Z',
        validUntil: null,
      },
      status: 'draft',
      validFrom: '2026-08-01T00:00:00.000Z',
      validUntil: null,
      version: '2',
    })
  })

  test('keeps a new version of an already active rule applicable instead of parking it as draft', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    unitOfWork.ruleAfterPointerUpdate = { ...CREATED_RULE, currentVersion: '2', status: 'active' }
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    await useCase.update({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      expectedCurrentVersion: '1',
      freightRuleId: RULE_ID,
      maximumAmount: null,
      minimumAmount: null,
      percentage: '0.045000',
      validFrom: '2026-09-01T00:00:00.000Z',
      validUntil: null,
    })

    expect(unitOfWork.createdVersions).toHaveLength(1)
    expect(unitOfWork.createdVersions[0]).toMatchObject({ status: 'active', version: '2' })
  })

  test('rejects an update whose expected current version no longer matches the stored rule', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    unitOfWork.ruleAfterPointerUpdate = null
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const error = await captureApiError(() =>
      useCase.update({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        expectedCurrentVersion: '7',
        freightRuleId: RULE_ID,
        maximumAmount: null,
        minimumAmount: null,
        percentage: '0.045000',
        validFrom: '2026-09-01T00:00:00.000Z',
        validUntil: null,
      }),
    )

    expect(error).toMatchObject({
      code: 'FREIGHT_RULE_VERSION_CONFLICT',
      message: 'Freight rule version conflict',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(unitOfWork.createdVersions).toEqual([])
  })

  test('activates and deactivates freight rules tenant-scoped and blocks overlap conflicts with a safe error', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    unitOfWork.activationConflictError = new Error('FREIGHT_RULE_OVERLAP_CONFLICT')
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const deactivatedRule = await useCase.deactivate({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      freightRuleId: RULE_ID,
    })
    expect(deactivatedRule).toEqual(CREATED_RULE)
    expect(unitOfWork.statusChanges).toContainEqual({
      companyId: COMPANY_CONTEXT.companyId,
      freightRuleId: RULE_ID,
      nextStatus: 'inactive',
    })
    expect(unitOfWork.versionStatusChanges).toContainEqual({
      companyId: COMPANY_CONTEXT.companyId,
      freightRuleId: RULE_ID,
      nextStatus: 'inactive',
    })

    const error = await captureApiError(() =>
      useCase.activate({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        freightRuleId: RULE_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'FREIGHT_RULE_CONFLICT',
      message: 'Freight rule conflict',
      status: 409,
    })
    expect(JSON.stringify(error)).not.toContain(COMPANY_CONTEXT.companyId)
    expect(JSON.stringify(error)).not.toContain(RULE_ID)
  })

  test('publishes the rule versions together with the rule so an activated rule is actually applicable', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    await useCase.activate({
      context: COMPANY_CONTEXT,
      correlationId: CORRELATION_ID,
      freightRuleId: RULE_ID,
    })

    expect(unitOfWork.statusChanges).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        freightRuleId: RULE_ID,
        nextStatus: 'active',
      },
    ])
    expect(unitOfWork.versionStatusChanges).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        freightRuleId: RULE_ID,
        nextStatus: 'active',
      },
    ])
  })

  test('reports a status change on a rule outside the tenant as not found', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    unitOfWork.ruleAfterStatusChange = null
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const error = await captureApiError(() =>
      useCase.activate({
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        freightRuleId: RULE_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'FREIGHT_RULE_NOT_FOUND',
      message: 'Freight rule not found',
      status: 404,
    })
    expect(unitOfWork.versionStatusChanges).toEqual([])
  })

  test('narrows the applicable version by destination state and sender tax id of the document', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    await useCase.list({ context: COMPANY_CONTEXT, cursor: null, limit: 20 })
    await useCase.findApplicableVersion({
      companyId: OTHER_COMPANY_ID,
      destinationState: 'MG',
      issuedAt: '2026-08-02T00:00:00.000Z',
      ruleType: 'percentage_of_invoice_total',
      senderTaxId: '61084018000109',
    })

    expect(unitOfWork.applicableVersionRequests).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        destinationState: 'MG',
        issuedAt: '2026-08-02T00:00:00.000Z',
        ruleType: 'percentage_of_invoice_total',
        senderTaxId: '61084018000109',
      },
    ])
  })

  test('lists rules and selects the current applicable version only for the authenticated tenant', async () => {
    const unitOfWork = new FreightRulesUnitOfWorkFixture()
    const useCase = createFreightRulesUseCase({
      fingerprintService: createFingerprintFixture(FINGERPRINT),
      unitOfWork,
    })

    const listResult = await useCase.list({
      context: COMPANY_CONTEXT,
      cursor: null,
      limit: 20,
    })
    const applicableVersion = await useCase.findApplicableVersion({
      companyId: OTHER_COMPANY_ID,
      issuedAt: '2026-08-02T00:00:00.000Z',
      ruleType: 'percentage_of_invoice_total',
    })

    expect(listResult.items).toEqual([CREATED_RULE])
    expect(listResult.nextCursor).toBeNull()
    expect(unitOfWork.listRequests).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        cursor: null,
        limit: 20,
      },
    ])
    expect(applicableVersion).toMatchObject({
      companyId: COMPANY_CONTEXT.companyId,
      freightRuleId: RULE_ID,
      version: '2',
    })
    expect(unitOfWork.applicableVersionRequests).toEqual([
      {
        companyId: COMPANY_CONTEXT.companyId,
        issuedAt: '2026-08-02T00:00:00.000Z',
        ruleType: 'percentage_of_invoice_total',
      },
    ])
  })
})

class FreightRulesUnitOfWorkFixture implements FreightRulesUnitOfWorkPort {
  public readonly audits: Array<Record<string, unknown>> = []
  public readonly createdRules: Array<Record<string, string>> = []
  public readonly createdVersions: Array<Record<string, unknown>> = []
  public readonly idempotencyRecords: Array<Record<string, unknown>> = []
  public readonly listRequests: Array<Record<string, unknown>> = []
  public readonly applicableVersionRequests: Array<Record<string, unknown>> = []
  public readonly statusChanges: Array<Record<string, string>> = []
  public readonly updatedRuleVersionPointers: Array<Record<string, string>> = []
  public readonly versionStatusChanges: Array<Record<string, string>> = []
  public activationConflictError: Error | null = null
  public ruleAfterPointerUpdate: FreightRuleSummary | null = CREATED_RULE
  public ruleAfterStatusChange: FreightRuleSummary | null = CREATED_RULE
  public replayedIdempotency: {
    readonly fingerprint: string
    readonly response: FreightRuleSummary
  } | null = null

  async appendAudit(input: Record<string, unknown>): Promise<void> {
    this.audits.push(structuredClone(input))
  }

  async createRule(input: Record<string, string>): Promise<FreightRuleSummary> {
    this.createdRules.push(structuredClone(input))
    return CREATED_RULE
  }

  async createRuleVersion(input: Record<string, unknown>): Promise<{
    readonly freightRuleVersionId: string
    readonly version: string
  }> {
    this.createdVersions.push(structuredClone(input))
    return {
      freightRuleVersionId: RULE_VERSION_ID,
      version: String(input.version),
    }
  }

  async execute<TResponse>(
    operation: (transaction: FreightRulesTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return operation(this)
  }

  async findApplicableVersion(input: {
    readonly companyId: string
    readonly destinationState?: string | null
    readonly issuedAt: string
    readonly ruleType: 'percentage_of_invoice_total'
    readonly senderTaxId?: string | null
  }): Promise<Record<string, string> | null> {
    this.applicableVersionRequests.push(structuredClone(input))
    return {
      companyId: COMPANY_CONTEXT.companyId,
      freightRuleId: RULE_ID,
      freightRuleVersionId: RULE_VERSION_ID,
      version: '2',
    }
  }

  async findIdempotency(): Promise<{
    readonly fingerprint: string
    readonly response: FreightRuleSummary
  } | null> {
    return this.replayedIdempotency
  }

  async listRules(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }): Promise<{
    readonly items: readonly FreightRuleSummary[]
    readonly nextCursor: string | null
  }> {
    this.listRequests.push(structuredClone(input))
    return { items: [CREATED_RULE], nextCursor: null }
  }

  async saveIdempotency(input: Record<string, unknown>): Promise<void> {
    this.idempotencyRecords.push(structuredClone(input))
  }

  async setRuleStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<FreightRuleSummary | null> {
    this.statusChanges.push(structuredClone(input))
    if (input.nextStatus === 'active' && this.activationConflictError !== null) {
      throw this.activationConflictError
    }
    return this.ruleAfterStatusChange
  }

  async setVersionsStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<void> {
    this.versionStatusChanges.push(structuredClone(input))
  }

  async updateCurrentVersion(input: {
    readonly companyId: string
    readonly currentVersion: string
    readonly freightRuleId: string
    readonly previousVersion: string
  }): Promise<FreightRuleSummary | null> {
    this.updatedRuleVersionPointers.push(structuredClone(input))
    return this.ruleAfterPointerUpdate
  }
}

function createFingerprintFixture(fingerprint: string): FreightRulesFingerprintPort {
  return {
    async create(input) {
      expect(input.operation).toBe('freight-rule.create')
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
