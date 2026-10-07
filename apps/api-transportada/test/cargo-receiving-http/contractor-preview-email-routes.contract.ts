/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b (ADR-0094 §10): as rotas da entrada por e-mail do perfil de recebimento. Tudo é
 * `settings.manage` (o separador e quem só lê a frota não alcançam); o token sai UMA vez, no `POST`, com
 * `no-store`; chaves das respostas são exatas; a entrada inválida é recusada, nomeando cada uma, antes do banco.
 */
import { describe, expect, test } from 'bun:test'

import type {
  PreviewEmailIntake,
  PreviewEmailSettings,
} from '../../src/cargo-receiving/application/contractor-preview-email.types.js'
import { createContractorPreviewEmailRoutes } from '../../src/cargo-receiving/presentation/contractor-preview-email.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FLEET_ONLY_PERMISSIONS,
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-000000000d01'
const BASE_PATH = `/contractors/${CONTRACTOR_ID}/receiving-profile`
const SETTINGS_PATH = `${BASE_PATH}/preview-email`
const TOKEN_PATH = `${BASE_PATH}/inbound-token`
const INTAKES_PATH = `${BASE_PATH}/email-intakes`
const CLIENT_IP = '203.0.113.9'
const TOKEN = 'abcdefghijklmnopqrstuvwxyz'

const SETTINGS: PreviewEmailSettings = {
  contractorId: CONTRACTOR_ID,
  forwarderAllowlist: ['equipe@transportadora.test'],
  hasInboundToken: true,
  inboundTokenSetAt: '2026-10-07T12:00:00.000Z',
  senderAllowlist: ['contratante.test'],
}
const INTAKES: readonly PreviewEmailIntake[] = [
  {
    outcome: 'accepted',
    previewId: '00000000-0000-4000-8000-000000000d02',
    reasonCode: null,
    receivedAt: '2026-10-07T12:00:00.000Z',
  },
  {
    outcome: 'rejected',
    previewId: null,
    reasonCode: 'RATE_LIMITED',
    receivedAt: '2026-10-07T11:00:00.000Z',
  },
]
const BODY = {
  forwarderAllowlist: ['equipe@transportadora.test'],
  senderAllowlist: ['contratante.test'],
}

type ErrorBody = {
  readonly error: {
    readonly details?: readonly { readonly field: string; readonly message: string }[]
  }
}

function createFixture(permissions?: CompanyContext['permissions']) {
  const calls: Record<'get' | 'intakes' | 'rotate' | 'save', unknown[]> = {
    get: [],
    intakes: [],
    rotate: [],
    save: [],
  }
  const routes = createContractorPreviewEmailRoutes({
    getSettings: {
      async execute(params) {
        calls.get.push(params)
        return SETTINGS
      },
    },
    listIntakes: {
      async execute(params) {
        calls.intakes.push(params)
        return INTAKES
      },
    },
    resolveClientIp: () => CLIENT_IP,
    rotateInboundToken: {
      async execute(params) {
        calls.rotate.push(params)
        return { address: `${TOKEN}@entrada.exemplo.test`, token: TOKEN }
      },
    },
    saveAllowlists: {
      async execute(params) {
        calls.save.push(structuredClone(params))
        return SETTINGS
      },
    },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions ?? COMPANY_CONTEXT.permissions),
      routes,
    }),
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

async function putRefusal(
  body: unknown,
): Promise<{ fields: string[]; messages: string[]; status: number }> {
  const fixture = createFixture()
  const response = await fixture.handle(jsonRequest({ body, method: 'PUT', path: SETTINGS_PATH }))
  const payload = (await response.json()) as ErrorBody
  expect(fixture.calls.save).toEqual([])
  const details = payload.error.details ?? []
  return {
    fields: details.map((detail) => detail.field).sort(),
    messages: details.map((detail) => detail.message),
    status: response.status,
  }
}

