/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T5: as rotas da caixa de conversas — permissão, empresa só do contexto, formato fechado da resposta (sem JID
 * nem telefone) e a trilha de auditoria de assumir e devolver.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type {
  WhatsAppChat,
  WhatsAppChatAudit,
  WhatsAppChatMessage,
  WhatsAppChatRepositoryPort,
} from '../../src/whatsapp-inbox/application/whatsapp-chat.port.js'
import { createWhatsAppChatTakeoverService } from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover.service.js'
import { createWhatsAppInboxUseCase } from '../../src/whatsapp-inbox/application/whatsapp-inbox.use-case.js'
import { createWhatsAppInboxRoutes } from '../../src/whatsapp-inbox/presentation/whatsapp-inbox.routes.js'
import {
  authenticatedContext,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const CHAT_ID = '00000000-0000-4000-8000-000000031910'
const OTHER_CHAT_ID = '00000000-0000-4000-8000-000000031911'
const RESOLVE: CompanyContext['permissions'] = new Set(['occurrences.resolve'] as const)
const NOW = new Date('2026-11-10T12:00:00.000Z')

function chat(overrides: Partial<WhatsAppChat> = {}): WhatsAppChat {
  return {
    chatJid: '5516999990000@s.whatsapp.net',
    companyId: 'company',
    createdAt: new Date('2026-11-10T10:00:00.000Z'),
    expiresAt: null,
    id: CHAT_ID,
    kind: 'direct',
    lastInboundAt: new Date('2026-11-10T11:00:00.000Z'),
    lastMessageAt: new Date('2026-11-10T11:00:00.000Z'),
    readAt: null,
    releaseReason: null,
    releasedAt: null,
    releasedByUserId: null,
    state: 'bot',
    takenOverAt: null,
    takenOverByUserId: null,
    ...overrides,
  }
}

function createFixture(permissions: CompanyContext['permissions'] = RESOLVE) {
  const audits: WhatsAppChatAudit[] = []
  const listed: unknown[] = []
  let current = chat()
  const message: WhatsAppChatMessage = {
    author: 'driver',
    authorUserId: null,
    bodyText: 'oi',
    chatId: CHAT_ID,
    companyId: 'company',
    contentKind: 'text',
    direction: 'inbound',
    failureReason: null,
    id: '00000000-0000-4000-8000-000000031920',
    occurredAt: new Date('2026-11-10T11:00:00.000Z'),
    providerMessageId: 'WAID-SECRETO',
    senderPhone: '5516999990000',
    status: null,
  }
  const repository: WhatsAppChatRepositoryPort = {
    async appendMessage() {
      throw new Error('not used')
    },
    async ensureChat() {
      throw new Error('not used')
    },
    async expireDue() {
      return []
    },
    async extendTakeover() {
      return null
    },
    async findChat(input) {
      return input.chatId === CHAT_ID ? current : null
    },
    async findChatByJid() {
      return null
    },
    async findMessage() {
      return null
    },
    async findTakeoverTimeoutSeconds() {
      return null
    },
    async listChats(input) {
      listed.push(structuredClone(input))
      return { items: [current], nextCursor: null }
    },
    async listMessages() {
      return { items: [message], nextCursor: null }
    },
    async markRead() {
      current = chat({ ...current, readAt: NOW })
      return current
    },
    async recordAudit(input) {
      audits.push(input)
    },
    async release() {
      const before = current
      current = chat({ releaseReason: 'manual', state: 'bot' })
      return { chat: current, outcome: before.state === 'operator' ? 'released' : 'already_bot' }
    },
    async takeOver(input) {
      if (current.state === 'operator' && current.takenOverByUserId !== input.userId) {
        return {
          expiresAt: current.expiresAt ?? NOW,
          holderUserId: current.takenOverByUserId ?? '',
          outcome: 'held',
        }
      }
      const renewed = current.state === 'operator'
      current = chat({
        expiresAt: input.expiresAt,
        state: 'operator',
        takenOverAt: input.now,
        takenOverByUserId: input.userId,
      })
      return { chat: current, outcome: renewed ? 'renewed' : 'taken' }
    },
    async updateMessageStatus() {
      return null
    },
  }
  const takeover = createWhatsAppChatTakeoverService({ clock: () => NOW, repository })
  const inbox = createWhatsAppInboxUseCase({ clock: () => NOW, repository, takeover })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(permissions),
      routes: createWhatsAppInboxRoutes({ inbox }),
    }),
  })
  return {
    audits,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    listed,
  }
}

