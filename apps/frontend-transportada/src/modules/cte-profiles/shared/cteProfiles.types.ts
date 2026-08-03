/* Copyright (c) 2026 Ada Technology. MIT License. */
export type CteProfileStatus = 'active' | 'draft' | 'inactive'
export type CteProfileGroupingMode = 'per_invoice' | 'sender_recipient'
export type CteProfileMatchMode = 'manual' | 'sender_tax_id'
export type CteProfilePredominantProductMode =
  | 'fixed'
  | 'highest_quantity'
  | 'highest_value'
  | 'highest_weight'
export type CteProfileComponentCalculation =
  | 'fixed_amount'
  | 'percentage_of_cargo'
  | 'percentage_of_freight'

export const CTE_PROFILE_MATCH_MODE = ['manual', 'sender_tax_id'] as const
export const CTE_PROFILE_GROUPING_MODE = ['per_invoice', 'sender_recipient'] as const
export const CTE_PROFILE_MATCH_ROLE = ['recipient', 'sender'] as const
export const CTE_PROFILE_PREDOMINANT_PRODUCT_MODE = [
  'fixed',
  'highest_value',
  'highest_weight',
  'highest_quantity',
] as const
export const CTE_PROFILE_COMPONENT_CALCULATION = [
  'fixed_amount',
  'percentage_of_cargo',
  'percentage_of_freight',
] as const
export const CTE_PROFILE_ICMS_CST = ['00', '20', '40', '41', '51', '60', '90'] as const
export const CTE_PROFILE_MODAL = ['01', '02', '03', '04', '05'] as const
export const CTE_PROFILE_SERVICE_TYPE = ['0', '1', '2', '3', '4'] as const
export const CTE_PROFILE_TAKER = ['0', '1', '2', '3'] as const
export const CTE_PROFILE_RECEIVER_IE_INDICATOR = ['1', '2', '9'] as const
export const CTE_PROFILE_PICKUP_INDICATOR = ['0', '1'] as const

export type CteProfileSettings = Readonly<{
  cargoInsuranceDeclared: boolean
  cfopInternal: string
  cfopInterstate: string
  chargeComponentLabel: string
  deliveryDays: string
  groupingMode: CteProfileGroupingMode
  icmsBaseReductionRate: string
  icmsCst: (typeof CTE_PROFILE_ICMS_CST)[number]
  icmsRate: string
  matchMode: CteProfileMatchMode
  modal: (typeof CTE_PROFILE_MODAL)[number]
  name: string
  observations: string
  operationNature: string
  pickupDetails: string
  pickupIndicator: (typeof CTE_PROFILE_PICKUP_INDICATOR)[number]
  predominantProductMode: CteProfilePredominantProductMode
  predominantProductName: string
  priority: string
  receiverIeIndicator: (typeof CTE_PROFILE_RECEIVER_IE_INDICATOR)[number]
  serviceType: (typeof CTE_PROFILE_SERVICE_TYPE)[number]
  taker: (typeof CTE_PROFILE_TAKER)[number]
}>

export type CteProfileFreightRule = Readonly<{
  maximumAmount: null | string
  minimumAmount: null | string
  percentage: string
  validFrom: string
  validUntil: null | string
}>

export type CteProfileComponent = Readonly<{
  amount: null | string
  calculationType: CteProfileComponentCalculation
  label: string
  ordinal: string
  rate: null | string
  validFrom: string
  validUntil: null | string
}>

export type CteProfileMatcher = Readonly<{
  matchRole: 'recipient' | 'sender'
  taxId: string
}>

export type CteProfileBody = Readonly<{
  components: readonly CteProfileComponent[]
  freightRule: CteProfileFreightRule
  matchers: readonly CteProfileMatcher[]
  settings: CteProfileSettings
}>

export type CteProfileDetail = CteProfileSettings &
  Readonly<{
    components: readonly CteProfileComponent[]
    createdAt: string
    freightRule: CteProfileFreightRule
    freightRuleId: string
    id: string
    matchers: readonly CteProfileMatcher[]
    status: CteProfileStatus
    updatedAt: string
    version: string
  }>

export type CteProfileListPage = Readonly<{
  items: readonly CteProfileDetail[]
  nextCursor: null | string
}>

export type CteProfileFilters = Readonly<{
  nameContains?: string
  statusEq?: CteProfileStatus
}>

export type CteProfileVersionInput = Readonly<{
  expectedVersion: string
  profileId: string
}>
