/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CteEmissionProfileDetail,
  CteEmissionProfilePage,
} from '../../src/cte-profiles/application/cte-emission-profile.port'

export const CTE_PROFILES_PATH = '/cte-emission-profiles'
export const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
export const PROFILE_ID = '00000000-0000-4000-8000-000000000903'
export const FREIGHT_RULE_ID = '00000000-0000-4000-8000-000000000904'
export const COMPANY_ID = '00000000-0000-4000-8000-000000000901'
export const IDEMPOTENCY_KEY = 'cte-profile-http-key-00001'
export const CORRELATION_ID = 'cte-profiles-http-correlation'

export const PROFILE_SETTINGS_BODY = {
  cargoInsuranceDeclared: true,
  cfopInternal: '5353',
  cfopInterstate: '6353',
  chargeComponentLabel: 'Frete Spani 4,5',
  deliveryDays: '1',
  groupingMode: 'per_invoice',
  icmsBaseReductionRate: '0.000000',
  icmsCst: '00',
  icmsRate: '0.120000',
  matchMode: 'sender_tax_id',
  modal: '01',
  name: 'Spani',
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
} as const

export const FREIGHT_RULE_BODY = {
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0.045000',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
} as const

export const MATCHERS_BODY = [{ matchRole: 'sender', taxId: '05868574' }] as const

export const COMPONENTS_BODY = [
  {
    amount: null,
    calculationType: 'percentage_of_cargo',
    label: 'GRIS',
    ordinal: '1',
    rate: '0.003000',
    validFrom: '2026-01-01T00:00:00.000Z',
    validUntil: null,
  },
] as const

export const CREATE_PROFILE_BODY = {
  components: COMPONENTS_BODY,
  freightRule: FREIGHT_RULE_BODY,
  matchers: MATCHERS_BODY,
  settings: PROFILE_SETTINGS_BODY,
} as const

export const UPDATE_PROFILE_BODY = {
  ...CREATE_PROFILE_BODY,
  expectedVersion: '1',
} as const

export const PROFILE_DETAIL: CteEmissionProfileDetail = {
  ...PROFILE_SETTINGS_BODY,
  companyId: COMPANY_ID,
  components: COMPONENTS_BODY,
  createdAt: '2026-07-27T12:00:00.000Z',
  freightRule: FREIGHT_RULE_BODY,
  freightRuleId: FREIGHT_RULE_ID,
  id: PROFILE_ID,
  matchers: MATCHERS_BODY,
  status: 'draft',
  updatedAt: '2026-07-27T12:00:00.000Z',
  version: '1',
}

export const PROFILES_PAGE: CteEmissionProfilePage = {
  items: [PROFILE_DETAIL],
  nextCursor: null,
}

export function serializeProfileDetail(profile: CteEmissionProfileDetail): object {
  return {
    cargoInsuranceDeclared: profile.cargoInsuranceDeclared,
    cfopInternal: profile.cfopInternal,
    cfopInterstate: profile.cfopInterstate,
    chargeComponentLabel: profile.chargeComponentLabel,
    components: profile.components.map((component) => ({ ...component })),
    createdAt: profile.createdAt,
    deliveryDays: profile.deliveryDays,
    freightRule: { ...profile.freightRule },
    freightRuleId: profile.freightRuleId,
    groupingMode: profile.groupingMode,
    icmsBaseReductionRate: profile.icmsBaseReductionRate,
    icmsCst: profile.icmsCst,
    icmsRate: profile.icmsRate,
    id: profile.id,
    matchers: profile.matchers.map((matcher) => ({ ...matcher })),
    matchMode: profile.matchMode,
    modal: profile.modal,
    name: profile.name,
    observations: profile.observations,
    operationNature: profile.operationNature,
    pickupDetails: profile.pickupDetails,
    pickupIndicator: profile.pickupIndicator,
    predominantProductMode: profile.predominantProductMode,
    predominantProductName: profile.predominantProductName,
    priority: profile.priority,
    receiverIeIndicator: profile.receiverIeIndicator,
    serviceType: profile.serviceType,
    status: profile.status,
    taker: profile.taker,
    updatedAt: profile.updatedAt,
    version: profile.version,
  }
}

export function jsonRequest(input: {
  readonly body?: unknown
  readonly idempotencyKey?: string | null
  readonly method: string
  readonly path: string
}): Request {
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    headers['idempotency-key'] = input.idempotencyKey
  }

  return new Request(`${FRONTEND_ORIGIN}${input.path}`, {
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
}

export async function responseApiError(response: Response): Promise<{
  readonly code: string
  readonly message: string
}> {
  const payload = (await response.json()) as {
    readonly error: { readonly code: string; readonly message: string }
  }
  return payload.error
}
