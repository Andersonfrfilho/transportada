/* Copyright (c) 2026 Ada Technology. MIT License. */
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  FINANCIAL_RESULTS_PATH,
  type FinancialSummary,
  type FinancialSummaryGroup,
  type TripFinancialResult,
} from './tripFinancials.types'
import { toFinancialSummary, toTripFinancialResult } from './tripFinancialsResponse.validation'
import { toTripValuation } from './tripValuationResponse.validation'
import type { TripValuation } from './tripValuation.service'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type TripFinancialsClient = Readonly<{
  readResult: (tripId: string) => Promise<TripFinancialResult | null>
  /** A conta **prevista** da viagem aberta — a congelada só nasce quando ela fecha. */
  readValuation: (tripId: string) => Promise<TripValuation | null>
  readSummary: (
    input: Readonly<{ from: string; groupBy: FinancialSummaryGroup; to: string }>,
  ) => Promise<FinancialSummary>
  recalculate: (
    input: Readonly<{ reason: string; tripId: string }>,
  ) => Promise<TripFinancialResult | null>
  recordCost: (
    input: Readonly<{
      amount: string
      description: string
      kind: 'other' | 'toll'
      tripId: string
    }>,
  ) => Promise<void>
}>

export function createTripFinancialsClient(dependencies: ClientDependencies): TripFinancialsClient {
  return {
    async readResult(tripId) {
      return toTripFinancialResult(
        await request({ dependencies, method: 'GET', path: `/trips/${tripId}/financial-result` }),
      )
    },
    async readValuation(tripId) {
      return toTripValuation(
        await request({ dependencies, method: 'GET', path: `/trips/${tripId}/valuation` }),
      )
    },
    async readSummary({ from, groupBy, to }) {
      const parameters = new URLSearchParams({ from, groupBy, to })
      return toFinancialSummary(
        await request({
          dependencies,
          method: 'GET',
          path: `${FINANCIAL_RESULTS_PATH}?${parameters.toString()}`,
        }),
      )
    },
    async recalculate({ reason, tripId }) {
      return toTripFinancialResult(
        await request({
          body: JSON.stringify({ reason }),
          dependencies,
          method: 'POST',
          path: `/trips/${tripId}/financial-result/recalculate`,
        }),
      )
    },
    async recordCost({ amount, description, kind, tripId }) {
      await request({
        body: JSON.stringify({ amount, description, kind }),
        dependencies,
        method: 'POST',
        path: `/trips/${tripId}/costs`,
      })
    },
  }
}

export function getTripFinancialsClient(): TripFinancialsClient {
  return createTripFinancialsClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (input, init) => fetch(input, init),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

async function request(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  let response: Response
  try {
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        ...(input.body === undefined ? {} : { body: input.body }),
        cache: 'no-store',
        headers,
        method: input.method,
      }),
    )
  } catch {
    throw new Error('REQUEST_FAILED')
  }

  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw new Error('RESPONSE_INVALID')
  }
  if (!response.ok) throw new Error(readErrorCode(payload))

  return payload
}

function readErrorCode(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'REQUEST_FAILED'
  const error = (payload as { readonly error?: { readonly code?: unknown } }).error
  return typeof error?.code === 'string' ? error.code : 'REQUEST_FAILED'
}
