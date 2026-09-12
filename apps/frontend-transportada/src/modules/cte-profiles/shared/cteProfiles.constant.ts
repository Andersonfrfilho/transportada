/* Copyright (c) 2026 Ada Technology. MIT License. */
export const CTE_PROFILES_PATH = '/cte-emission-profiles'
export const SETTINGS_MANAGE_PERMISSION = 'settings.manage'

export const CTE_PROFILES_ERROR = {
  FORBIDDEN: 'CTE_PROFILES_FORBIDDEN',
  INVALID_AMOUNT: 'CTE_PROFILES_INVALID_AMOUNT',
  INVALID_DRAFT: 'CTE_PROFILES_INVALID_DRAFT',
  INVALID_RATE: 'CTE_PROFILES_INVALID_RATE',
  REQUEST_FAILED: 'CTE_PROFILES_REQUEST_FAILED',
  RESPONSE_INVALID: 'CTE_PROFILES_RESPONSE_INVALID',
} as const

export const VERSION_CONFLICT_ERROR = 'CTE_EMISSION_PROFILE_VERSION_CONFLICT'

export const DEFAULT_FREIGHT_PERCENTAGE = '0.045000'
export const ZERO_RATE = '0.000000'
export const PROFILE_PAGE_SIZE = 25

export const SETTINGS_KEYS = [
  'cargoInsuranceDeclared',
  'municipalServicePolicy',
  'cfopInternal',
  'cfopInterstate',
  'chargeComponentLabel',
  'deliveryDays',
  'groupingMode',
  'icmsBaseReductionRate',
  'icmsCst',
  'icmsRate',
  'matchMode',
  'modal',
  'name',
  'observations',
  'operationNature',
  'pickupDetails',
  'pickupIndicator',
  'predominantProductMode',
  'predominantProductName',
  'priority',
  'receiverIeIndicator',
  'serviceType',
  'taker',
] as const

/**
 * Chaves da spec 144 que a resposta **pode** trazer. Ficam fora de `SETTINGS_KEYS` de propósito: a
 * API sobe antes da tela e, na janela entre os dois, exigi-las recusaria toda linha e a lista de
 * perfis renderizaria vazia com 200 na rede — o mesmo defeito de `VEHICLE_DETAIL_KEYS`.
 */
export const OPTIONAL_SETTINGS_KEYS = ['nfseEmissionProfileId', 'outputDocument'] as const

/** O que a resposta precisa trazer. */
export const REQUIRED_DETAIL_KEYS = [
  ...SETTINGS_KEYS,
  'components',
  'createdAt',
  'freightRule',
  'freightRuleId',
  'id',
  'matchers',
  'status',
  'updatedAt',
  'version',
] as const

/** O que a resposta pode trazer: qualquer chave fora desta lista recusa a linha. */
export const DETAIL_KEYS = [...REQUIRED_DETAIL_KEYS, ...OPTIONAL_SETTINGS_KEYS] as const

export const FREIGHT_RULE_KEYS = [
  'maximumAmount',
  'minimumAmount',
  'percentage',
  'validFrom',
  'validUntil',
] as const

export const COMPONENT_KEYS = [
  'amount',
  'calculationType',
  'label',
  'ordinal',
  'rate',
  'validFrom',
  'validUntil',
] as const

export const MATCHER_KEYS = ['matchRole', 'taxId'] as const

export const PROFILE_BODY_KEYS = ['components', 'freightRule', 'matchers', 'settings'] as const