describe('as rotas da caixa de conversas (spec 319 T5)', () => {
  test('sem occurrences.resolve nenhuma rota responde', async () => {
    const fixture = createFixture(new Set(['fleet.read'] as const))
    for (const request of [
      jsonRequest({ method: 'GET', path: '/whatsapp-inbox/chats' }),
      jsonRequest({ method: 'GET', path: `/whatsapp-inbox/chats/${CHAT_ID}/messages` }),
      jsonRequest({ method: 'POST', path: `/whatsapp-inbox/chats/${CHAT_ID}/take-over` }),
      jsonRequest({ method: 'POST', path: `/whatsapp-inbox/chats/${CHAT_ID}/release` }),
      jsonRequest({ method: 'POST', path: `/whatsapp-inbox/chats/${CHAT_ID}/read` }),
    ]) {
      expect((await fixture.handle(request)).status).toBe(403)
    }
    expect(fixture.audits).toEqual([])
  })

  test('a lista não publica JID nem telefone e marca o não lido', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: '/whatsapp-inbox/chats?state=bot&unread=true&limit=10' }),
    )
    const text = await response.text()
    const body = JSON.parse(text) as { data: Record<string, unknown>[]; nextCursor: string | null }

    expect(response.status).toBe(200)
    expect(Object.keys(body.data[0] ?? {}).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'kind',
      'lastInboundAt',
      'lastMessageAt',
      'releaseReason',
      'state',
      'takenOverAt',
      'takenOverByUserId',
      'unread',
    ])
    expect(body.data[0]?.unread).toBe(true)
    expect(text).not.toContain('5516999990000')
    expect(text).not.toContain('s.whatsapp.net')
    expect(fixture.listed[0]).toMatchObject({
      limit: 10,
      state: 'bot',
      unreadOnly: true,
    })
  })

  test('query desconhecida ou valor fora da lista é 400', async () => {
    const fixture = createFixture()
    for (const path of [
      '/whatsapp-inbox/chats?companyId=x',
      '/whatsapp-inbox/chats?state=outro',
      '/whatsapp-inbox/chats?unread=false',
    ]) {
      expect((await fixture.handle(jsonRequest({ method: 'GET', path }))).status).toBe(400)
    }
    // O segmento que não é uuid nem casa a rota (o roteador só aceita uuid canônico no `:id`).
    const notUuid = jsonRequest({
      method: 'GET',
      path: '/whatsapp-inbox/chats/nao-e-uuid/messages',
    })
    expect((await fixture.handle(notUuid)).status).toBe(404)
  })

  test('o histórico não publica telefone nem id do provedor', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `/whatsapp-inbox/chats/${CHAT_ID}/messages` }),
    )
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).toContain('"bodyText":"oi"')
    expect(text).not.toContain('WAID-SECRETO')
    expect(text).not.toContain('5516999990000')
  })

  test('chat de outra empresa ou inexistente é 404', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `/whatsapp-inbox/chats/${OTHER_CHAT_ID}/messages` }),
    )
    expect(response.status).toBe(404)
  })

  test('assumir audita uma vez; renovar o próprio prazo não audita de novo', async () => {
    const fixture = createFixture()
    const path = `/whatsapp-inbox/chats/${CHAT_ID}/take-over`

    const first = await fixture.handle(jsonRequest({ method: 'POST', path }))
    expect(first.status).toBe(200)
    expect(((await first.json()) as { renewed: boolean }).renewed).toBe(false)

    const second = await fixture.handle(jsonRequest({ method: 'POST', path }))
    expect(((await second.json()) as { renewed: boolean }).renewed).toBe(true)

    expect(fixture.audits.map((audit) => audit.action)).toEqual(['whatsapp_chat.taken_over'])
    expect(fixture.audits[0]).toMatchObject({ afterState: 'operator', beforeState: 'bot' })
  })

  test('devolver audita só quando havia atendente', async () => {
    const fixture = createFixture()
    await fixture.handle(
      jsonRequest({ method: 'POST', path: `/whatsapp-inbox/chats/${CHAT_ID}/take-over` }),
    )
    const path = `/whatsapp-inbox/chats/${CHAT_ID}/release`

    expect((await fixture.handle(jsonRequest({ method: 'POST', path }))).status).toBe(200)
    expect((await fixture.handle(jsonRequest({ method: 'POST', path }))).status).toBe(200)

    expect(fixture.audits.map((audit) => audit.action)).toEqual([
      'whatsapp_chat.taken_over',
      'whatsapp_chat.released',
    ])
  })

  test('marcar como lido devolve o chat sem novidade', async () => {
    const fixture = createFixture()
    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: `/whatsapp-inbox/chats/${CHAT_ID}/read` }),
    )
    const body = (await response.json()) as { data: { unread: boolean } }
    expect(response.status).toBe(200)
    expect(body.data.unread).toBe(false)
  })
})
