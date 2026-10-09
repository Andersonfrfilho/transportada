/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T5.1 (D11): as respostas prontas do motorista são da empresa. O público `driver_reply` entra no
 * cadastro; o app lê as ativas pela rota `/me/trips/current/quick-replies` (`trip.read`, `no-store`),
 * `{ id, text }` na ordem do cadastro, no máximo 50. Sem ficha de motorista, a recusa das rotas `/me`.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_QUICK_REPLY_AUDIENCES,
  OCCURRENCE_CONVERSATION_PARTICIPANTS,
} from '../../src/database/occurrence-conversation.schema.js'
import type { QuickReplyRecord } from '../../src/occurrence-conversation/application/quick-replies.port.js'
import { createMeQuickReplyRoutes } from '../../src/occurrence-conversation/presentation/me-quick-replies.routes.js'
import { createQuickReplyRoutes } from '../../src/occurrence-conversation/presentation/quick-replies.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const DRIVER_ID = '00000000-0000-4000-8000-000000000202'
const PATH = '/me/trips/current/quick-replies'

function reply(position: number, text = `Resposta ${position}`): QuickReplyRecord {
  return {
    active: true,
    audience: 'driver_reply',
    bodyText: text,
    id: `00000000-0000-4000-8000-${String(position).padStart(12, '0')}`,
    position,
  }
}

function createFixture(params: {
  readonly driverId?: null | string
  readonly rows?: QuickReplyRecord[]
}) {
  const calls: unknown[] = []
  const [route] = createMeQuickReplyRoutes({
    quickReplies: {
      listForComposer: async (input) => {
        calls.push(input)
        return params.rows ?? []
      },
    },
    resolveDriverId: async () => (params.driverId === undefined ? DRIVER_ID : params.driverId),
  })
  const get = (path = PATH) =>
    route!.execute({
      context: { scope: { companyId: COMPANY_ID, membershipId: 'membership-1' } } as never,
      pathParameters: {},
      request: new Request(`http://api.test${path}`),
    } as never)
  return { calls, get }
}

describe('o público driver_reply (spec 260 T5.1)', () => {
  test('é o terceiro público do cadastro, sem tocar os participantes da conversa', () => {
    expect([...COMPANY_QUICK_REPLY_AUDIENCES]).toEqual(['contractor', 'driver', 'driver_reply'])
    expect([...OCCURRENCE_CONVERSATION_PARTICIPANTS]).toEqual(['contractor', 'driver'])
  })

  test('o cadastro aceita criar, reordenar e listar no composer para o público novo', async () => {
    const calls: unknown[] = []
    const routes = createQuickReplyRoutes({
      quickReplies: {
        create: async (input: unknown) => {
          calls.push(input)
          return reply(0, 'Cheguei')
        },
        listAll: async () => [reply(0)],
        listForComposer: async (input: unknown) => {
          calls.push(input)
          return [reply(0)]
        },
        reorder: async (input: unknown) => {
          calls.push(input)
        },
      } as never,
    })
    const run = (index: number, request: Request) =>
      routes.at(index)!.execute({
        context: { scope: { companyId: COMPANY_ID } } as never,
        pathParameters: {},
        request,
      } as never)
    const json = (method: string, path: string, body: unknown) =>
      new Request(`http://api.test${path}`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method,
      })

    const created = await run(
      1,
      json('POST', '/company-settings/quick-replies', {
        audience: 'driver_reply',
        text: 'Cheguei',
      }),
    )
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({
      data: {
        active: true,
        audience: 'driver_reply',
        id: '00000000-0000-4000-8000-000000000000',
        position: 0,
        text: 'Cheguei',
      },
    })
    const ordered = await run(
      2,
      json('PUT', '/company-settings/quick-replies/order', {
        audience: 'driver_reply',
        ids: [reply(0).id],
      }),
    )
    expect(ordered.status).toBe(200)
    await run(-1, new Request('http://api.test/occurrence-quick-replies?audience=driver_reply'))

    expect(calls).toEqual([
      { audience: 'driver_reply', bodyText: 'Cheguei', companyId: COMPANY_ID },
      { audience: 'driver_reply', companyId: COMPANY_ID, ids: [reply(0).id] },
      { audience: 'driver_reply', companyId: COMPANY_ID },
    ])
  })
})

describe('GET /me/trips/current/quick-replies (spec 260 T5.1)', () => {
  test('é trip.read na empresa, e só essa rota', () => {
    const routes = createMeQuickReplyRoutes({
      quickReplies: {} as never,
      resolveDriverId: async () => null,
    })

    expect(
      routes.map((route) => ({ method: route.method, path: route.pathname, policy: route.policy })),
    ).toEqual([
      { method: 'GET', path: PATH, policy: { permission: 'trip.read', scope: 'company' } },
    ])
    expect(routes.some((route) => route.rateLimit !== undefined)).toBe(false)
  })

  test('devolve só {id, text}, na ordem do cadastro, no-store, pedindo as ativas do público', async () => {
    const { calls, get } = createFixture({
      rows: [reply(0, 'Cheguei'), reply(1, 'Estou a caminho')],
    })

    const response = await get()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({
      data: [
        { id: reply(0).id, text: 'Cheguei' },
        { id: reply(1).id, text: 'Estou a caminho' },
      ],
    })
    expect(calls).toEqual([{ audience: 'driver_reply', companyId: COMPANY_ID }])
  })

  test('sem cadastro devolve lista vazia', async () => {
    const response = await createFixture({ rows: [] }).get()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: [] })
  })

  test('devolve no máximo 50, as primeiras do cadastro', async () => {
    const rows = Array.from({ length: 60 }, (_, position) => reply(position))

    const body = (await (await createFixture({ rows }).get()).json()) as { data: { id: string }[] }

    expect(body.data).toHaveLength(50)
    expect(body.data.at(0)?.id).toBe(reply(0).id)
    expect(body.data.at(-1)?.id).toBe(reply(49).id)
  })

  test('sem ficha de motorista é a recusa das rotas /me, sem consultar as respostas', async () => {
    const { calls, get } = createFixture({ driverId: null, rows: [reply(0)] })

    await expect(get()).rejects.toMatchObject({ code: 'DRIVER_NOT_REGISTERED', status: 409 })
    expect(calls).toEqual([])
  })

  test('parâmetro de consulta desconhecido é 400', async () => {
    await expect(createFixture({}).get(`${PATH}?audience=driver`)).rejects.toMatchObject({
      status: 400,
    })
  })
})
