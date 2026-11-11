/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T6 (RF3): o atendente que segura o chat fala como o número do bot. Duas fases (grava `queued`, chama o
 * Evolution, fecha `sent`/`failed`), o prazo anda a cada mensagem, o reenvio só sai de `failed`, e o corpo é só o texto.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type {
  NewWhatsAppChatMessage,
  WhatsAppChat,
  WhatsAppChatMessage,
  WhatsAppChatMessageStatusUpdate,
  WhatsAppChatRepositoryPort,
} from '../../src/whatsapp-inbox/application/whatsapp-chat.port.js'
import { createWhatsAppChatTakeoverService } from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover.service.js'
import { createWhatsAppInboxUseCase } from '../../src/whatsapp-inbox/application/whatsapp-inbox.use-case.js'
import { canAdvanceWhatsAppChatMessageStatus } from '../../src/whatsapp-inbox/domain/whatsapp-chat-message.policy.js'
import { createWhatsAppInboxRoutes } from '../../src/whatsapp-inbox/presentation/whatsapp-inbox.routes.js'
import {
  authenticatedContext,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  createTestRouter,
  FRONTEND_ORIGIN,
  jsonRequest,
} from '../fixtures/freight-region-http.fixture.js'

const CHAT_ID = '00000000-0000-4000-8000-000000031930'
const GROUP_CHAT_ID = '00000000-0000-4000-8000-000000031931'
const CO = COMPANY_CONTEXT.companyId
const US = COMPANY_CONTEXT.userId
const NOW = new Date('2026-11-11T12:00:00.000Z')
const RESOLVE: CompanyContext['permissions'] = new Set(['occurrences.resolve'] as const)

type SendCall = { readonly body: string; readonly companyId: string; readonly number: string }

function chat(overrides: Partial<WhatsAppChat> = {}): WhatsAppChat {
  return {
    chatJid: '5516999990000@s.whatsapp.net',
    companyId: CO,
    createdAt: NOW,
    expiresAt: null,
    id: CHAT_ID,
    kind: 'direct',
    lastInboundAt: null,
    lastMessageAt: null,
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

function createFixture(options: { readonly sender?: 'fail' | 'ok' | 'none' } = {}) {
  const chats = new Map<string, WhatsAppChat>([
    [CHAT_ID, chat()],
    [GROUP_CHAT_ID, chat({ chatJid: '120363000000000001@g.us', id: GROUP_CHAT_ID, kind: 'group' })],
  ])
  const messages = new Map<string, WhatsAppChatMessage>()
  const calls: SendCall[] = []
  const extended: Date[] = []
  let sequence = 0
  let senderMode = options.sender ?? 'ok'

  const repository: WhatsAppChatRepositoryPort = {
    async appendMessage(input: NewWhatsAppChatMessage) {
      sequence += 1
      const message: WhatsAppChatMessage = {
        author: input.author,
        authorUserId: input.authorUserId ?? null,
        bodyText: input.bodyText,
        chatId: input.chatId,
        companyId: input.companyId,
        contentKind: input.contentKind ?? 'text',
        direction: 'outbound',
        failureReason: null,
        id: `00000000-0000-4000-8000-00000003194${sequence}`,
        occurredAt: input.occurredAt ?? NOW,
        providerMessageId: null,
        senderPhone: null,
        status: 'queued',
      }
      messages.set(message.id, message)
      return { message, outcome: 'inserted' as const }
    },
    async ensureChat() {
      throw new Error('not used')
    },
    async expireDue() {
      return []
    },
    async extendTakeover(input) {
      const current = chats.get(input.chatId)
      if (
        current === undefined ||
        current.state !== 'operator' ||
        current.takenOverByUserId !== input.userId ||
        current.expiresAt === null ||
        current.expiresAt <= input.now
      ) {
        return null
      }
      extended.push(input.expiresAt)
      const next = { ...current, expiresAt: input.expiresAt }
      chats.set(next.id, next)
      return next
    },
    async findChat(input) {
      const found = chats.get(input.chatId)
      return found !== undefined && found.companyId === input.companyId ? found : null
    },
    async findChatByJid() {
      return null
    },
    async findMessage(input) {
      const found = messages.get(input.messageId)
      return found !== undefined && found.chatId === input.chatId ? found : null
    },
    async findTakeoverTimeoutSeconds() {
      return null
    },
    async listChats() {
      return { items: [], nextCursor: null }
    },
    async listMessages() {
      return { items: [], nextCursor: null }
    },
    async markRead() {
      return null
    },
    async recordAudit() {},
    async release() {
      return { outcome: 'not_found' as const }
    },
    async takeOver(input) {
      const current = chats.get(input.chatId)
      if (current === undefined) return { outcome: 'not_found' as const }
      const next = {
        ...current,
        expiresAt: input.expiresAt,
        state: 'operator' as const,
        takenOverAt: input.now,
        takenOverByUserId: input.userId,
      }
      chats.set(next.id, next)
      return { chat: next, outcome: 'taken' as const }
    },
    async updateMessageStatus(input: WhatsAppChatMessageStatusUpdate) {
      const current = messages.get(input.messageId ?? '')
      if (current === undefined || current.status === null) return null
      if (!canAdvanceWhatsAppChatMessageStatus(current.status, input.status)) return null
      const next: WhatsAppChatMessage = {
        ...current,
        failureReason: input.status === 'failed' ? (input.failureReason ?? 'failed') : null,
        providerMessageId: input.providerMessageId ?? current.providerMessageId,
        status: input.status,
      }
      messages.set(next.id, next)
      return next
    },
  }
  const takeover = createWhatsAppChatTakeoverService({ clock: () => NOW, repository })
  const inbox = createWhatsAppInboxUseCase({
    clock: () => NOW,
    repository,
    ...(options.sender === 'none'
      ? {}
      : {
          sender: {
            async sendText(call: SendCall) {
              calls.push(call)
              if (senderMode === 'fail') {
                throw Object.assign(new Error('x'), { failure: 'number_not_found' })
              }
              return { providerMessageId: `WAID-${calls.length}` }
            },
          },
        }),
    takeover,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(RESOLVE),
      routes: createWhatsAppInboxRoutes({ inbox }),
    }),
  })
  return {
    calls,
    extended,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    inbox,
    messages,
    setSender: (mode: 'fail' | 'ok') => {
      senderMode = mode
    },
    takeOver: (chatId: string) =>
      inbox.takeOver({ chatId, companyId: CO, correlationId: 'c', userId: US }),
  }
}

