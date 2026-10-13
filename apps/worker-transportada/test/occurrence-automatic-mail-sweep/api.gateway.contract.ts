/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b: a porta do robô de e-mail automático. Mesmo contrato do robô do canhoto — token de
 * cliente, empresa no cabeçalho, status mapeado a resultado e nada do corpo ou do segredo no erro.
 */
import { describe, expect, test } from 'bun:test'

import { OccurrenceAutomaticMailApiError } from '../../src/occurrence-automatic-mail-sweep/application/occurrence-automatic-mail-api.error.js'
import { createOccurrenceAutomaticMailApiGateway } from '../../src/occurrence-automatic-mail-sweep/infrastructure/occurrence-automatic-mail-api.gateway.js'

const CONFIGURATION = {
  apiBaseUrl: 'https://api.example.test/',
  clientId: 'worker-client',
  clientSecret: 'segredo-do-worker',
  tokenUrl: 'https://idp.example.test/token',
} as const
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const OCCURRENCE_ID = '22222222-2222-4222-8222-222222222222'
const PARAMS = { companyId: COMPANY_ID, occurrenceId: OCCURRENCE_ID } as const

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
  const gateway = createOccurrenceAutomaticMailApiGateway({
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
        ? Response.json(input.apiBody ?? { data: { outcome: 'sent' } })
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
  if (!(error instanceof OccurrenceAutomaticMailApiError)) {
    throw new Error(`unexpected: ${String(error)}`)
  }
  return error.outcome
}

describe('occurrence automatic mail api gateway', () => {
  test('posts the robot route with the tenant and the bearer token', async () => {
    const { calls, gateway } = buildGateway({})

    const result = await gateway.send(PARAMS)

    expect(result).toEqual({ outcome: 'sent' })
    expect(new Headers(calls[0]?.headers).get('content-type')).toBe(
      'application/x-www-form-urlencoded',
    )
    const call = calls.at(-1)
    expect(call?.method).toBe('POST')
    expect(call?.url).toBe(
      `https://api.example.test/trip-occurrences/${OCCURRENCE_ID}/automatic-mail`,
    )
    expect(call?.headers.get('authorization')).toBe('Bearer token-de-mentira')
    expect(call?.headers.get('x-company-id')).toBe(COMPANY_ID)
  })

  test('reads already_sent and skipped from the envelope', async () => {
    for (const outcome of ['already_sent', 'skipped'] as const) {
      const { gateway } = buildGateway({ apiBody: { data: { outcome } } })
      expect(await gateway.send(PARAMS)).toEqual({ outcome })
    }
  })

  test('reuses the token until 30 seconds before it expires', async () => {
    const { calls, clock, gateway } = buildGateway({})
    const tokenCalls = () => calls.filter((call) => call.url === CONFIGURATION.tokenUrl).length

    await gateway.send(PARAMS)
    clock.value = 269_999
    await gateway.send(PARAMS)
    expect(tokenCalls()).toBe(1)

    clock.value = 270_000
    await gateway.send(PARAMS)
    expect(tokenCalls()).toBe(2)
  })

  test('maps 400, 404 and 409 to request_rejected', async () => {
    for (const apiStatus of [400, 404, 409]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(await outcomeOf(gateway.send(PARAMS))).toBe('request_rejected')
    }
  })

  test('maps 401 and 403 to api_unauthorized and drops the cached token on 401', async () => {
    for (const apiStatus of [401, 403]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(await outcomeOf(gateway.send(PARAMS))).toBe('api_unauthorized')
    }

    const { calls, gateway } = buildGateway({ apiStatus: 401 })
    await gateway.send(PARAMS).catch(() => undefined)
    await gateway.send(PARAMS).catch(() => undefined)
    expect(calls.filter((call) => call.url === CONFIGURATION.tokenUrl)).toHaveLength(2)
  })

  test('maps 5xx, 429 and a refused connection to api_unreachable', async () => {
    for (const apiStatus of [429, 500, 503]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(await outcomeOf(gateway.send(PARAMS))).toBe('api_unreachable')
    }
    const { gateway } = buildGateway({ throwOnApi: true })
    expect(await outcomeOf(gateway.send(PARAMS))).toBe('api_unreachable')
  })

  test('classifies a token endpoint refusal by status', async () => {
    const refused = buildGateway({ tokenResponse: () => new Response('', { status: 401 }) })
    const down = buildGateway({ tokenResponse: () => new Response('', { status: 503 }) })

    expect(await outcomeOf(refused.gateway.send(PARAMS))).toBe('api_unauthorized')
    expect(await outcomeOf(down.gateway.send(PARAMS))).toBe('api_unreachable')
  })

  test('a 200 with an unknown outcome is treated as unreachable, never as sent', async () => {
    const { gateway } = buildGateway({ apiBody: { data: { outcome: 'weird' } } })

    expect(await outcomeOf(gateway.send(PARAMS))).toBe('api_unreachable')
  })

  test('never carries the response body or the client secret into the error', async () => {
    const { gateway } = buildGateway({ apiStatus: 400 })

    const error = await gateway.send(PARAMS).catch((caught: unknown) => caught)

    expect(String(error)).not.toContain(CONFIGURATION.clientSecret)
    expect(String(error)).toContain('400')
  })
})
