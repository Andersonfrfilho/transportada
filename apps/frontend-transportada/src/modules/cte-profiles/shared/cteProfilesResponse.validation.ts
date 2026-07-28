/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COMPONENT_KEYS,
  CTE_PROFILES_ERROR,
  DETAIL_KEYS,
  FREIGHT_RULE_KEYS,
  SETTINGS_KEYS,
} from './cteProfiles.constant'
import type { CteProfileDetail, CteProfileListPage } from './cteProfiles.types'
import {
  hasEveryKey,
  hasOnlyKeys,
  isIntegerString,
  isNullableMoneyDecimal,
  isNullableRateDecimal,
  isNullableString,
  isOneOf,
  isRateDecimal,
  isRecord,
  isString,
  PROFILE_ENUMS,
} from './cteProfilesGuards.validation'

function invalid(): Error {
  return new Error(CTE_PROFILES_ERROR.RESPONSE_INVALID)
}

function isFreightRule(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, FREIGHT_RULE_KEYS) &&
    hasEveryKey(value, FREIGHT_RULE_KEYS) &&
    isNullableMoneyDecimal(value.maximumAmount) &&
    isNullableMoneyDecimal(value.minimumAmount) &&
    isRateDecimal(value.percentage) &&
    isString(value.validFrom) &&
    isNullableString(value.validUntil)
  )
}

function isComponent(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, COMPONENT_KEYS) &&
    hasEveryKey(value, COMPONENT_KEYS) &&
    isNullableMoneyDecimal(value.amount) &&
    isOneOf(value.calculationType, PROFILE_ENUMS.calculationType) &&
    isString(value.label) &&
    isIntegerString(value.ordinal) &&
    isNullableRateDecimal(value.rate) &&
    isString(value.validFrom) &&
    isNullableString(value.validUntil)
  )
}

function isMatcher(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ['matchRole', 'taxId']) &&
    isOneOf(value.matchRole, PROFILE_ENUMS.matchRole) &&
    isString(value.taxId)
  )
}

function isSettings(value: Record<string, unknown>): boolean {
  return (
    hasEveryKey(value, SETTINGS_KEYS) &&
    typeof value.cargoInsuranceDeclared === 'boolean' &&
    isString(value.cfopInternal) &&
    isString(value.cfopInterstate) &&
    isString(value.chargeComponentLabel) &&
    isIntegerString(value.deliveryDays) &&
    isOneOf(value.groupingMode, PROFILE_ENUMS.groupingMode) &&
    isRateDecimal(value.icmsBaseReductionRate) &&
    isOneOf(value.icmsCst, PROFILE_ENUMS.icmsCst) &&
    isRateDecimal(value.icmsRate) &&
    isOneOf(value.matchMode, PROFILE_ENUMS.matchMode) &&
    isOneOf(value.modal, PROFILE_ENUMS.modal) &&
    isString(value.name) &&
    isString(value.observations) &&
    isString(value.operationNature) &&
    isString(value.pickupDetails) &&
    isOneOf(value.pickupIndicator, PROFILE_ENUMS.pickupIndicator) &&
    isOneOf(value.predominantProductMode, PROFILE_ENUMS.predominantProductMode) &&
    isString(value.predominantProductName) &&
    isIntegerString(value.priority) &&
    isOneOf(value.receiverIeIndicator, PROFILE_ENUMS.receiverIeIndicator) &&
    isOneOf(value.serviceType, PROFILE_ENUMS.serviceType) &&
    isOneOf(value.taker, PROFILE_ENUMS.taker)
  )
}

function isDetail(value: unknown): value is CteProfileDetail {
  if (!isRecord(value)) return false
  if (!hasOnlyKeys(value, DETAIL_KEYS) || !hasEveryKey(value, DETAIL_KEYS)) return false
  if (!isSettings(value)) return false
  return (
    Array.isArray(value.components) &&
    value.components.every(isComponent) &&
    isString(value.createdAt) &&
    isFreightRule(value.freightRule) &&
    isString(value.freightRuleId) &&
    isString(value.id) &&
    Array.isArray(value.matchers) &&
    value.matchers.every(isMatcher) &&
    isOneOf(value.status, PROFILE_ENUMS.status) &&
    isString(value.updatedAt) &&
    isIntegerString(value.version)
  )
}

export function createCteProfileResponseAdapters() {
  function profileFromApi(input: unknown): CteProfileDetail {
    if (!isDetail(input)) throw invalid()
    return input
  }

  return {
    profileFromApi,
    profileListFromApi(input: unknown): CteProfileListPage {
      if (!isRecord(input) || !Array.isArray(input.data) || !isRecord(input.page)) throw invalid()
      const nextCursor = input.page.nextCursor
      if (!isNullableString(nextCursor)) throw invalid()
      return { items: input.data.map(profileFromApi), nextCursor }
    },
  }
}
