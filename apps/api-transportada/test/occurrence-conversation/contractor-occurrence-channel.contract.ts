/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318 (T6): as rotas do canal do aviso de ocorrência da contratante. Tudo é `settings.manage`; o número digitado
 * é validado e gravado só com dígitos e o 55; a lista de grupos mostra o dono de cada um (motorista ou contratante,
 * RF5); o teste manda a mensagem ao grupo com a marca e traduz a falha num motivo fechado.
 */
import { describe, expect, test } from 'bun:test'

import {
  createContractorOccurrenceChannelUseCase,
  type ContractorOccurrenceChannelRepositoryPort,
  type ContractorOccurrenceChannelView,
} from '../../src/occurrence-conversation/application/contractor-occurrence-channel.use-case.js'
import { ContractorReplyWhatsAppSendError } from '../../src/occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import { ContractorOccurrenceGroupTakenError } from '../../src/occurrence-conversation/domain/contractor-occurrence-channel.error.js'
import { createContractorOccurrenceChannelRoutes } from '../../src/occurrence-conversation/presentation/contractor-occurrence-channel.routes.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const CONTRACTOR_ID = '00000000-0000-4000-8000-0000000318c1'
const PATH = `/contractors/${CONTRACTOR_ID}/occurrence-channel`
const GROUP_JID = '120363000000000001@g.us'
const MANAGE: CompanyContext['permissions'] = new Set(['settings.manage'] as const)
const FLEET_ONLY: CompanyContext['permissions'] = new Set(['fleet.read', 'fleet.manage'] as const)

const EMAIL_VIEW: ContractorOccurrenceChannelView = {
  channel: 'email',
  emailFallback: true,
  groupJid: null,
  groupName: '',
  mentionPhone: null,
  updatedAt: null,
}

const GROUP_VIEW: ContractorOccurrenceChannelView = {
  channel: 'whatsapp_group',
  emailFallback: true,
  groupJid: GROUP_JID,
  groupName: 'Única — ocorrências',
  mentionPhone: '5516999990000',
  updatedAt: '2026-11-10T00:00:00.000Z',
}

function repository(
  overrides: Partial<ContractorOccurrenceChannelRepositoryPort> = {},
): ContractorOccurrenceChannelRepositoryPort & { readonly saved: unknown[] } {
  const saved: unknown[] = []
  return {
    find: async () => GROUP_VIEW,
    listOwners: async () => [],
    readGroupTemplate: async () => 'Ocorrência na NF {{numeroNota}}',
    save: async (input) => {
      saved.push(input)
      return GROUP_VIEW
    },
    saved,
    ...overrides,
  }
}

