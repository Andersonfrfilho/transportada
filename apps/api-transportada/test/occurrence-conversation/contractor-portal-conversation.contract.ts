/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9, ADR-0073): a conversa da contratante pelo portal. A conversa é nomeada
 * pela referência opaca; o recorte vem só de `resolveContractorScope`; referência de outra
 * contratante, inexistente, de ocorrência ainda não visível ou fora do formato respondem igual
 * (404); a resposta não tem id interno, nem autor da transportadora, nem nada do motorista; nada
 * aqui decide.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import type { ContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import { resolveContractorScope } from '../../src/contractor-portal/domain/contractor-scope.policy.js'
import { ContractorNotBoundError } from '../../src/contractor-portal/domain/contractor-portal.error.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type {
  ContractorPortalConversationTransactionPort,
  PortalConversationMessageRecord,
} from '../../src/occurrence-conversation/application/contractor-portal-conversation.port.js'
import {
  createContractorPortalConversationUseCase,
  PORTAL_CONVERSATION_SEND_OPERATION,
} from '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.js'
import { createContractorOccurrenceRoutes } from '../../src/contractor-portal/presentation/contractor-occurrence.routes.js'
import { createClientOccurrenceConversationRoutes } from '../../src/occurrence-conversation/presentation/client-occurrence-conversation.routes.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const PORTAL_USER_ID = '00000000-0000-4000-8000-000000000002'
const OPERATOR_USER_ID = '00000000-0000-4000-8000-000000000003'
const CONVERSATION_ID = '00000000-0000-4000-8000-000000000004'
const OCCURRENCE_ID = '00000000-0000-4000-8000-000000000005'
const REF = 'Qm9hcmQtcmVmZXJlbmNpYS0xMjM0NTY'
const NOW = new Date('2026-09-25T12:00:00.000Z')
const SCOPE = resolveContractorScope([{ contractorId: 'contractor-alfa', taxId: '11222333000181' }])

const CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: 'membership-portal',
  permissions: new Set(['deliveries.track']),
  roles: ['contractor'],
  userId: PORTAL_USER_ID,
}

type Fake = {
  readonly calls: { readonly name: string; readonly input: unknown }[]
  readonly idempotency: Map<string, { readonly fingerprint: string; readonly response: unknown }>
  readonly messages: PortalConversationMessageRecord[]
}

function createFake(options: { readonly found?: boolean; readonly scopeError?: Error } = {}) {
  const fake: Fake = {
    calls: [],
    idempotency: new Map(),
    messages: [
      {
        authorUserId: OPERATOR_USER_ID,
        bodyText: 'O recebedor recusou a caixa 3.',
        channel: 'email',
        createdAt: new Date('2026-09-24T10:00:00.000Z'),
        direction: 'outbound',
      },
      {
        authorUserId: null,
        bodyText: 'Pode devolver.',
        channel: 'whatsapp',
        createdAt: new Date('2026-09-24T11:00:00.000Z'),
        direction: 'inbound',
      },
      {
        authorUserId: PORTAL_USER_ID,
        bodyText: 'Mandei a nota de devolução.',
        channel: 'portal',
        createdAt: new Date('2026-09-24T11:30:00.000Z'),
        direction: 'inbound',
      },
    ],
  }
  const transaction: ContractorPortalConversationTransactionPort = {
    async ensureConversationRefs(input) {
      fake.calls.push({ input, name: 'ensureConversationRefs' })
      return new Map(input.occurrenceIds.map((id) => [id, `${REF}-${id.slice(-1)}`]))
    },
    async findConversation(input) {
      fake.calls.push({ input, name: 'findConversation' })
      return options.found === false ? null : { id: CONVERSATION_ID }
    },
    async findIdempotency({ idempotencyKey }) {
      return fake.idempotency.get(idempotencyKey) ?? null
    },
    async insertPortalMessage(input) {
      fake.calls.push({ input, name: 'insertPortalMessage' })
      return { createdAt: input.createdAt }
    },
    async listMessages(input) {
      fake.calls.push({ input, name: 'listMessages' })
      return fake.messages
    },
    async markRead(input) {
      fake.calls.push({ input, name: 'markRead' })
    },
    async saveIdempotency(input) {
      fake.idempotency.set(input.idempotencyKey, input)
    },
    async unreadCount(input) {
      fake.calls.push({ input, name: 'unreadCount' })
      return 1
    },
  }
  const useCase = createContractorPortalConversationUseCase({
    clock: () => NOW,
    fingerprintService: {
      create: async ({ fields, operation }) =>
        `${operation}:${fields.map((field) => new TextDecoder().decode(field)).join('|')}`,
    },
    newRef: () => REF,
    scopes: {
      resolveScope: async (): Promise<ContractorScope> => {
        if (options.scopeError !== undefined) throw options.scopeError
        return SCOPE
      },
    },
    unitOfWork: { execute: (work) => work(transaction) },
  })
  return { fake, useCase }
}

