/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
  freightRuleVersions,
} from '../../database/database.schema.js'
import type {
  CteEmissionProfileComponentInput,
  CteEmissionProfileDetail,
  CteEmissionProfileFreightRuleInput,
  CteEmissionProfileMatcherInput,
} from '../application/cte-emission-profile.port.js'

type ProfileRecord = typeof cteEmissionProfiles.$inferSelect
type MatcherRecord = typeof cteEmissionProfileMatchers.$inferSelect
type ComponentRecord = typeof cteEmissionProfileComponents.$inferSelect
type FreightRuleVersionRecord = typeof freightRuleVersions.$inferSelect

export function mapFreightRule(
  record: FreightRuleVersionRecord,
): CteEmissionProfileFreightRuleInput {
  return {
    maximumAmount: record.maximumAmount,
    minimumAmount: record.minimumAmount,
    percentage: record.percentage,
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil === null ? null : record.validUntil.toISOString(),
  }
}

export function mapMatcher(record: MatcherRecord): CteEmissionProfileMatcherInput {
  return { matchRole: record.matchRole, taxId: record.taxId }
}

export function mapComponent(record: ComponentRecord): CteEmissionProfileComponentInput {
  return {
    amount: record.amount,
    calculationType: record.calculationType,
    label: record.label,
    ordinal: record.ordinal.toString(),
    rate: record.rate,
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil === null ? null : record.validUntil.toISOString(),
  }
}

export function mapProfile(input: {
  readonly components: readonly ComponentRecord[]
  readonly freightRule: CteEmissionProfileFreightRuleInput
  readonly matchers: readonly MatcherRecord[]
  readonly record: ProfileRecord
}): CteEmissionProfileDetail {
  const { record } = input

  return {
    cargoInsuranceDeclared: record.cargoInsuranceDeclared,
    cfopInternal: record.cfopInternal,
    cfopInterstate: record.cfopInterstate,
    chargeComponentLabel: record.chargeComponentLabel,
    companyId: record.companyId,
    components: input.components.map(mapComponent),
    createdAt: record.createdAt.toISOString(),
    deliveryDays: record.deliveryDays.toString(),
    freightRule: input.freightRule,
    freightRuleId: record.freightRuleId,
    groupingMode: record.groupingMode,
    icmsBaseReductionRate: record.icmsBaseReductionRate,
    icmsCst: record.icmsCst,
    icmsRate: record.icmsRate,
    id: record.id,
    matchers: input.matchers.map(mapMatcher),
    matchMode: record.matchMode,
    modal: record.modal,
    name: record.name,
    observations: record.observations,
    operationNature: record.operationNature,
    pickupDetails: record.pickupDetails,
    pickupIndicator: record.pickupIndicator,
    predominantProductMode: record.predominantProductMode,
    predominantProductName: record.predominantProductName,
    priority: record.priority.toString(),
    receiverIeIndicator: record.receiverIeIndicator,
    serviceType: record.serviceType,
    status: record.status,
    taker: record.taker,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
  }
}
