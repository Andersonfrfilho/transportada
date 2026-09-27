/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T701 (RF12): as respostas rápidas da empresa. O cadastro é `settings.manage`; quem
 * escreve na conversa (`occurrences.resolve`) só lê as ativas daquele público. O texto sai aparado,
 * de 1 a 500 caracteres; a nova entra no fim; reordenar exige exatamente as respostas do público;
 * desativar não apaga.
 */
import { describe, expect, test } from 'bun:test'

import type {
  QuickRepliesTransactionPort,
  QuickReplyRecord,
} from '../../src/occurrence-conversation/application/quick-replies.port.js'
import { createQuickRepliesUseCase } from '../../src/occurrence-conversation/application/quick-replies.use-case.js'
import { createQuickReplyRoutes } from '../../src/occurrence-conversation/presentation/quick-replies.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'

function reply(overrides: Partial<QuickReplyRecord> = {}): QuickReplyRecord {
  return {
    active: true,
    audience: 'contractor',
    bodyText: 'Podem confirmar a autorização da descarga?',
    id: '00000000-0000-4000-8000-000000000101',
    position: 0,
    ...overrides,
  }
}

function createFake(rows: QuickReplyRecord[] = []) {
  const calls: { readonly name: string; readonly input: unknown }[] = []
  const transaction: QuickRepliesTransactionPort = {
    countByAudience: async ({ audience }) => rows.filter((row) => row.audience === audience).length,
    insert: async (input) => {
      calls.push({ input, name: 'insert' })
      return reply({ ...input, id: 'new-reply' })
    },
    list: async (input) => {
      calls.push({ input, name: 'list' })
      return rows
    },
    lockAudience: async ({ audience }) => rows.filter((row) => row.audience === audience),
    setPositions: async (input) => {
      calls.push({ input, name: 'setPositions' })
    },
    update: async (input) => {
      calls.push({ input, name: 'update' })
      const found = rows.find((row) => row.id === input.id)
      return found === undefined ? null : { ...found, ...input }
    },
  }
  const useCase = createQuickRepliesUseCase({
    unitOfWork: { execute: (work) => work(transaction) },
  })
  return { calls, useCase }
}

describe('as respostas rápidas — caso de uso (spec 183 T701)', () => {
  test('a nova entra no fim do público, com o texto aparado', async () => {
    const { calls, useCase } = createFake([reply(), reply({ audience: 'driver', id: 'd-1' })])

    await useCase.create({
      audience: 'contractor',
      bodyText: '  Recebemos, obrigado.  ',
      companyId: COMPANY_ID,
    })

    expect(calls.at(-1)).toEqual({
      input: {
        audience: 'contractor',
        bodyText: 'Recebemos, obrigado.',
        companyId: COMPANY_ID,
        position: 1,
      },
      name: 'insert',
    })
  })

  test.each([
    ['em branco', '   '],
    ['acima de 500', 'x'.repeat(501)],
  ])('texto %s é 422 sem gravar', async (_label, bodyText) => {
    const { calls, useCase } = createFake()

    await expect(
      useCase.create({ audience: 'driver', bodyText, companyId: COMPANY_ID }),
    ).rejects.toMatchObject({ code: 'QUICK_REPLY_INVALID', status: 422 })
    await expect(
      useCase.update({ bodyText, companyId: COMPANY_ID, id: reply().id }),
    ).rejects.toMatchObject({ status: 422 })
    expect(calls).toEqual([])
  })

  test('editar e desativar mexem só no que veio; resposta de fora da empresa é 404', async () => {
    const { calls, useCase } = createFake([reply()])

    await useCase.update({ active: false, companyId: COMPANY_ID, id: reply().id })
    expect(calls.at(-1)).toEqual({
      input: { active: false, companyId: COMPANY_ID, id: reply().id },
      name: 'update',
    })
    await expect(
      useCase.update({ active: true, companyId: COMPANY_ID, id: 'de-outra-empresa' }),
    ).rejects.toMatchObject({ code: 'QUICK_REPLY_NOT_FOUND', status: 404 })
  })

  test('reordenar grava as posições na ordem pedida', async () => {
    const rows = [reply({ id: 'a', position: 0 }), reply({ id: 'b', position: 1 })]
    const { calls, useCase } = createFake(rows)

    await useCase.reorder({ audience: 'contractor', companyId: COMPANY_ID, ids: ['b', 'a'] })

    expect(calls.find((call) => call.name === 'setPositions')?.input).toEqual({
      companyId: COMPANY_ID,
      positions: [
        { id: 'b', position: 0 },
        { id: 'a', position: 1 },
      ],
    })
  })

  test.each([
    ['faltando uma', ['a']],
    ['com uma de outro público', ['a', 'b', 'd-1']],
    ['repetida', ['a', 'a']],
  ])('reordenar %s é 422 sem gravar', async (_label, ids) => {
    const rows = [
      reply({ id: 'a', position: 0 }),
      reply({ id: 'b', position: 1 }),
      reply({ audience: 'driver', id: 'd-1' }),
    ]
    const { calls, useCase } = createFake(rows)

    await expect(
      useCase.reorder({ audience: 'contractor', companyId: COMPANY_ID, ids }),
    ).rejects.toMatchObject({ code: 'QUICK_REPLY_ORDER_INVALID', status: 422 })
    expect(calls.some((call) => call.name === 'setPositions')).toBe(false)
  })

  test('o compositor lê só as ativas do público; o cadastro lê todas', async () => {
    const { calls, useCase } = createFake([reply()])

    await useCase.listForComposer({ audience: 'driver', companyId: COMPANY_ID })
    await useCase.listAll({ companyId: COMPANY_ID })

    expect(calls.map((call) => call.input)).toEqual([
      { activeOnly: true, audience: 'driver', companyId: COMPANY_ID },
      { activeOnly: false, audience: null, companyId: COMPANY_ID },
    ])
  })
})

