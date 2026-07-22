/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  createFreightRuleSnapshot,
  type FreightRuleSnapshot,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'

const CREATE_OPERATION = 'freight-rule.create'
const TEXT_ENCODER = new TextEncoder()

export type FreightRuleType = 'percentage_of_invoice_total'
export type FreightRuleStatus = 'draft' | 'active' | 'inactive'

type FreightRuleCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type FreightRuleSummary = {
  readonly companyId: string
  readonly createdAt: string
  readonly createdByUserId: string
  readonly currentVersion: string
  readonly description: string
  readonly id: string
  readonly name: string
  readonly priority: string
  readonly status: FreightRuleStatus
  readonly type: FreightRuleType
  readonly updatedAt: string
}

export type CreateFreightRuleInput = {
  readonly context: FreightRuleCompanyContext
  readonly correlationId: string
  readonly description: string
  readonly idempotencyKey: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly name: string
  readonly percentage: string
  readonly priority: string
  readonly validFrom: string
  readonly validUntil: string | null
}

type UpdateFreightRuleInput = {
  readonly context: FreightRuleCompanyContext
  readonly correlationId: string
  readonly expectedCurrentVersion: string
  readonly freightRuleId: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly validFrom: string
  readonly validUntil: string | null
}

type ChangeFreightRuleStatusInput = {
  readonly context: FreightRuleCompanyContext
  readonly correlationId: string
  readonly freightRuleId: string
}

type ListFreightRulesInput = {
  readonly context: FreightRuleCompanyContext
  readonly cursor: string | null
  readonly limit: number
}

type FindApplicableVersionInput = {
  readonly companyId: string
  readonly issuedAt: string
  readonly ruleType: FreightRuleType
}

type FreightRulesIdempotencyRecord = {
  readonly fingerprint: string
  readonly response: FreightRuleSummary
}

type FreightRuleVersionRecord = {
  readonly companyId: string
  readonly createdByUserId: string
  readonly filters: Readonly<Record<string, never>>
  readonly freightRuleId: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly snapshot: FreightRuleSnapshot
  readonly status: FreightRuleStatus
  readonly validFrom: string
  readonly validUntil: string | null
  readonly version: string
}

export type FreightRulesFingerprintPort = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}

export type FreightRulesTransactionPort = {
  appendAudit(input: Record<string, unknown>): Promise<void>
  createRule(input: Record<string, string>): Promise<FreightRuleSummary>
  createRuleVersion(input: FreightRuleVersionRecord): Promise<{
    readonly freightRuleVersionId: string
    readonly version: string
  }>
  findApplicableVersion(input: {
    readonly companyId: string
    readonly issuedAt: string
    readonly ruleType: FreightRuleType
  }): Promise<Record<string, string> | null>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<FreightRulesIdempotencyRecord | null>
  listRules(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }): Promise<{
    readonly items: readonly FreightRuleSummary[]
    readonly nextCursor: string | null
  }>
  saveIdempotency(input: Record<string, unknown>): Promise<void>
  setRuleStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<void>
  updateCurrentVersion(input: {
    readonly companyId: string
    readonly currentVersion: string
    readonly freightRuleId: string
    readonly previousVersion: string
  }): Promise<void>
}

