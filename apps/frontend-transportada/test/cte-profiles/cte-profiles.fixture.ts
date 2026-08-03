/* Copyright (c) 2026 Ada Technology. MIT License. */
export const SETTINGS_MANAGE = 'settings.manage'
export const SYNTHETIC_ACCESS_TOKEN = 'synthetic-access-token'
export const SYNTHETIC_CURSOR = '2026-07-27T12:00:00.000Z::00000000-0000-4000-8000-000000000903'
export const SYNTHETIC_IDEMPOTENCY_KEY = 'cte-profile-contract-key-0001'
export const PROFILE_ID = '00000000-0000-4000-8000-000000000903'
export const FREIGHT_RULE_ID = '00000000-0000-4000-8000-000000000904'

export type CteProfileSettingsContract = Readonly<{
  cargoInsuranceDeclared: boolean
  cfopInternal: string
  cfopInterstate: string
  chargeComponentLabel: string
  deliveryDays: string
  groupingMode: 'per_invoice' | 'sender_recipient'
  icmsBaseReductionRate: string
  icmsCst: '00' | '20' | '40' | '41' | '51' | '60' | '90'
  icmsRate: string
  matchMode: 'manual' | 'sender_tax_id'
  modal: '01' | '02' | '03' | '04' | '05'
  name: string
  observations: string
  operationNature: string
  pickupDetails: string
  pickupIndicator: '0' | '1'
  predominantProductMode: 'fixed' | 'highest_quantity' | 'highest_value' | 'highest_weight'
  predominantProductName: string
  priority: string
  receiverIeIndicator: '1' | '2' | '9'
  serviceType: '0' | '1' | '2' | '3' | '4'
  taker: '0' | '1' | '2' | '3'
}>

export type CteProfileFreightRuleContract = Readonly<{
  maximumAmount: null | string
  minimumAmount: null | string
  percentage: string
  validFrom: string
  validUntil: null | string
}>

export type CteProfileComponentContract = Readonly<{
  amount: null | string
  calculationType: 'fixed_amount' | 'percentage_of_cargo' | 'percentage_of_freight'
  label: string
  ordinal: string
  rate: null | string
  validFrom: string
  validUntil: null | string
}>

export type CteProfileMatcherContract = Readonly<{
  matchRole: 'recipient' | 'sender'
  taxId: string
}>

export type CteProfileBodyContract = Readonly<{
  components: readonly CteProfileComponentContract[]
  freightRule: CteProfileFreightRuleContract
  matchers: readonly CteProfileMatcherContract[]
  settings: CteProfileSettingsContract
}>

export type CteProfileDetailContract = CteProfileSettingsContract &
  Readonly<{
    components: readonly CteProfileComponentContract[]
    createdAt: string
    freightRule: CteProfileFreightRuleContract
    freightRuleId: string
    id: string
    matchers: readonly CteProfileMatcherContract[]
    status: 'active' | 'draft' | 'inactive'
    updatedAt: string
    version: string
  }>

export type CteProfileListPageContract = Readonly<{
  items: readonly CteProfileDetailContract[]
  nextCursor: null | string
}>

export const PROFILE_SETTINGS = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete',
  deliveryDays: '1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '00',
  icmsRate: '0.120000',
  matchMode: 'sender_tax_id',
  modal: '01',
  name: 'Perfil padrão',
  observations: '',
  operationNature: 'PRESTACAO DE SERVICO DE TRANSPORTE',
  pickupDetails: '',
  pickupIndicator: '1',
  predominantProductMode: 'highest_value',
  predominantProductName: '',
  priority: '10',
  receiverIeIndicator: '1',
  serviceType: '0',
  taker: '3',
} as const satisfies CteProfileSettingsContract

export const PROFILE_FREIGHT_RULE = {
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0.045000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
} as const satisfies CteProfileFreightRuleContract

export const PROFILE_COMPONENTS = [
  {
    amount: null,
    calculationType: 'percentage_of_cargo',
    label: 'GRIS',
    ordinal: '1',
    rate: '0.003000',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  },
] as const satisfies readonly CteProfileComponentContract[]

export const PROFILE_MATCHERS = [
  { matchRole: 'sender', taxId: '05868574' },
] as const satisfies readonly CteProfileMatcherContract[]

export const PROFILE_BODY = {
  components: PROFILE_COMPONENTS,
  freightRule: PROFILE_FREIGHT_RULE,
  matchers: PROFILE_MATCHERS,
  settings: PROFILE_SETTINGS,
} as const satisfies CteProfileBodyContract

export const PROFILE_DETAIL = {
  ...PROFILE_SETTINGS,
  components: PROFILE_COMPONENTS,
  createdAt: '2026-07-27T12:00:00.000Z',
  freightRule: PROFILE_FREIGHT_RULE,
  freightRuleId: FREIGHT_RULE_ID,
  id: PROFILE_ID,
  matchers: PROFILE_MATCHERS,
  status: 'draft',
  updatedAt: '2026-07-27T12:00:00.000Z',
  version: '1',
} as const satisfies CteProfileDetailContract

export const PROFILE_LIST_PAGE = {
  items: [PROFILE_DETAIL],
  nextCursor: SYNTHETIC_CURSOR,
} as const satisfies CteProfileListPageContract

export const EMPTY_PROFILE_LIST_PAGE = {
  items: [],
  nextCursor: null,
} as const satisfies CteProfileListPageContract

export const PROFILE_DRAFT = {
  components: [],
  freightRule: PROFILE_FREIGHT_RULE,
  matchers: [],
  settings: { ...PROFILE_SETTINGS, name: '', priority: '1' },
} as const satisfies CteProfileBodyContract

export async function loadFutureModule<TModule>(modulePath: string): Promise<TModule> {
  return (await import(modulePath)) as TModule
}