describe('as respostas rápidas — rotas (spec 183 T701)', () => {
  const routes = createQuickReplyRoutes({ quickReplies: {} as never })

  test('cadastro em settings.manage; o compositor lê com occurrences.resolve', () => {
    expect(
      routes.map((route) => ({
        policy: route.policy,
        signature: `${route.method} ${route.pathname}`,
      })),
    ).toEqual([
      {
        policy: { permission: 'settings.manage', scope: 'company' },
        signature: 'GET /company-settings/quick-replies',
      },
      {
        policy: { permission: 'settings.manage', scope: 'company' },
        signature: 'POST /company-settings/quick-replies',
      },
      {
        policy: { permission: 'settings.manage', scope: 'company' },
        signature: 'PUT /company-settings/quick-replies/order',
      },
      {
        policy: { permission: 'settings.manage', scope: 'company' },
        signature: 'PATCH /company-settings/quick-replies/:id',
      },
      {
        policy: { permission: 'occurrences.resolve', scope: 'company' },
        signature: 'GET /occurrence-quick-replies',
      },
    ])
  })

  test('o corpo é estrito e o público é fechado', async () => {
    const calls: unknown[] = []
    const [, create] = createQuickReplyRoutes({
      quickReplies: {
        create: async (input: unknown) => {
          calls.push(input)
          return reply()
        },
      } as never,
    })
    const post = (body: unknown) =>
      create!.execute({
        context: { scope: { companyId: COMPANY_ID } } as never,
        pathParameters: {},
        request: new Request('http://api.test/company-settings/quick-replies', {
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
        }),
      } as never)

    const response = await post({ audience: 'driver', text: 'Pode descarregar.' })
    expect(response.status).toBe(201)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([
      { audience: 'driver', bodyText: 'Pode descarregar.', companyId: COMPANY_ID },
    ])
    await expect(post({ audience: 'supplier', text: 'x' })).rejects.toMatchObject({ status: 400 })
    await expect(post({ audience: 'driver', companyId: 'x', text: 'x' })).rejects.toMatchObject({
      status: 400,
    })
  })

  test('o compositor pede o público na query', async () => {
    const calls: unknown[] = []
    const composer = createQuickReplyRoutes({
      quickReplies: {
        listForComposer: async (input: unknown) => {
          calls.push(input)
          return [reply()]
        },
      } as never,
    }).at(-1)
    const get = (query: string) =>
      composer!.execute({
        context: { scope: { companyId: COMPANY_ID } } as never,
        pathParameters: {},
        request: new Request(`http://api.test/occurrence-quick-replies${query}`),
      } as never)

    const response = await get('?audience=contractor')
    expect(await response.json()).toEqual({
      data: [
        {
          active: true,
          audience: 'contractor',
          id: reply().id,
          position: 0,
          text: reply().bodyText,
        },
      ],
    })
    expect(calls).toEqual([{ audience: 'contractor', companyId: COMPANY_ID }])
    await expect(get('')).rejects.toMatchObject({ status: 400 })
  })
})