describe('a conversa da contratante pelo portal — caso de uso (spec 183 T651)', () => {
  test('a leitura sai sem id nem autor: só o lado, se foi a própria conta, o canal e o texto', async () => {
    const { fake, useCase } = createFake()

    const view = await useCase.read({ context: CONTEXT, ref: REF })

    expect(view).toEqual({
      messages: [
        {
          body: 'O recebedor recusou a caixa 3.',
          channel: 'email',
          createdAt: '2026-09-24T10:00:00.000Z',
          mine: false,
          side: 'carrier',
        },
        {
          body: 'Pode devolver.',
          channel: 'whatsapp',
          createdAt: '2026-09-24T11:00:00.000Z',
          mine: false,
          side: 'contractor',
        },
        {
          body: 'Mandei a nota de devolução.',
          channel: 'portal',
          createdAt: '2026-09-24T11:30:00.000Z',
          mine: true,
          side: 'contractor',
        },
      ],
      unreadCount: 1,
    })
    expect(fake.calls[0]).toEqual({
      input: { companyId: COMPANY_ID, ref: REF, scope: SCOPE },
      name: 'findConversation',
    })
  })

  test.each([
    ['referência de outra contratante, inexistente ou não visível', REF, false],
    ['referência fora do formato nem chega ao banco', 'x', true],
    ['id interno no lugar da referência', CONVERSATION_ID, true],
  ] as const)('%s responde 404 igual', async (_label, ref, found) => {
    const { fake, useCase } = createFake({ found })

    for (const run of [
      () => useCase.read({ context: CONTEXT, ref }),
      () => useCase.markRead({ context: CONTEXT, ref }),
      () =>
        useCase.send({
          bodyText: 'Oi',
          context: CONTEXT,
          idempotencyKey: 'portal-send-key-0001',
          ref,
        }),
    ]) {
      await expect(run()).rejects.toMatchObject({ code: 'OCCURRENCE_CASE_NOT_FOUND', status: 404 })
    }
    expect(fake.calls.some((call) => call.name === 'insertPortalMessage')).toBe(false)
    expect(fake.calls.some((call) => call.name === 'markRead')).toBe(false)
    if (ref !== REF) expect(fake.calls).toEqual([])
  })

  test('conta sem vínculo é recusa antes de qualquer leitura', async () => {
    const { fake, useCase } = createFake({ scopeError: new ContractorNotBoundError() })

    await expect(useCase.read({ context: CONTEXT, ref: REF })).rejects.toBeInstanceOf(
      ContractorNotBoundError,
    )
    expect(fake.calls).toEqual([])
  })

  test('o envio grava mensagem recebida pelo canal portal, da conta do contexto, com o texto aparado', async () => {
    const { fake, useCase } = createFake()

    const sent = await useCase.send({
      bodyText: '  Mandei a nota.  ',
      context: CONTEXT,
      idempotencyKey: 'portal-send-key-0001',
      ref: REF,
    })

    expect(sent).toEqual({ createdAt: NOW.toISOString() })
    expect(fake.calls.find((call) => call.name === 'insertPortalMessage')?.input).toEqual({
      authorUserId: PORTAL_USER_ID,
      bodyText: 'Mandei a nota.',
      companyId: COMPANY_ID,
      conversationId: CONVERSATION_ID,
      createdAt: NOW,
    })
  })

  test('a mesma chave com o mesmo texto devolve o gravado; com outro, 409', async () => {
    const { fake, useCase } = createFake()
    const send = (bodyText: string) =>
      useCase.send({ bodyText, context: CONTEXT, idempotencyKey: 'portal-send-key-0001', ref: REF })

    await send('Mandei a nota.')
    await send('Mandei a nota.')
    await expect(send('Outro texto')).rejects.toMatchObject({ status: 409 })

    expect(fake.calls.filter((call) => call.name === 'insertPortalMessage')).toHaveLength(1)
    expect([...fake.idempotency.values()][0]?.fingerprint).toStartWith(
      `${PORTAL_CONVERSATION_SEND_OPERATION}:`,
    )
  })

  test.each([
    ['em branco', '   '],
    ['acima de 8.000', 'x'.repeat(8001)],
  ])('texto %s é 422 sem gravar', async (_label, bodyText) => {
    const { fake, useCase } = createFake()

    await expect(
      useCase.send({
        bodyText,
        context: CONTEXT,
        idempotencyKey: 'portal-send-key-0001',
        ref: REF,
      }),
    ).rejects.toMatchObject({ status: 422 })
    expect(fake.calls.some((call) => call.name === 'insertPortalMessage')).toBe(false)
  })

  test('marcar como lida é por conta do portal', async () => {
    const { fake, useCase } = createFake()

    await useCase.markRead({ context: CONTEXT, ref: REF })

    expect(fake.calls.at(-1)).toEqual({
      input: { companyId: COMPANY_ID, conversationId: CONVERSATION_ID, userId: PORTAL_USER_ID },
      name: 'markRead',
    })
  })

  test('as referências da listagem saem pelo recorte, com a referência aleatória nova', async () => {
    const { fake, useCase } = createFake()

    const refs = await useCase.conversationRefs({
      context: CONTEXT,
      occurrenceIds: [OCCURRENCE_ID],
    })

    expect(refs.get(OCCURRENCE_ID)).toBe(`${REF}-5`)
    const call = fake.calls[0]?.input as { readonly scope: unknown; readonly newRef: () => string }
    expect(call.scope).toBe(SCOPE)
    expect(call.newRef()).toBe(REF)
  })

  test('listagem vazia não abre transação nem lê o recorte', async () => {
    const { fake, useCase } = createFake({ scopeError: new Error('não devia ler') })

    expect((await useCase.conversationRefs({ context: CONTEXT, occurrenceIds: [] })).size).toBe(0)
    expect(fake.calls).toEqual([])
  })
})

