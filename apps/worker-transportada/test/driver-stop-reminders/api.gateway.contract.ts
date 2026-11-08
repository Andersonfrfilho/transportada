/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.4: a porta do robô do lembrete ao motorista. Mesmo contrato do robô do canhoto — token de
 * cliente, empresa no cabeçalho, status mapeado a resultado e nada do corpo ou do segredo no erro.
 */
import { describe, expect, test } from 'bun:test'

import { DriverStopReminderApiError } from '../../src/driver-stop-reminders/application/driver-stop-reminder-api.error.js'
import { createDriverStopReminderApiGateway } from '../../src/driver-stop-reminders/infrastructure/driver-stop-reminder-api.gateway.js'

const CONFIGURATION = {
  apiBaseUrl: 'https://api.example.test/',
  clientId: 'worker-client',
  clientSecret: 'segredo-do-worker',
  tokenUrl: 'https://idp.example.test/token',
} as const
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const REMINDER_ID = '22222222-2222-4222-8222-222222222222'
const PARAMS = { companyId: COMPANY_ID, reminderId: REMINDER_ID } as const

type Call = { readonly headers: Headers; readonly method: string; readonly url: string }

function buildGateway(input: {
  readonly apiBody?: unknown
  readonly apiStatus?: number
  readonly clock?: { value: number }
  readonly throwOnApi?: boolean
  readonly tokenResponse?: () => Response
}) {
  const calls: Call[] = []
  const clock = input.clock ?? { value: 0 }
  const gateway = createDriverStopReminderApiGateway({
    configuration: CONFIGURATION,
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({
        headers: new Headers(init?.headers),
        method: String(init?.method),
        url: String(url),
      })
      if (String(url) === CONFIGURATION.tokenUrl) {
        return (
          input.tokenResponse?.() ??
          Response.json({ access_token: 'token-de-mentira', expires_in: 300 })
        )
      }
      if (input.throwOnApi === true) throw new TypeError('connection refused')
      const status = input.apiStatus ?? 200
      return status === 200
        ? Response.json(input.apiBody ?? { data: { nextDueAt: null, outcome: 'sent' } })
        : new Response(JSON.stringify({ secret: CONFIGURATION.clientSecret }), { status })
    }) as unknown as typeof globalThis.fetch,
    now: () => clock.value,
  })
  return { calls, clock, gateway }
}

async function outcomeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  )
  if (!(error instanceof DriverStopReminderApiError)) {
    throw new Error(`unexpected: ${String(error)}`)
  }
  return error.outcome
}

describe('occurrence automatic mail api gateway', () => {
  test('posts the robot route with the tenant and the bearer token', async () => {
    const { calls, gateway } = buildGateway({})

    const result = await gateway.deliver(PARAMS)

    expect(result).toEqual({ nextDueAt: null, outcome: 'sent' })
    expect(new Headers(calls[0]?.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    )
    const call = calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.url).toBe(`https://api.example.test/driver-stop-reminders/${REMINDER_ID}/delivery`)
    expect(call?.headers.get('authorization')).toBe('Bearer token-de-mentira')
    expect(call?.headers.get('x-company-id')).toBe(COMPANY_ID)
  })

  test('reads the outcome and the next due date from the envelope', async () => {
    for (const outcome of ['deferred', 'closed', 'escalated'] as const) {
      const nextDueAt = outcome === 'deferred' ? '2026-11-09T11:00:00.000Z' : null
      const { gateway } = buildGateway({ apiBody: { data: { nextDueAt, outcome } } })
      expect(await gateway.deliver(PARAMS)).toEqual({ nextDueAt, outcome })
    }
  })

  test('reuses the token until 30 seconds before it expires', async () => {
    const { calls, clock, gateway } = buildGateway({})
    const tokenCalls = () => calls.filter((call) => call.url === CONFIGURATION.tokenUrl).length

    await gateway.deliver(PARAMS)
    clock.value = 269_999
    await gateway.deliver(PARAMS)
    expect(tokenCalls()).toBe(1)

    clock.value = 270_000
    await gateway.deliver(PARAMS)
    expect(tokenCalls()).toBe(2)
  })

  test('maps 400, 404 and 409 to request_rejected', async () => {
    for (const apiStatus of [400, 404, 409]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(await outcomeOf(gateway.deliver(PARAMS))).toBe('request_rejected')
    }
  })

  test('maps 401 and 403 to api_unauthorized and drops the cached token on 401', async () => {
    for (const apiStatus of [401, 403]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(await outcomeOf(gateway.deliver(PARAMS))).toBe('api_unauthorized')
    }

    const { calls, gateway } = buildGateway({ apiStatus: 401 })
    await gateway.deliver(PARAMS).catch(() => undefined)
    await gateway.deliver(PARAMS).catch(() => undefined)
    expect(calls.filter((call) => call.url === CONFIGURATION.tokenUrl)).toHaveLength(2)
  })

  test('maps 5xx, 429 and a refused connection to api_unreachable', async () => {
    for (const apiStatus of [429, 500, 503]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(await outcomeOf(gateway.deliver(PARAMS))).toBe('api_unreachable')
    }
    const { gateway } = buildGateway({ throwOnApi: true })
    expect(await outcomeOf(gateway.deliver(PARAMS))).toBe('api_unreachable')
  })

  test('classifies a token endpoint refusal by status', async () => {
    const refused = buildGateway({ tokenResponse: () => new Response('', { status: 401 }) })
    const down = buildGateway({ tokenResponse: () => new Response('', { status: 503 }) })

    expect(await outcomeOf(refused.gateway.deliver(PARAMS))).toBe('api_unauthorized')
    expect(await outcomeOf(down.gateway.deliver(PARAMS))).toBe('api_unreachable')
  })

  test('a 200 with an unknown outcome is treated as unreachable, never as sent', async () => {
    const { gateway } = buildGateway({ apiBody: { data: { outcome: 'weird' } } })

    expect(await outcomeOf(gateway.deliver(PARAMS))).toBe('api_unreachable')
  })

  test('never carries the response body or the client secret into the error', async () => {
    const { gateway } = buildGateway({ apiStatus: 400 })

    const error = await gateway.deliver(PARAMS).catch((caught: unknown) => caught)

    expect(String(error)).not.toContain(CONFIGURATION.clientSecret)
    expect(String(error)).toContain('400')
  })

  test('reconcile posts the reconciliation route with the tenant and reads the opened count', async () => {
    const { calls, gateway } = buildGateway({ apiBody: { data: { openedCount: 3 } } })

    expect(await gateway.reconcile({ companyId: COMPANY_ID })).toEqual({ openedCount: 3 })

    const call = calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.url).toBe('https://api.example.test/driver-stop-reminders/reconciliation')
    expect(call?.headers.get('authorization')).toBe('Bearer token-de-mentira')
    expect(call?.headers.get('x-company-id')).toBe(COMPANY_ID)
  })

  test('reconcile maps statuses like delivery and rejects a body without a count', async () => {
    const forbidden = buildGateway({ apiStatus: 403 })
    const down = buildGateway({ apiStatus: 503 })
    const malformed = buildGateway({ apiBody: { data: {} } })

    expect(await outcomeOf(forbidden.gateway.reconcile({ companyId: COMPANY_ID }))).toBe(
      'api_unauthorized',
    )
    expect(await outcomeOf(down.gateway.reconcile({ companyId: COMPANY_ID }))).toBe(
      'api_unreachable',
    )
    expect(await outcomeOf(malformed.gateway.reconcile({ companyId: COMPANY_ID }))).toBe(
      'api_unreachable',
    )
  })
})
