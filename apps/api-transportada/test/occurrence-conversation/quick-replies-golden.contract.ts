/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T5.1 (D11), regra do dono "nada pode impactar outros fluxos": as respostas rápidas do
 * ESCRITÓRIO (públicos `contractor` e `driver`) respondem exatamente como antes de o público
 * `driver_reply` existir. Os literais abaixo foram capturados ANTES da mudança.
 */
import { describe, expect, test } from 'bun:test'

import { OCCURRENCE_CONVERSATION_PARTICIPANTS } from '../../src/database/occurrence-conversation.schema.js'
import type { QuickReplyRecord } from '../../src/occurrence-conversation/application/quick-replies.port.js'
import { createQuickReplyRoutes } from '../../src/occurrence-conversation/presentation/quick-replies.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OLD_AUDIENCES: ('contractor' | 'driver')[] = ['contractor', 'driver']

function record(audience: 'contractor' | 'driver', position: number): QuickReplyRecord {
  return {
    active: true,
    audience,
    bodyText: `Texto ${audience} ${position}`,
    id: `00000000-0000-4000-8000-00000000010${position}`,
    position,
  }
}

type Capture = { readonly input: unknown; readonly name: string }

function createRoutes(calls: Capture[]) {
  const rows = [record('contractor', 0), record('driver', 1)]
  return createQuickReplyRoutes({
    quickReplies: {
      create: async (input: { audience: 'contractor' | 'driver'; bodyText: string }) => {
        calls.push({ input, name: 'create' })
        return { ...record(input.audience, 2), bodyText: input.bodyText }
      },
      listAll: async () => rows,
      listForComposer: async (input: { audience: 'contractor' | 'driver' }) => {
        calls.push({ input, name: 'listForComposer' })
        return rows.filter((row) => row.audience === input.audience)
      },
      reorder: async (input: unknown) => {
        calls.push({ input, name: 'reorder' })
      },
    } as never,
  })
}

function run(
  route: ReturnType<typeof createQuickReplyRoutes>[number] | undefined,
  request: Request,
): Promise<Response> {
  return route!.execute({
    context: { scope: { companyId: COMPANY_ID } } as never,
    pathParameters: {},
    request,
  } as never)
}

function jsonRequest(method: string, path: string, body: unknown): Request {
  return new Request(`http://api.test${path}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method,
  })
}

describe('as respostas rápidas do escritório não mudam (spec 263 T5.1 golden)', () => {
  test('o público dos participantes da conversa continua exatamente contractor e driver', () => {
    expect([...OCCURRENCE_CONVERSATION_PARTICIPANTS]).toEqual(['contractor', 'driver'])
  })

  test.each(OLD_AUDIENCES)(
    'cadastrar para %s responde 201 com o corpo de sempre',
    async (audience) => {
      const calls: Capture[] = []
      const response = await run(
        createRoutes(calls)[1],
        jsonRequest('POST', '/company-settings/quick-replies', { audience, text: '  Oi  ' }),
      )

      expect(response.status).toBe(201)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(await response.json()).toEqual({
        data: {
          active: true,
          audience,
          id: '00000000-0000-4000-8000-000000000102',
          position: 2,
          text: '  Oi  ',
        },
      })
      expect(calls).toEqual([
        { input: { audience, bodyText: '  Oi  ', companyId: COMPANY_ID }, name: 'create' },
      ])
    },
  )

  test('o cadastro lista todas, na forma de sempre', async () => {
    const response = await run(
      createRoutes([])[0],
      new Request('http://api.test/company-settings/quick-replies'),
    )

    expect(await response.json()).toEqual({
      data: [
        {
          active: true,
          audience: 'contractor',
          id: '00000000-0000-4000-8000-000000000100',
          position: 0,
          text: 'Texto contractor 0',
        },
        {
          active: true,
          audience: 'driver',
          id: '00000000-0000-4000-8000-000000000101',
          position: 1,
          text: 'Texto driver 1',
        },
      ],
    })
  })

  test('o compositor do escritório pede cada público antigo e recebe a forma de sempre', async () => {
    const calls: Capture[] = []
    const composer = createRoutes(calls).at(-1)

    const response = await run(
      composer,
      new Request('http://api.test/occurrence-quick-replies?audience=driver'),
    )

    expect(await response.json()).toEqual({
      data: [
        {
          active: true,
          audience: 'driver',
          id: '00000000-0000-4000-8000-000000000101',
          position: 1,
          text: 'Texto driver 1',
        },
      ],
    })
    expect(calls).toEqual([
      { input: { audience: 'driver', companyId: COMPANY_ID }, name: 'listForComposer' },
    ])
  })

  test.each([[''], ['supplier'], ['Driver'], ['contractor,driver']])(
    'público inválido %p segue sendo 400 no cadastro e no compositor',
    async (audience) => {
      const routes = createRoutes([])

      await expect(
        run(
          routes[1],
          jsonRequest('POST', '/company-settings/quick-replies', { audience, text: 'x' }),
        ),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        run(
          routes[2],
          jsonRequest('PUT', '/company-settings/quick-replies/order', { audience, ids: [] }),
        ),
      ).rejects.toMatchObject({ status: 400 })
      await expect(
        run(
          routes.at(-1),
          new Request(`http://api.test/occurrence-quick-replies?audience=${audience}`),
        ),
      ).rejects.toMatchObject({ status: 400 })
    },
  )

  test.each(OLD_AUDIENCES)('reordenar %s responde a lista toda, como sempre', async (audience) => {
    const calls: Capture[] = []
    const response = await run(
      createRoutes(calls)[2],
      jsonRequest('PUT', '/company-settings/quick-replies/order', {
        audience,
        ids: ['00000000-0000-4000-8000-000000000100'],
      }),
    )

    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: unknown[] }).data).toHaveLength(2)
    expect(calls).toEqual([
      {
        input: {
          audience,
          companyId: COMPANY_ID,
          ids: ['00000000-0000-4000-8000-000000000100'],
        },
        name: 'reorder',
      },
    ])
  })
})