const actor = { companyId: CO, correlationId: 'c', userId: US }

describe('o atendente envia pelo chat assumido (spec 319 T6)', () => {
  test('sem assumir, não envia e nada é gravado nem chamado', async () => {
    const f = createFixture()
    await expect(f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'oi' })).rejects.toMatchObject({
      code: 'WHATSAPP_CHAT_NOT_HELD',
      status: 409,
    })
    expect(f.messages.size).toBe(0)
    expect(f.calls).toEqual([])
  })

  test('chat de outra empresa é 404, igual ao que não existe', async () => {
    const f = createFixture()
    await expect(
      f.inbox.send({ ...actor, chatId: CHAT_ID, companyId: 'other', text: 'oi' }),
    ).rejects.toMatchObject({ code: 'WHATSAPP_CHAT_NOT_FOUND', status: 404 })
  })

  test('privado sai pelos dígitos, vira sent com o id do provedor e empurra o prazo', async () => {
    const f = createFixture()
    await f.takeOver(CHAT_ID)
    const message = await f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'Bom dia' })

    expect(f.calls).toEqual([{ body: 'Bom dia', companyId: CO, number: '5516999990000' }])
    expect(message).toMatchObject({
      author: 'operator',
      authorUserId: US,
      failureReason: null,
      providerMessageId: 'WAID-1',
      status: 'sent',
    })
    expect(f.extended).toHaveLength(1)
  })

  test('grupo sai pelo JID inteiro', async () => {
    const f = createFixture()
    await f.takeOver(GROUP_CHAT_ID)
    await f.inbox.send({ ...actor, chatId: GROUP_CHAT_ID, text: 'Atenção, motoristas' })
    expect(f.calls[0]?.number).toBe('120363000000000001@g.us')
  })

  test('falha do Evolution fecha como failed com o motivo, e a mensagem fica no histórico', async () => {
    const f = createFixture({ sender: 'fail' })
    await f.takeOver(CHAT_ID)
    const message = await f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'oi' })
    expect(message).toMatchObject({ failureReason: 'number_not_found', status: 'failed' })
    expect(f.messages.size).toBe(1)
  })

  test('sem Evolution na composição a mensagem falha como disconnected, não derruba', async () => {
    const f = createFixture({ sender: 'none' })
    await f.takeOver(CHAT_ID)
    const message = await f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'oi' })
    expect(message).toMatchObject({ failureReason: 'disconnected', status: 'failed' })
  })

  test('reenviar tira a linha de failed, chama de novo e fecha sent', async () => {
    const f = createFixture({ sender: 'fail' })
    await f.takeOver(CHAT_ID)
    const failed = await f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'oi' })
    f.setSender('ok')
    const retried = await f.inbox.retry({ ...actor, chatId: CHAT_ID, messageId: failed.id })

    expect(retried).toMatchObject({ failureReason: null, id: failed.id, status: 'sent' })
    expect(f.calls).toHaveLength(2)
    expect(f.messages.size).toBe(1)
  })

  test('só a mensagem failed do atendente é reenviada', async () => {
    const f = createFixture()
    await f.takeOver(CHAT_ID)
    const sent = await f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'oi' })
    await expect(
      f.inbox.retry({ ...actor, chatId: CHAT_ID, messageId: sent.id }),
    ).rejects.toMatchObject({ code: 'WHATSAPP_CHAT_MESSAGE_NOT_RETRYABLE', status: 409 })
    await expect(
      f.inbox.retry({
        ...actor,
        chatId: CHAT_ID,
        messageId: '00000000-0000-4000-8000-000000031999',
      }),
    ).rejects.toMatchObject({ code: 'WHATSAPP_CHAT_MESSAGE_NOT_FOUND', status: 404 })
    expect(f.calls).toHaveLength(1)
  })
})

