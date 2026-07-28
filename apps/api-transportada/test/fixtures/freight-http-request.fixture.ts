/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const FREIGHT_RULES_PATH = '/freight-rules'
export const FREIGHT_SIMULATIONS_PATH = '/freight-calculations'
export const FREIGHT_CALCULATIONS_PATH = '/nfe-documents'
export const FREIGHT_RULE_ID = '00000000-0000-4000-8000-000000000301'
export const CREATE_RULE_IDEMPOTENCY_KEY = 'freight-rule-create-0001'
export const SIMULATION_IDEMPOTENCY_KEY = 'freight-simulation-create-0001'

export const CREATE_RULE_BODY = {
  description: 'Percentual padrão da operação',
  maximumAmount: null,
  minimumAmount: null,
  name: 'Regra padrão',
  percentage: '0.035000',
  priority: '10',
  validFrom: '2026-07-01T00:00:00.000Z',
  validUntil: null,
} as const

export const UPDATE_RULE_BODY = {
  expectedCurrentVersion: '1',
  filters: { destinationStates: ['MG'], senderTaxIds: ['61084018000109'] },
  maximumAmount: '900.0000',
  minimumAmount: '120.0000',
  percentage: '0.060000',
  validFrom: '2026-08-01T00:00:00.000Z',
  validUntil: null,
} as const

export const FREIGHT_SIMULATION_BODY = {
  documentId: '00000000-0000-4000-8000-000000000304',
} as const

type RequestOptions = {
  readonly body?: unknown
  readonly correlationId?: string
  readonly headers?: Record<string, string>
  readonly idempotencyKey?: string
  readonly origin?: string
  readonly query?: string
}

export function createRuleRequest(options: RequestOptions = {}): Request {
  return observedJsonRequest({
    body: options.body ?? CREATE_RULE_BODY,
    headers: {
      ...baseHeaders(options),
      ...(options.idempotencyKey === undefined
        ? { 'idempotency-key': CREATE_RULE_IDEMPOTENCY_KEY }
        : options.idempotencyKey
          ? { 'idempotency-key': options.idempotencyKey }
          : {}),
    },
    method: 'POST',
    pathname: FREIGHT_RULES_PATH,
  })
}

export function updateRuleRequest(options: RequestOptions = {}): Request {
  return observedJsonRequest({
    body: options.body ?? UPDATE_RULE_BODY,
    headers: baseHeaders(options),
    method: 'PATCH',
    pathname: `${FREIGHT_RULES_PATH}/${FREIGHT_RULE_ID}`,
  })
}

export function changeRuleStatusRequest(
  options: RequestOptions & { readonly status?: string } = {},
): Request {
  return observedJsonRequest({
    body: options.body ?? { status: options.status },
    headers: baseHeaders(options),
    method: 'PATCH',
    pathname: `${FREIGHT_RULES_PATH}/${FREIGHT_RULE_ID}/status`,
  })
}

export function freightRulesListRequest(options: RequestOptions = {}): Request {
  return new Request(`http://localhost${FREIGHT_RULES_PATH}${options.query ?? ''}`, {
    headers: baseHeaders(options),
  })
}

export function simulateFreightRequest(
  options: RequestOptions & { readonly events?: string[] } = {},
): Request {
  return observedJsonRequest({
    body: options.body ?? FREIGHT_SIMULATION_BODY,
    ...(options.events === undefined ? {} : { events: options.events }),
    headers: {
      ...baseHeaders(options),
      ...(options.idempotencyKey === undefined
        ? { 'idempotency-key': SIMULATION_IDEMPOTENCY_KEY }
        : options.idempotencyKey
          ? { 'idempotency-key': options.idempotencyKey }
          : {}),
    },
    method: 'POST',
    pathname: FREIGHT_SIMULATIONS_PATH,
  })
}

export function freightCalculationsListRequest(
  documentId: string,
  options: RequestOptions = {},
): Request {
  return new Request(
    `http://localhost${FREIGHT_CALCULATIONS_PATH}/${documentId}/freight-calculations${options.query ?? ''}`,
    {
      headers: baseHeaders(options),
    },
  )
}

export async function responseApiError(response: Response): Promise<{
  readonly error: {
    readonly code: string
    readonly correlationId: string
    readonly message: string
  }
}> {
  return (await response.json()) as {
    readonly error: {
      readonly code: string
      readonly correlationId: string
      readonly message: string
    }
  }
}

function baseHeaders(options: RequestOptions): Record<string, string> {
  return {
    authorization: 'Bearer token',
    'content-type': 'application/json',
    ...(options.correlationId ? { 'x-correlation-id': options.correlationId } : {}),
    ...(options.origin ? { origin: options.origin } : {}),
    ...(options.headers ?? {}),
  }
}

function observedJsonRequest(input: {
  readonly body: unknown
  readonly events?: string[]
  readonly headers: Record<string, string>
  readonly method: string
  readonly pathname: string
}): Request {
  const body = JSON.stringify(input.body)
  const request = new Request(`http://localhost${input.pathname}`, {
    body,
    headers: input.headers,
    method: input.method,
  })
  if (input.events === undefined) return request

  return new Proxy(request, {
    get(target, property) {
      if (property === 'body') input.events?.push('body')
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}
