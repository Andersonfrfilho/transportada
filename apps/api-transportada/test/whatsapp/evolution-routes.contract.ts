/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type { WhatsAppEvolutionSummary } from '../../src/whatsapp/application/whatsapp-evolution.port.js'
import { createWhatsAppEvolutionRoutes } from '../../src/whatsapp/presentation/whatsapp-evolution.routes.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const PATH = '/company-settings/whatsapp-evolution'
const API_KEY = 'chave-secreta-da-instancia'
const SETTINGS_PERMISSIONS: CompanyContext['permissions'] = new Set(['settings.manage'] as const)

const SUMMARY: WhatsAppEvolutionSummary = {
  apiKeyConfigured: true,
  baseUrl: 'https://evolution.exemplo.com',
  connectionCheckedAt: null,
  connectionState: 'unknown',
  createdAt: '2026-10-27T12:00:00.000Z',
  dailyCap: 50,
  defaultProvider: 'meta',
  id: '00000000-0000-4000-8000-000000000040',
  instanceName: 'transportada',
  minIntervalSeconds: 15,
  riskAcknowledgedAt: null,
  status: 'disabled',
  updatedAt: '2026-10-27T12:00:00.000Z',
  version: '1',
}

function createFixture(
  input: {
    readonly permissions?: CompanyContext['permissions']
    readonly summary?: WhatsAppEvolutionSummary | null
  } = {},
) {
  const calls: Record<string, unknown[]> = { connection: [], qr: [], read: [], save: [] }
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? SETTINGS_PERMISSIONS),
      routes: createWhatsAppEvolutionRoutes({
        connection: {
          async execute(request) {
            calls.connection?.push(structuredClone(request))
            return { checkedAt: '2026-10-27T12:00:00.000Z', state: 'close' }
          },
        },
        qr: {
          async execute(request) {
            calls.qr?.push(structuredClone(request))
            return {
              pairingCode: null,
              qrCode: 'data:image/png;base64,AAAA',
              refreshAfterSeconds: 20,
              state: 'connecting',
            }
          },
        },
        read: {
          async execute(request) {
            calls.read?.push(structuredClone(request))
            return input.summary === undefined ? SUMMARY : input.summary
          },
        },
        save: {
          async execute(request) {
            calls.save?.push(structuredClone(request))
            return SUMMARY
          },
        },
      }),
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const BODY = {
  baseUrl: 'https://evolution.exemplo.com',
  dailyCap: 50,
  instanceName: 'transportada',
  minIntervalSeconds: 15,
}

describe('as rotas do Evolution (spec 281 T4)', () => {
  test('a leitura publica lista fechada, sem chave', async () => {
    const fixture = createFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))
    const text = await response.text()
    const body = JSON.parse(text) as { data: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(Object.keys(body.data).sort()).toEqual([
      'apiKeyConfigured',
      'baseUrl',
      'connectionCheckedAt',
      'connectionState',
      'createdAt',
      'dailyCap',
      'defaultProvider',
      'id',
      'instanceName',
      'minIntervalSeconds',
      'riskAcknowledgedAt',
      'status',
      'updatedAt',
      'version',
    ])
    expect(text).not.toContain('secretEnvelope')
  })

  test('empresa sem configuração responde nulo', async () => {
    const fixture = createFixture({ summary: null })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: PATH }))

    expect(await response.json()).toEqual({ data: null })
  })

  test('salva com a chave e não a devolve; sem a chave o campo não viaja', async () => {
    const fixture = createFixture()

    const withKey = await fixture.handle(
      jsonRequest({
        body: { ...BODY, apiKey: API_KEY, acknowledgeRisk: true, status: 'active' },
        method: 'PUT',
        path: PATH,
      }),
    )
    expect(withKey.status).toBe(200)
    expect(await withKey.text()).not.toContain(API_KEY)
    expect((fixture.calls.save?.[0] as { values: Record<string, unknown> }).values).toMatchObject({
      acknowledgeRisk: true,
      apiKey: API_KEY,
      defaultProvider: 'meta',
      status: 'active',
    })

    await fixture.handle(jsonRequest({ body: BODY, method: 'PUT', path: PATH }))
    const values = (fixture.calls.save?.[1] as { values: Record<string, unknown> }).values
    expect(values.apiKey).toBeUndefined()
    expect(values.status).toBe('disabled')
    expect(values.acknowledgeRisk).toBe(false)
  })

  test('recusa limite fora da faixa, instância inválida e campo desconhecido', async () => {
    const fixture = createFixture()

    for (const body of [
      { ...BODY, dailyCap: 0 },
      { ...BODY, dailyCap: 5000 },
      { ...BODY, minIntervalSeconds: 0 },
      { ...BODY, instanceName: 'com espaço' },
      { ...BODY, companyId: 'x' },
    ]) {
      const response = await fixture.handle(jsonRequest({ body, method: 'PUT', path: PATH }))
      expect(response.status).toBe(400)
    }
    expect(fixture.calls.save).toEqual([])
  })

  test('estado e QR passam o ator, e o QR não fica em cache', async () => {
    const fixture = createFixture()

    const connection = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${PATH}/connection` }),
    )
    expect(connection.status).toBe(200)
    expect(await connection.json()).toEqual({
      data: { checkedAt: '2026-10-27T12:00:00.000Z', state: 'close' },
    })

    const qr = await fixture.handle(jsonRequest({ method: 'POST', path: `${PATH}/qr` }))
    expect(qr.status).toBe(200)
    expect(qr.headers.get('cache-control')).toBe('no-store')
    expect(fixture.calls.qr).toHaveLength(1)
    expect((fixture.calls.qr?.[0] as { correlationId: string }).correlationId).toBe(CORRELATION_ID)
  })

  test('exige settings.manage nas quatro', async () => {
    const fixture = createFixture({ permissions: new Set(['invoices.read'] as const) })

    for (const request of [
      jsonRequest({ method: 'GET', path: PATH }),
      jsonRequest({ body: BODY, method: 'PUT', path: PATH }),
      jsonRequest({ method: 'GET', path: `${PATH}/connection` }),
      jsonRequest({ method: 'POST', path: `${PATH}/qr` }),
    ]) {
      expect((await fixture.handle(request)).status).toBe(403)
    }
    expect(fixture.calls.read).toEqual([])
    expect(fixture.calls.qr).toEqual([])
  })
})