describe('a leitura da entrada por e-mail do perfil (spec 237 T4.6b)', () => {
  test('devolve as chaves exatas, sem hash e sem token, e nunca vai para cache', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: SETTINGS_PATH }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const data = await responseData<Record<string, unknown>>(response)
    expect(Object.keys(data).sort()).toEqual([
      'contractorId',
      'forwarderAllowlist',
      'hasInboundToken',
      'inboundTokenSetAt',
      'senderAllowlist',
    ])
    expect(data).toEqual(SETTINGS)
    expect(fixture.calls.get).toEqual([{ context: COMPANY_CONTEXT, contractorId: CONTRACTOR_ID }])
  })

  test('as recusas recentes têm quatro chaves e nenhum dado de pessoa', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${INTAKES_PATH}?limit=50` }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const { data } = (await response.json()) as { readonly data: readonly unknown[] }
    expect(data).toEqual(INTAKES)
    for (const intake of INTAKES) {
      expect(Object.keys(intake).sort()).toEqual([
        'outcome',
        'previewId',
        'reasonCode',
        'receivedAt',
      ])
    }
    expect(fixture.calls.intakes).toEqual([
      { context: COMPANY_CONTEXT, contractorId: CONTRACTOR_ID, limit: 50 },
    ])
  })

  test.each([['0'], ['51'], ['-1'], ['abc'], ['1.5'], ['']])('limit=%p é 400', async (limit) => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${INTAKES_PATH}?limit=${limit}` }),
    )

    expect(response.status).toBe(400)
    expect(fixture.calls.intakes).toEqual([])
  })

  test('sem limit vale o padrão, e parâmetro desconhecido é 400', async () => {
    const fixture = createFixture()
    expect((await fixture.handle(jsonRequest({ method: 'GET', path: INTAKES_PATH }))).status).toBe(
      200,
    )
    expect(fixture.calls.intakes).toEqual([
      { context: COMPANY_CONTEXT, contractorId: CONTRACTOR_ID, limit: 20 },
    ])

    const unknown = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${INTAKES_PATH}?companyId=x` }),
    )
    expect(unknown.status).toBe(400)
  })
})

describe('a edição das listas da entrada por e-mail (spec 237 T4.6b)', () => {
  test('grava as listas normalizadas, com o ator, o IP e a correlação do contexto', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({
        body: {
          forwarderAllowlist: ['  Equipe@Transportadora.Test', 'equipe@transportadora.test'],
          senderAllowlist: ['Contratante.Test'],
        },
        method: 'PUT',
        path: SETTINGS_PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(SETTINGS)
    expect(fixture.calls.save).toEqual([
      {
        context: COMPANY_CONTEXT,
        contractorId: CONTRACTOR_ID,
        correlationId: CORRELATION_ID,
        forwarderAllowlist: ['equipe@transportadora.test'],
        ipAddress: CLIENT_IP,
        senderAllowlist: ['contratante.test'],
      },
    ])
  })

  test('recusa, de uma vez, cada entrada inválida das duas listas, nomeando a entrada', async () => {
    const result = await putRefusal({
      forwarderAllowlist: ['boa@transportadora.test', 'sem-arroba', 'a b@x.test'],
      senderAllowlist: ['*.contratante.test'],
    })

    expect(result.status).toBe(400)
    expect(result.fields).toEqual([
      'forwarderAllowlist.1',
      'forwarderAllowlist.2',
      'senderAllowlist.0',
    ])
    expect(result.messages.some((message) => message.includes('sem-arroba'))).toBe(true)
    expect(result.messages.some((message) => message.includes('*.contratante.test'))).toBe(true)
  })

  test('mais de 20 entradas distintas é 400 na lista, e a vazia é aceita', async () => {
    const tooMany = Array.from({ length: 21 }, (_, index) => `pessoa${index}@transportadora.test`)
    expect(await putRefusal({ ...BODY, forwarderAllowlist: tooMany })).toMatchObject({
      fields: ['forwarderAllowlist'],
      status: 400,
    })

    const fixture = createFixture()
    const empty = await fixture.handle(
      jsonRequest({
        body: { forwarderAllowlist: [], senderAllowlist: [] },
        method: 'PUT',
        path: SETTINGS_PATH,
      }),
    )
    expect(empty.status).toBe(200)
  })

  test('chave omitida, desconhecida e companyId no corpo são 400', async () => {
    expect(await putRefusal({ forwarderAllowlist: BODY.forwarderAllowlist })).toMatchObject({
      fields: ['senderAllowlist'],
      status: 400,
    })
    expect((await putRefusal({ ...BODY, previewInboundTokenHash: 'a'.repeat(64) })).status).toBe(
      400,
    )
    expect((await putRefusal({ ...BODY, companyId: CONTRACTOR_ID })).status).toBe(400)
    expect((await putRefusal({ forwarderAllowlist: 'a@b.test', senderAllowlist: [] })).status).toBe(
      400,
    )
    expect((await putRefusal({ forwarderAllowlist: [null], senderAllowlist: [] })).status).toBe(400)
  })
})

describe('gerar o endereço de entrada (spec 237 T4.6b)', () => {
  test('devolve o endereço e o token uma vez, com no-store, sem corpo no pedido', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(jsonRequest({ method: 'POST', path: TOKEN_PATH }))

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const data = await responseData<Record<string, unknown>>(response)
    expect(Object.keys(data).sort()).toEqual(['address', 'token'])
    expect(data).toEqual({ address: `${TOKEN}@entrada.exemplo.test`, token: TOKEN })
    expect(fixture.calls.rotate).toEqual([
      {
        context: COMPANY_CONTEXT,
        contractorId: CONTRACTOR_ID,
        correlationId: CORRELATION_ID,
        ipAddress: CLIENT_IP,
      },
    ])
  })

  test('corpo com qualquer chave é 400, e o objeto vazio é aceito', async () => {
    const fixture = createFixture()
    const refused = await fixture.handle(
      jsonRequest({ body: { token: TOKEN }, method: 'POST', path: TOKEN_PATH }),
    )
    expect(refused.status).toBe(400)
    expect(fixture.calls.rotate).toEqual([])

    const accepted = await fixture.handle(
      jsonRequest({ body: {}, method: 'POST', path: TOKEN_PATH }),
    )
    expect(accepted.status).toBe(200)
  })
})

describe('quem alcança a entrada por e-mail do perfil (spec 237 T4.6b)', () => {
  test.each([
    ['GET', SETTINGS_PATH, undefined],
    ['PUT', SETTINGS_PATH, BODY],
    ['POST', TOKEN_PATH, undefined],
    ['GET', INTAKES_PATH, undefined],
  ])('quem só cuida da frota recebe 403 em %s %s', async (method, path, body) => {
    const fixture = createFixture(FLEET_ONLY_PERMISSIONS)
    const response = await fixture.handle(
      jsonRequest({ ...(body === undefined ? {} : { body }), method, path }),
    )

    expect(response.status).toBe(403)
    expect((await responseApiError(response)).code).toBe('FORBIDDEN')
    expect(Object.values(fixture.calls).flat()).toEqual([])
  })
})
