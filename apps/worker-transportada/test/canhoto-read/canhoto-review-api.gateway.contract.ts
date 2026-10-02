/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CanhotoReviewApiError } from '../../src/canhoto-read/application/canhoto-review-api.error.js'
import { createCanhotoReviewApiGateway } from '../../src/canhoto-read/infrastructure/canhoto-review-api.gateway.js'

const CONFIGURATION = {
  apiBaseUrl: 'https://api.example.test/',
  clientId: 'worker-client',
  clientSecret: 'segredo-do-worker',
  tokenUrl: 'https://idp.example.test/token',
} as const
const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333'
const READING = {
  readDocumentId: DOCUMENT_ID,
  readNumber: '12345',
  readSeries: '1',
  readSource: 'barcode',
} as const

type Call = {
  readonly body: string
  readonly headers: Headers
  readonly method: string
  readonly url: string
}

function buildGateway(input: {
  readonly apiStatus?: number
  readonly clock?: { value: number }
  readonly throwOnApi?: boolean
  readonly tokenResponse?: () => Response
}) {
  const calls: Call[] = []
  const clock = input.clock ?? { value: 0 }
  const gateway = createCanhotoReviewApiGateway({
    configuration: CONFIGURATION,
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({
        body: String(init?.body ?? ''),
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
        ? Response.json({ data: { canhotoReview: 'approved' } })
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
  if (!(error instanceof CanhotoReviewApiError)) throw new Error(`unexpected: ${String(error)}`)
  return error.outcome
}

describe('canhoto review api gateway', () => {
  test('patches the robot route with the tenant, the bearer token and only the four read fields', async () => {
    const { calls, gateway } = buildGateway({})

    const result = await gateway.report({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      reading: READING,
      tripId: TRIP_ID,
    })

    expect(result).toEqual({ review: 'approved' })
    const tokenCall = calls[0]
    expect(new URLSearchParams(tokenCall?.body).get('grant_type')).toBe('client_credentials')
    const call = calls.at(-1)
    expect(call?.method).toBe('PATCH')
    // Uma barra só na junção: a base com barra final produziria `//trips`.
    expect(call?.url).toBe(
      `https://api.example.test/trips/${TRIP_ID}/documents/${DOCUMENT_ID}/proof/review/automatic`,
    )
    expect(call?.headers.get('authorization')).toBe('Bearer token-de-mentira')
    expect(call?.headers.get('x-company-id')).toBe(COMPANY_ID)
    expect(call?.headers.get('content-type')).toBe('application/json')
    // O veredito nunca sai do servidor: nem `action`, nem aprovação, nem recusa no corpo.
    expect(JSON.parse(call?.body ?? '')).toEqual({
      readDocumentId: DOCUMENT_ID,
      readNumber: '12345',
      readSeries: '1',
      readSource: 'barcode',
    })
  })

  test('reports a read that found nothing as four explicit nulls, not absent fields', async () => {
    const { calls, gateway } = buildGateway({})

    await gateway.report({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      reading: { readDocumentId: null, readNumber: null, readSeries: null, readSource: null },
      tripId: TRIP_ID,
    })

    expect(JSON.parse(calls.at(-1)?.body ?? '')).toEqual({
      readDocumentId: null,
      readNumber: null,
      readSeries: null,
      readSource: null,
    })
  })

  test('reuses the token until 30 seconds before it expires', async () => {
    const { calls, clock, gateway } = buildGateway({})
    const params = {
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      reading: READING,
      tripId: TRIP_ID,
    }
    const tokenCalls = () => calls.filter((call) => call.url === CONFIGURATION.tokenUrl).length

    await gateway.report(params)
    clock.value = 269_999
    await gateway.report(params)
    expect(tokenCalls()).toBe(1)

    clock.value = 270_000
    await gateway.report(params)
    expect(tokenCalls()).toBe(2)
  })

  test('maps 400, 404 and 409 to report_rejected', async () => {
    for (const apiStatus of [400, 404, 409]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(
        await outcomeOf(
          gateway.report({
            companyId: COMPANY_ID,
            documentId: DOCUMENT_ID,
            reading: READING,
            tripId: TRIP_ID,
          }),
        ),
      ).toBe('report_rejected')
    }
  })

  test('maps 401 and 403 to api_unauthorized and drops the cached token on 401', async () => {
    for (const apiStatus of [401, 403]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(
        await outcomeOf(
          gateway.report({
            companyId: COMPANY_ID,
            documentId: DOCUMENT_ID,
            reading: READING,
            tripId: TRIP_ID,
          }),
        ),
      ).toBe('api_unauthorized')
    }

    const { calls, gateway } = buildGateway({ apiStatus: 401 })
    const params = {
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      reading: READING,
      tripId: TRIP_ID,
    }
    await gateway.report(params).catch(() => undefined)
    await gateway.report(params).catch(() => undefined)
    expect(calls.filter((call) => call.url === CONFIGURATION.tokenUrl)).toHaveLength(2)
  })

  test('maps 5xx, 429 and a refused connection to api_unreachable', async () => {
    for (const apiStatus of [429, 500, 503]) {
      const { gateway } = buildGateway({ apiStatus })
      expect(
        await outcomeOf(
          gateway.report({
            companyId: COMPANY_ID,
            documentId: DOCUMENT_ID,
            reading: READING,
            tripId: TRIP_ID,
          }),
        ),
      ).toBe('api_unreachable')
    }

    const { gateway } = buildGateway({ throwOnApi: true })
    expect(
      await outcomeOf(
        gateway.report({
          companyId: COMPANY_ID,
          documentId: DOCUMENT_ID,
          reading: READING,
          tripId: TRIP_ID,
        }),
      ),
    ).toBe('api_unreachable')
  })

  test('classifies a token endpoint refusal by status', async () => {
    const refused = buildGateway({ tokenResponse: () => new Response('', { status: 401 }) })
    const down = buildGateway({ tokenResponse: () => new Response('', { status: 503 }) })
    const params = {
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      reading: READING,
      tripId: TRIP_ID,
    }

    expect(await outcomeOf(refused.gateway.report(params))).toBe('api_unauthorized')
    expect(await outcomeOf(down.gateway.report(params))).toBe('api_unreachable')
  })

  test('never carries the response body or the client secret into the error', async () => {
    const { gateway } = buildGateway({ apiStatus: 400 })

    const error = await gateway
      .report({ companyId: COMPANY_ID, documentId: DOCUMENT_ID, reading: READING, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(String(error)).not.toContain(CONFIGURATION.clientSecret)
    expect(String(error)).toContain('400')
  })
})