describe('a rota de envio (spec 319 T6)', () => {
  test('201 com o formato fechado da mensagem, sem JID nem id do provedor', async () => {
    const f = createFixture()
    await f.takeOver(CHAT_ID)
    const response = await f.handle(
      jsonRequest({
        body: { text: '  Bom dia  ' },
        method: 'POST',
        path: `/whatsapp-inbox/chats/${CHAT_ID}/messages`,
      }),
    )
    const text = await response.text()
    expect(response.status).toBe(201)
    expect(Object.keys((JSON.parse(text) as { data: object }).data).sort()).toEqual([
      'author',
      'authorUserId',
      'bodyText',
      'contentKind',
      'direction',
      'failureReason',
      'id',
      'occurredAt',
      'status',
    ])
    expect(text).not.toContain('WAID')
    expect(text).not.toContain('5516999990000')
    expect(f.calls[0]?.body).toBe('Bom dia')
  })

  test('o corpo é só o texto: destino ou remetente no corpo, texto vazio ou acima de 4000 são 400', async () => {
    const f = createFixture()
    await f.takeOver(CHAT_ID)
    for (const body of [
      { number: '5511999999999', text: 'oi' },
      { chatJid: 'x@g.us', text: 'oi' },
      { text: '   ' },
      { text: 'a'.repeat(4001) },
      {},
    ]) {
      const response = await f.handle(
        jsonRequest({ body, method: 'POST', path: `/whatsapp-inbox/chats/${CHAT_ID}/messages` }),
      )
      expect(response.status).toBe(400)
    }
    expect(f.calls).toEqual([])
  })

  test('o texto de 4000 caracteres passa', async () => {
    const f = createFixture()
    await f.takeOver(CHAT_ID)
    const response = await f.handle(
      jsonRequest({
        body: { text: 'a'.repeat(4000) },
        method: 'POST',
        path: `/whatsapp-inbox/chats/${CHAT_ID}/messages`,
      }),
    )
    expect(response.status).toBe(201)
  })

  test('reenvio pela rota devolve 200 com a mensagem', async () => {
    const f = createFixture({ sender: 'fail' })
    await f.takeOver(CHAT_ID)
    const failed = await f.inbox.send({ ...actor, chatId: CHAT_ID, text: 'oi' })
    f.setSender('ok')
    const response = await f.handle(
      jsonRequest({
        method: 'POST',
        path: `/whatsapp-inbox/chats/${CHAT_ID}/messages/${failed.id}/retry`,
      }),
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: { status: string } }).data.status).toBe('sent')
  })
})
