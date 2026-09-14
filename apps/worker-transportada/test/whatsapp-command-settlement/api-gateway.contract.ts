/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O crachá do worker (ADR-0047): `client_credentials` no Keycloak, bearer na API, e a empresa do
 * pedido no `x-company-id`. O segredo nunca aparece em erro.
 */
import { describe, expect, test } from 'bun:test'

import { createWhatsAppCommandSettlementApiGateway } from '../../src/whatsapp-command-settlement/infrastructure/whatsapp-command-settlement-api.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000001801'
const REQUEST_ID = '00000000-0000-4000-8000-000000001802'
const CONFIGURATION = {
  apiBaseUrl: 'https://api.example.test/',
  clientId: 'transportada-worker',
  clientSecret: 'segredo-de-mentira',
  tokenUrl: 'https://identity.example.test/token',
} as const

type Captured = { readonly init: RequestInit | undefined; readonly url: string }

function fakeFetch(options: { readonly apiStatus?: number; readonly body?: unknown } = {}) {
  const captured: Captured[] = []
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    captured.push({ init, url: String(url) })
    if (String(url) === CONFIGURATION.tokenUrl) {
      return Response.json({ access_token: 'token-de-maquina', expires_in: 300 })
    }
    return new Response(
      JSON.stringify(options.body ?? { data: { message: 'resumo', outcome: 'settled' } }),
      { status: options.apiStatus ?? 200 },
    )
  }) as typeof globalThis.fetch
  return { captured, fetch }
}

describe('gateway da liquidação (spec 144 T014)', () => {
  test('POST na rota do pedido, com bearer, empresa no cabeçalho e o veredito como dica', async () => {
    const { captured, fetch } = fakeFetch()
    const gateway = createWhatsAppCommandSettlementApiGateway({
      configuration: CONFIGURATION,
      fetch,
    })

    const result = await gateway.settle({
      companyId: COMPANY_ID,
      hint: 'settle',
      requestId: REQUEST_ID,
    })

    expect(result).toEqual({ message: 'resumo', outcome: 'settled' })
    const call = captured.at(-1)
    expect(call?.url).toBe(
      `https://api.example.test/whatsapp-command-requests/${REQUEST_ID}/settlement`,
    )
    expect(call?.init?.method).toBe('POST')
    const headers = call?.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer token-de-maquina')
    expect(headers['x-company-id']).toBe(COMPANY_ID)
    expect(JSON.parse(String(call?.init?.body))).toEqual({ hint: 'settle' })
  })

  test('o token é reusado entre pedidos enquanto não vence', async () => {
    const { captured, fetch } = fakeFetch()
    const gateway = createWhatsAppCommandSettlementApiGateway({
      configuration: CONFIGURATION,
      fetch,
    })
    await gateway.settle({ companyId: COMPANY_ID, hint: 'settle', requestId: REQUEST_ID })
    await gateway.settle({ companyId: COMPANY_ID, hint: 'resume', requestId: REQUEST_ID })
    expect(captured.filter((call) => call.url === CONFIGURATION.tokenUrl)).toHaveLength(1)
  })

  test('resposta sem mensagem devolve só o desfecho', async () => {
    const { fetch } = fakeFetch({ body: { data: { outcome: 'waiting' } } })
    const gateway = createWhatsAppCommandSettlementApiGateway({
      configuration: CONFIGURATION,
      fetch,
    })
    expect(
      await gateway.settle({ companyId: COMPANY_ID, hint: 'settle', requestId: REQUEST_ID }),
    ).toEqual({ message: undefined, outcome: 'waiting' })
  })

  test('recusa da API vira erro com o status, sem corpo nem segredo', async () => {
    const { fetch } = fakeFetch({ apiStatus: 403, body: { secret: CONFIGURATION.clientSecret } })
    const gateway = createWhatsAppCommandSettlementApiGateway({
      configuration: CONFIGURATION,
      fetch,
    })

    const failure = await gateway
      .settle({ companyId: COMPANY_ID, hint: 'settle', requestId: REQUEST_ID })
      .then(
        () => undefined,
        (error: unknown) => error,
      )

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toBe('whatsapp_command_settlement_request_failed:403')
    expect((failure as Error).message).not.toContain(CONFIGURATION.clientSecret)
  })
})
