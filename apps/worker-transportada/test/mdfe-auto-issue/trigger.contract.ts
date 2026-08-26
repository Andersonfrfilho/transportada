/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createMdfeAutoIssueTrigger } from '../../src/mdfe-auto-issue/application/mdfe-auto-issue.service.js'
import { createAutomaticManifestApiGateway } from '../../src/mdfe-auto-issue/infrastructure/automatic-manifest-api.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const TRIP_ID = '00000000-0000-4000-8000-000000000002'
const BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000003'

const CONFIGURATION = {
  apiBaseUrl: 'https://api.example.test/',
  clientId: 'transportada-worker',
  clientSecret: 'segredo-de-mentira',
  tokenUrl: 'https://identity.example.test/token',
} as const

function silentLogger() {
  return { debug() {}, error() {}, info() {}, warn() {} }
}

describe('mdfe auto issue trigger contract', () => {
  test('does nothing when the note is not on a trip', async () => {
    let issued = 0
    const trigger = createMdfeAutoIssueTrigger({
      api: {
        async issue() {
          issued += 1
          return 'issued'
        },
      },
      logger: silentLogger(),
      trips: {
        async findTripId() {
          return null
        },
      },
    })

    await trigger.trigger({ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID })

    expect(issued).toBe(0)
  })

  /**
   * O CT-e já está autorizado quando o gatilho corre. Se a falha subisse, a mensagem voltaria para a
   * fila e a reentrega **emitiria o documento fiscal de novo** — preço alto por uma segunda
   * tentativa de manifesto que o operador consegue com um clique.
   */
  test('swallows every failure, because the CT-e is already authorized', async () => {
    const trigger = createMdfeAutoIssueTrigger({
      api: {
        async issue() {
          throw new Error('api indisponível')
        },
      },
      logger: silentLogger(),
      trips: {
        async findTripId() {
          return TRIP_ID
        },
      },
    })

    expect(
      await trigger
        .trigger({ batchItemId: BATCH_ITEM_ID, companyId: COMPANY_ID })
        .then(() => 'resolved'),
    ).toBe('resolved')
  })
})

describe('automatic manifest api gateway contract', () => {
  test('sends the tenant in the header and reuses the token until it expires', async () => {
    const calls: Array<{ readonly headers: Headers; readonly url: string }> = []
    let clock = 0
    const gateway = createAutomaticManifestApiGateway({
      configuration: CONFIGURATION,
      fetch: (async (url: string, init?: RequestInit) => {
        calls.push({ headers: new Headers(init?.headers), url: String(url) })
        if (String(url) === CONFIGURATION.tokenUrl) {
          return Response.json({ access_token: 'token-de-mentira', expires_in: 300 })
        }
        return Response.json({ data: { outcome: 'issued' } })
      }) as unknown as typeof globalThis.fetch,
      now: () => clock,
    })

    expect(await gateway.issue({ companyId: COMPANY_ID, tripId: TRIP_ID })).toBe('issued')
    clock = 60_000
    await gateway.issue({ companyId: COMPANY_ID, tripId: TRIP_ID })

    // Uma barra só na junção: a base com barra final produziria `//trips`, que não casa a rota.
    expect(calls.filter((call) => call.url === CONFIGURATION.tokenUrl)).toHaveLength(1)
    expect(calls.at(-1)?.url).toBe(
      `https://api.example.test/trips/${TRIP_ID}/mdfe-manifests/automatic`,
    )
    expect(calls.at(-1)?.headers.get('x-company-id')).toBe(COMPANY_ID)
    expect(calls.at(-1)?.headers.get('authorization')).toBe('Bearer token-de-mentira')
  })

  test('never carries the identity provider response into the error', async () => {
    const gateway = createAutomaticManifestApiGateway({
      configuration: CONFIGURATION,
      fetch: (async () =>
        new Response(JSON.stringify({ secret: CONFIGURATION.clientSecret }), {
          status: 401,
        })) as unknown as typeof globalThis.fetch,
    })

    const error = await gateway
      .issue({ companyId: COMPANY_ID, tripId: TRIP_ID })
      .catch((caught: unknown) => caught)

    expect(String(error)).not.toContain(CONFIGURATION.clientSecret)
    expect(String(error)).toContain('mdfe_auto_issue_token_failed:401')
  })
})