function createFixture(
  input: {
    readonly permissions?: CompanyContext['permissions']
    readonly repository?: ContractorOccurrenceChannelRepositoryPort
  } = {},
) {
  const repo = input.repository ?? repository()
  const useCase = createContractorOccurrenceChannelUseCase({
    listEvolutionGroups: async () => [],
    repository: repo,
    sendGroupText: async () => undefined,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(input.permissions ?? MANAGE),
      routes: createContractorOccurrenceChannelRoutes({ useCase }),
    }),
  })
  return { handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

describe('as rotas do canal de ocorrência da contratante (spec 318 T6)', () => {
  test('quem só mexe na frota não lê nem troca o canal', async () => {
    const fixture = createFixture({ permissions: FLEET_ONLY })

    for (const request of [
      jsonRequest({ method: 'GET', path: PATH }),
      jsonRequest({ body: { channel: 'email' }, method: 'PUT', path: PATH }),
      jsonRequest({ method: 'GET', path: '/contractor-occurrence-channels/whatsapp-groups' }),
    ]) {
      expect((await fixture.handle(request)).status).toBe(403)
    }
  })

  test('o número digitado é gravado só com dígitos e o 55', async () => {
    const repo = repository()
    const fixture = createFixture({ repository: repo })

    const response = await fixture.handle(
      jsonRequest({
        body: {
          channel: 'whatsapp_group',
          emailFallback: false,
          groupJid: GROUP_JID,
          groupName: 'Única',
          mentionPhone: '(16) 99999-0000',
        },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(repo.saved).toEqual([
      expect.objectContaining({
        channel: 'whatsapp_group',
        contractorId: CONTRACTOR_ID,
        emailFallback: false,
        groupJid: GROUP_JID,
        mentionPhone: '5516999990000',
      }),
    ])
  })

  test.each([
    ['número inválido', { mentionPhone: '123' }],
    ['grupo que não é @g.us', { groupJid: '5516999990000@s.whatsapp.net' }],
    ['grupo sem número', { mentionPhone: undefined }],
    ['campo desconhecido', { extra: true }],
  ])('%s é 400', async (_, patch) => {
    const repo = repository()
    const fixture = createFixture({ repository: repo })

    const response = await fixture.handle(
      jsonRequest({
        body: {
          channel: 'whatsapp_group',
          emailFallback: true,
          groupJid: GROUP_JID,
          mentionPhone: '16999990000',
          ...patch,
        },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(repo.saved).toEqual([])
  })

  test('RF5: grupo que já é de motorista é 409', async () => {
    const fixture = createFixture({
      repository: repository({
        save: async () => {
          throw new ContractorOccurrenceGroupTakenError('driver')
        },
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: {
          channel: 'whatsapp_group',
          emailFallback: true,
          groupJid: GROUP_JID,
          mentionPhone: '16999990000',
        },
        method: 'PUT',
        path: PATH,
      }),
    )

    expect(response.status).toBe(409)
    expect(await response.text()).toContain('CONTRACTOR_OCCURRENCE_GROUP_TAKEN')
  })

  test('voltar ao e-mail não pede grupo nem número', async () => {
    const repo = repository()
    const fixture = createFixture({ repository: repo })

    const response = await fixture.handle(
      jsonRequest({ body: { channel: 'email' }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(repo.saved).toEqual([expect.objectContaining({ channel: 'email', emailFallback: true })])
  })

  test('o teste conta no Postgres, num balde próprio', () => {
    const routes = createContractorOccurrenceChannelRoutes({ useCase: {} as never })

    expect(
      routes
        .filter((route) => route.rateLimit !== undefined)
        .map((route) => ({
          rateLimit: route.rateLimit,
          signature: `${route.method} ${route.pathname}`,
        })),
    ).toEqual([
      {
        rateLimit: {
          maxRequests: 10,
          scope: 'contractor-occurrence-channel-test',
          store: 'postgres',
          windowSeconds: 300,
        },
        signature: 'POST /contractors/:id/occurrence-channel/test',
      },
    ])
  })
})

describe('o caso de uso do canal (spec 318 T6)', () => {
  test('a lista de grupos marca o dono de cada um (RF5)', async () => {
    const useCase = createContractorOccurrenceChannelUseCase({
      listEvolutionGroups: async () => [
        { groupJid: 'a@g.us', name: 'Motorista João' },
        { groupJid: 'b@g.us', name: 'Única' },
        { groupJid: 'c@g.us', name: 'Livre' },
      ],
      repository: repository({
        listOwners: async () => [
          { groupJid: 'a@g.us', id: 'driver-1', kind: 'driver', name: 'João' },
          { groupJid: 'b@g.us', id: 'contractor-1', kind: 'contractor', name: 'Única' },
        ],
      }),
      sendGroupText: async () => undefined,
    })

    expect(await useCase.listGroups({ companyId: 'company' })).toEqual([
      {
        groupJid: 'a@g.us',
        name: 'Motorista João',
        owner: { id: 'driver-1', kind: 'driver', name: 'João' },
      },
      {
        groupJid: 'b@g.us',
        name: 'Única',
        owner: { id: 'contractor-1', kind: 'contractor', name: 'Única' },
      },
      { groupJid: 'c@g.us', name: 'Livre', owner: null },
    ])
  })

  test('o teste posta no grupo com a marca e o cabeçalho de teste', async () => {
    const posts: { body: string; groupJid: string; mentionNumber: string }[] = []
    const useCase = createContractorOccurrenceChannelUseCase({
      listEvolutionGroups: async () => [],
      now: () => new Date('2026-11-10T13:00:00.000Z'),
      repository: repository(),
      sendGroupText: async (input) => void posts.push(input),
    })

    expect(await useCase.sendTest({ companyId: 'company', contractorId: CONTRACTOR_ID })).toEqual({
      sent: true,
    })
    expect(posts[0]?.groupJid).toBe(GROUP_JID)
    expect(posts[0]?.mentionNumber).toBe('5516999990000')
    expect(posts[0]?.body.startsWith('@5516999990000\n🧪')).toBe(true)
  })

  test.each([
    [
      'contratante no e-mail',
      { find: async () => EMAIL_VIEW },
      'CONTRACTOR_OCCURRENCE_GROUP_NOT_CONFIGURED',
    ],
    [
      'sem modelo em Notificações',
      { readGroupTemplate: async () => null },
      'CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_MISSING',
    ],
  ] as const)('o teste recusa: %s', async (_, overrides, code) => {
    const useCase = createContractorOccurrenceChannelUseCase({
      listEvolutionGroups: async () => [],
      repository: repository(overrides),
      sendGroupText: async () => undefined,
    })

    await expect(
      useCase.sendTest({ companyId: 'company', contractorId: CONTRACTOR_ID }),
    ).rejects.toMatchObject({ code })
  })

  test('o teste que não chega ao grupo diz o motivo fechado', async () => {
    const useCase = createContractorOccurrenceChannelUseCase({
      listEvolutionGroups: async () => [],
      repository: repository(),
      sendGroupText: async () => {
        throw new ContractorReplyWhatsAppSendError('number_not_found')
      },
    })

    await expect(
      useCase.sendTest({ companyId: 'company', contractorId: CONTRACTOR_ID }),
    ).rejects.toMatchObject({
      code: 'CONTRACTOR_OCCURRENCE_GROUP_TEST_FAILED',
      details: [{ field: 'reason', message: 'group_not_found' }],
      status: 502,
    })
  })
})
