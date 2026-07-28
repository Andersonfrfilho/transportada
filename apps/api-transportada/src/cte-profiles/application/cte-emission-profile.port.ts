/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteChargeCalculationType,
  CteEmissionGroupingMode,
  CteEmissionMatchRole,
  CteEmissionProfileMatchMode,
  CteEmissionProfileStatus,
  CteIcmsCst,
  CteModal,
  CtePickupIndicator,
  CtePredominantProductMode,
  CteReceiverIeIndicator,
  CteServiceType,
  CteTaker,
} from '../../database/cte-emission-profile.schema.js'

export type CteEmissionProfileCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type CteEmissionProfileMatcherInput = {
  readonly matchRole: CteEmissionMatchRole
  readonly taxId: string
}

export type CteEmissionProfileComponentInput = {
  readonly amount: string | null
  readonly calculationType: CteChargeCalculationType
  readonly label: string
  readonly ordinal: string
  readonly rate: string | null
  readonly validFrom: string
  readonly validUntil: string | null
}

export type CteEmissionProfileFreightRuleInput = {
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly validFrom: string
  readonly validUntil: string | null
}

export type CteEmissionProfileSettings = {
  readonly cargoInsuranceDeclared: boolean
  readonly cfopInternal: string
  readonly cfopInterstate: string
  readonly chargeComponentLabel: string
  readonly deliveryDays: string
  readonly groupingMode: CteEmissionGroupingMode
  readonly icmsBaseReductionRate: string
  readonly icmsCst: CteIcmsCst
  readonly icmsRate: string
  readonly matchMode: CteEmissionProfileMatchMode
  readonly modal: CteModal
  readonly name: string
  readonly observations: string
  readonly operationNature: string
  readonly pickupDetails: string
  readonly pickupIndicator: CtePickupIndicator
  readonly predominantProductMode: CtePredominantProductMode
  readonly predominantProductName: string
  readonly priority: string
  readonly receiverIeIndicator: CteReceiverIeIndicator
  readonly serviceType: CteServiceType
  readonly taker: CteTaker
}

export type CteEmissionProfileDetail = CteEmissionProfileSettings & {
  readonly companyId: string
  readonly components: readonly CteEmissionProfileComponentInput[]
  readonly createdAt: string
  readonly freightRule: CteEmissionProfileFreightRuleInput
  readonly freightRuleId: string
  readonly id: string
  readonly matchers: readonly CteEmissionProfileMatcherInput[]
  readonly status: CteEmissionProfileStatus
  readonly updatedAt: string
  readonly version: string
}

export type CteEmissionProfileFilters = {
  readonly nameContains?: string
  readonly statusEq?: CteEmissionProfileStatus
}

export type CteEmissionProfilePage = {
  readonly items: readonly CteEmissionProfileDetail[]
  readonly nextCursor: string | null
}

export type CteEmissionProfileAuditRecord = {
  readonly action: string
  readonly actorUserId: string
  readonly afterSnapshot: Readonly<Record<string, unknown>> | null
  readonly beforeSnapshot: Readonly<Record<string, unknown>> | null
  readonly companyId: string
  readonly correlationId: string
  readonly entityId: string
  readonly entityType: string
}

export type CteEmissionProfileFingerprintPort = {
  create(input: {
    readonly fields: readonly Uint8Array[]
    readonly operation: string
  }): Promise<string>
}

export type CteEmissionProfileTransactionPort = {
  appendAudit(record: CteEmissionProfileAuditRecord): Promise<void>
  createFreightRule(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly description: string
    readonly name: string
    readonly priority: string
  }): Promise<{ readonly freightRuleId: string }>
  createProfile(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly freightRule: CteEmissionProfileFreightRuleInput
    readonly freightRuleId: string
    readonly settings: CteEmissionProfileSettings
  }): Promise<CteEmissionProfileDetail>
  findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
    readonly operation: string
  }): Promise<{
    readonly fingerprint: string
    readonly response: CteEmissionProfileDetail
  } | null>
  findProfile(input: {
    readonly companyId: string
    readonly profileId: string
  }): Promise<CteEmissionProfileDetail | null>
  listProfiles(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: CteEmissionProfileFilters
    readonly limit: number
  }): Promise<CteEmissionProfilePage>
  /** Inserts the next freight rule version and points the rule at it. */
  openFreightRuleVersion(input: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly freightRule: CteEmissionProfileFreightRuleInput
    readonly freightRuleId: string
  }): Promise<{ readonly version: string }>
  replaceComponents(input: {
    readonly companyId: string
    readonly components: readonly CteEmissionProfileComponentInput[]
    readonly profileId: string
  }): Promise<void>
  replaceMatchers(input: {
    readonly companyId: string
    readonly matchers: readonly CteEmissionProfileMatcherInput[]
    readonly profileId: string
  }): Promise<void>
  saveIdempotency(input: {
    readonly companyId: string
    readonly fingerprint: string
    readonly idempotencyKey: string
    readonly operation: string
    readonly response: CteEmissionProfileDetail
  }): Promise<void>
  setFreightRuleStatus(input: {
    readonly companyId: string
    readonly freightRuleId: string
    readonly nextStatus: 'active' | 'inactive'
  }): Promise<void>
  updateProfile(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly freightRule: CteEmissionProfileFreightRuleInput
    readonly profileId: string
    readonly settings: CteEmissionProfileSettings
  }): Promise<CteEmissionProfileDetail | null>
  updateProfileStatus(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly nextStatus: CteEmissionProfileStatus
    readonly profileId: string
  }): Promise<CteEmissionProfileDetail | null>
}

export type CteEmissionProfilesUnitOfWorkPort = {
  execute<TResponse>(
    operation: (transaction: CteEmissionProfileTransactionPort) => Promise<TResponse>,
  ): Promise<TResponse>
}