export type FreightRulesUnitOfWorkPort = {
  execute<TResponse>(
    operation: (transaction: FreightRulesTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse>
}

export function createFreightRulesUseCase(dependencies: {
  readonly fingerprintService: FreightRulesFingerprintPort
  readonly unitOfWork: FreightRulesUnitOfWorkPort
}): {
  readonly activate: (input: ChangeFreightRuleStatusInput) => Promise<void>
  readonly create: (input: CreateFreightRuleInput) => Promise<FreightRuleSummary>
  readonly deactivate: (input: ChangeFreightRuleStatusInput) => Promise<void>
  readonly findApplicableVersion: (
    input: FindApplicableVersionInput,
  ) => Promise<Record<string, string> | null>
  readonly list: (input: ListFreightRulesInput) => Promise<{
    readonly items: readonly FreightRuleSummary[]
    readonly nextCursor: string | null
  }>
  readonly update: (input: UpdateFreightRuleInput) => Promise<void>
} {
  let authenticatedCompanyId: string | null = null

  return {
    activate: async (input) => {
      authenticatedCompanyId = input.context.companyId
      await dependencies.unitOfWork.execute((transaction) =>
        changeRuleStatus({
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          freightRuleId: input.freightRuleId,
          nextStatus: 'active',
          transaction,
          userId: input.context.userId,
        }),
      )
    },
    create: async (input) => {
      authenticatedCompanyId = input.context.companyId
      const fingerprint = await dependencies.fingerprintService.create({
        fields: createCreateFingerprintFields(input),
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

        const createdRule = await transaction.createRule({
          companyId: input.context.companyId,
          createdByUserId: input.context.userId,
          currentVersion: '1',
          description: input.description,
          name: input.name,
          priority: input.priority,
          status: 'draft',
          type: 'percentage_of_invoice_total',
        })

        await transaction.createRuleVersion(
          createRuleVersionRecord({
            companyId: input.context.companyId,
            createdByUserId: input.context.userId,
            freightRuleId: createdRule.id,
            freightRuleVersionId: null,
            maximumAmount: input.maximumAmount,
            minimumAmount: input.minimumAmount,
            percentage: input.percentage,
            status: 'draft',
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            version: '1',
          }),
        )

        await transaction.appendAudit({
          action: 'freight-rule.created',
          actorUserId: input.context.userId,
          afterSnapshot: {
            currentVersion: createdRule.currentVersion,
            freightRuleId: createdRule.id,
            priority: createdRule.priority,
            status: createdRule.status,
            type: createdRule.type,
          },
          beforeSnapshot: null,
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          entityId: createdRule.id,
          entityType: 'freight-rule',
        })
        await transaction.saveIdempotency({
          companyId: input.context.companyId,
          fingerprint,
          idempotencyKey: input.idempotencyKey,
          operation: CREATE_OPERATION,
          response: createdRule,
        })

        return createdRule
      })
    },
    deactivate: async (input) => {
      authenticatedCompanyId = input.context.companyId
      await dependencies.unitOfWork.execute((transaction) =>
        changeRuleStatus({
          companyId: input.context.companyId,
          correlationId: input.correlationId,
          freightRuleId: input.freightRuleId,
          nextStatus: 'inactive',
          transaction,
          userId: input.context.userId,
        }),
      )
    },
    findApplicableVersion: async (input) => {
      const companyId = authenticatedCompanyId ?? input.companyId
      return dependencies.unitOfWork.execute((transaction) =>
        transaction.findApplicableVersion({
          companyId,
          issuedAt: input.issuedAt,
          ruleType: input.ruleType,
        }),
      )
    },
    list: async (input) => {
      authenticatedCompanyId = input.context.companyId
      return dependencies.unitOfWork.execute((transaction) =>
        transaction.listRules({
          companyId: input.context.companyId,
          cursor: input.cursor,
          limit: input.limit,
        }),
      )
    },
    update: async (input) => {
      authenticatedCompanyId = input.context.companyId
      await dependencies.unitOfWork.execute(async (transaction) => {
        const nextVersion = incrementVersion(input.expectedCurrentVersion)
        await transaction.createRuleVersion(
          createRuleVersionRecord({
            companyId: input.context.companyId,
            createdByUserId: input.context.userId,
            freightRuleId: input.freightRuleId,
            freightRuleVersionId: null,
            maximumAmount: input.maximumAmount,
            minimumAmount: input.minimumAmount,
            percentage: input.percentage,
            status: 'draft',
            validFrom: input.validFrom,
            validUntil: input.validUntil,
            version: nextVersion,
          }),
        )

        await transaction.updateCurrentVersion({
          companyId: input.context.companyId,
          currentVersion: nextVersion,
          freightRuleId: input.freightRuleId,
          previousVersion: input.expectedCurrentVersion,
        })
      })
    },
  }
}

async function changeRuleStatus(input: {
  readonly companyId: string
  readonly correlationId: string
  readonly freightRuleId: string
  readonly nextStatus: 'active' | 'inactive'
  readonly transaction: FreightRulesTransactionPort
  readonly userId: string
}): Promise<void> {
  try {
    await input.transaction.setRuleStatus({
      companyId: input.companyId,
      freightRuleId: input.freightRuleId,
      nextStatus: input.nextStatus,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'FREIGHT_RULE_OVERLAP_CONFLICT') {
      throw new ApiError({
        code: 'FREIGHT_RULE_CONFLICT',
        message: 'Freight rule conflict',
        status: 409,
      })
    }
    throw error
  }
}

function createCreateFingerprintFields(input: CreateFreightRuleInput): readonly Uint8Array[] {
  const values = [
    input.context.companyId,
    input.name,
    input.description,
    input.priority,
    input.percentage,
    input.minimumAmount ?? '',
    input.maximumAmount ?? '',
    input.validFrom,
    input.validUntil ?? '',
  ]

  return values.map((value) => TEXT_ENCODER.encode(value))
}

function createIdempotencyConflict(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}

function createRuleVersionRecord(input: {
  readonly companyId: string
  readonly createdByUserId: string
  readonly freightRuleId: string
  readonly freightRuleVersionId: string | null
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly status: FreightRuleStatus
  readonly validFrom: string
  readonly validUntil: string | null
  readonly version: string
}): FreightRuleVersionRecord {
  const snapshot = createFreightRuleSnapshot({
    freightRuleId: input.freightRuleId,
    freightRuleVersionId: input.freightRuleVersionId ?? 'rule-version-001',
    maximumAmount: input.maximumAmount,
    minimumAmount: input.minimumAmount,
    percentage: input.percentage,
    ruleVersion: input.version,
    type: 'percentage_of_invoice_total',
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  })

  return {
    companyId: input.companyId,
    createdByUserId: input.createdByUserId,
    filters: {},
    freightRuleId: input.freightRuleId,
    maximumAmount: snapshot.maximumAmount,
    minimumAmount: snapshot.minimumAmount,
    percentage: snapshot.percentage,
    snapshot,
    status: input.status,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    version: input.version,
  }
}

function incrementVersion(value: string): string {
  return (BigInt(value) + 1n).toString()
}