describe('a conversa da contratante pelo portal — rotas (spec 183 T651)', () => {
  function routesWith(calls: { name: string; input: unknown }[]) {
    return createClientOccurrenceConversationRoutes({
      conversation: {
        conversationRefs: async () => new Map(),
        markRead: async (input) => {
          calls.push({ input, name: 'markRead' })
        },
        read: async (input) => {
          calls.push({ input, name: 'read' })
          return { messages: [], unreadCount: 0 }
        },
        send: async (input) => {
          calls.push({ input, name: 'send' })
          return { createdAt: NOW.toISOString() }
        },
      },
    })
  }

  test('três rotas em /client/me/occurrence-conversations/:ref, todas deliveries.track', () => {
    const routes = routesWith([])

    expect(
      routes.map((route) => ({
        format: route.pathParameterFormat,
        policy: route.policy,
        signature: `${route.method} ${route.pathname}`,
      })),
    ).toEqual([
      {
        format: 'opaque',
        policy: { permission: 'deliveries.track', scope: 'company' },
        signature: 'GET /client/me/occurrence-conversations/:ref',
      },
      {
        format: 'opaque',
        policy: { permission: 'deliveries.track', scope: 'company' },
        signature: 'POST /client/me/occurrence-conversations/:ref/messages',
      },
      {
        format: 'opaque',
        policy: { permission: 'deliveries.track', scope: 'company' },
        signature: 'POST /client/me/occurrence-conversations/:ref/read',
      },
    ])
  })

  test('a leitura responde no-store e repassa a referência como veio', async () => {
    const calls: { name: string; input: unknown }[] = []
    const [read] = routesWith(calls)
    const response = await read!.execute({
      context: { scope: CONTEXT } as never,
      pathParameters: { ref: REF },
      request: new Request(`http://api.test/client/me/occurrence-conversations/${REF}`),
    } as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual({ data: { messages: [], unreadCount: 0 } })
    expect(calls).toEqual([{ input: { context: CONTEXT, ref: REF }, name: 'read' }])
  })

  test('o envio exige a chave de idempotência e aceita só { body }', async () => {
    const calls: { name: string; input: unknown }[] = []
    const [, send] = routesWith(calls)
    const post = (body: unknown, key: string | null) =>
      send!.execute({
        context: { scope: CONTEXT } as never,
        pathParameters: { ref: REF },
        request: new Request(`http://api.test/client/me/occurrence-conversations/${REF}/messages`, {
          body: JSON.stringify(body),
          headers: {
            'content-type': 'application/json',
            ...(key === null ? {} : { 'idempotency-key': key }),
          },
          method: 'POST',
        }),
      } as never)

    const created = await post({ body: 'Mandei a nota.' }, 'portal-send-key-0001')
    expect(created.status).toBe(201)
    expect(await created.json()).toEqual({ data: { createdAt: NOW.toISOString() } })
    expect(calls).toEqual([
      {
        input: {
          bodyText: 'Mandei a nota.',
          context: CONTEXT,
          idempotencyKey: 'portal-send-key-0001',
          ref: REF,
        },
        name: 'send',
      },
    ])

    await expect(post({ body: 'x' }, null)).rejects.toMatchObject({ status: 400 })
    await expect(
      post({ body: 'x', decision: 'approved' }, 'portal-send-key-0002'),
    ).rejects.toMatchObject({ status: 400 })
    expect(calls).toHaveLength(1)
  })

  test('marcar como lida responde 204 no-store', async () => {
    const calls: { name: string; input: unknown }[] = []
    const [, , markRead] = routesWith(calls)
    const response = await markRead!.execute({
      context: { scope: CONTEXT } as never,
      pathParameters: { ref: REF },
      request: new Request(`http://api.test/client/me/occurrence-conversations/${REF}/read`, {
        method: 'POST',
      }),
    } as never)

    expect(response.status).toBe(204)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(calls).toEqual([{ input: { context: CONTEXT, ref: REF }, name: 'markRead' }])
  })
})

describe('a conversa do portal por texto de fonte (spec 183 T651, ADR-0073)', () => {
  const FILES = [
    '../../src/occurrence-conversation/presentation/client-occurrence-conversation.routes.ts',
    '../../src/occurrence-conversation/application/contractor-portal-conversation.use-case.ts',
  ]

  test('nenhuma rota recebe id interno nem lê id do corpo', async () => {
    const routes = await readFile(new URL(FILES[0]!, import.meta.url), 'utf8')

    expect(routes).not.toContain('parseUuidPathIdentifier')
    expect(routes).not.toContain(':id')
    expect(routes).not.toMatch(/companyId|occurrenceId|conversationId|contractorId/u)
  })

  test('o recorte vem só do porto do escopo, e nada ali decide ou fala do motorista', async () => {
    for (const file of FILES) {
      const source = await readFile(new URL(file, import.meta.url), 'utf8')
      expect(source).not.toMatch(/taxId|driver|decide|decision|caseStatus|transition/iu)
      expect(source).not.toMatch(/console\.|logger\./u)
    }
  })
})

describe('a listagem da 164 ganha a conversationRef (spec 183 T651)', () => {
  function occurrence(occurrenceId: string) {
    return {
      caseStatus: 'awaiting_contractor' as const,
      decidedAt: null,
      decisionKind: null,
      items: [],
      nfeAccessKey: '35260911222333000181550010000045121000045128',
      nfeNumber: '4512',
      nfeSeries: '1',
      note: 'caixa com avaria',
      occurrenceId,
      occurrenceTypeName: 'Caixa violada',
      openedAt: '2026-09-24T10:00:00.000Z',
      stage: 'separation',
    }
  }

  test('uma leitura de referências por página; sem conversa possível, a referência é nula', async () => {
    const refCalls: unknown[] = []
    const [list] = createContractorOccurrenceRoutes({
      conversationRefs: async (input) => {
        refCalls.push(input)
        return new Map([[OCCURRENCE_ID, REF]])
      },
      decideOccurrenceCase: {
        decide: async () => {
          throw new Error('não usado')
        },
        list: async () => [occurrence(OCCURRENCE_ID), occurrence(CONVERSATION_ID)],
      },
      readAttachments: async () => [],
    })

    const response = await list!.execute({
      context: { scope: CONTEXT } as never,
      pathParameters: {},
      request: new Request('http://api.test/client/me/occurrences'),
    } as never)
    const body = (await response.json()) as {
      readonly data: readonly { readonly conversationRef: null | string }[]
    }

    expect(body.data.map((item) => item.conversationRef)).toEqual([REF, null])
    expect(refCalls).toEqual([
      { context: CONTEXT, occurrenceIds: [OCCURRENCE_ID, CONVERSATION_ID] },
    ])
  })
})
