/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T2: o serviço de assumir/devolver com dublê do repositório — o segundo atendente recebe 409 com quem
 * segura, o próprio renova, o prazo vem da empresa, devolver com o bot é sem efeito, o chat que nunca existiu é do
 * bot e JID fora da caixa é 400. Atomicidade de verdade fica na integração (Postgres).
 */
import { describe, expect, test } from 'bun:test'

import type {
  WhatsAppChat,
  WhatsAppChatRepositoryPort,
} from '../../src/whatsapp-inbox/application/whatsapp-chat.port.js'
import { createWhatsAppChatTakeoverService } from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover.service.js'
import { ApiError } from '../../src/shared/api.error.js'

const COMPANY = '00000000-0000-4000-8000-000000031900'
const ANA = '00000000-0000-4000-8000-000000031901'
const BIA = '00000000-0000-4000-8000-000000031902'
const GROUP = '120363025246125486@g.us'

function createFakeRepository(timeoutSeconds: number | null) {
  const chats = new Map<string, WhatsAppChat>()
  const calls: { expiresAt: Date; now: Date }[] = []
  let sequence = 0
  const key = (companyId: string, id: string) => `${companyId}:${id}`

  const repository: WhatsAppChatRepositoryPort = {
    async appendMessage() {
      throw new Error('not used')
    },
    async ensureChat(input) {
      const existing = [...chats.values()].find(
        (chat) => chat.companyId === input.companyId && chat.chatJid === input.chatJid,
      )
      if (existing !== undefined) return existing
      sequence += 1
      const chat: WhatsAppChat = {
        chatJid: input.chatJid,
        companyId: input.companyId,
        createdAt: new Date(0),
        expiresAt: null,
        id: `chat-${sequence}`,
        kind: input.kind,
        lastInboundAt: null,
        lastMessageAt: null,
        readAt: null,
        releaseReason: null,
        releasedAt: null,
        releasedByUserId: null,
        state: 'bot',
        takenOverAt: null,
        takenOverByUserId: null,
      }
      chats.set(key(chat.companyId, chat.id), chat)
      return chat
    },
    async expireDue() {
      return []
    },
    async extendTakeover(input) {
      const chat = chats.get(key(input.companyId, input.chatId))
      if (
        chat === undefined ||
        chat.state !== 'operator' ||
        chat.takenOverByUserId !== input.userId ||
        (chat.expiresAt?.getTime() ?? 0) <= input.now.getTime()
      ) {
        return null
      }
      const next = { ...chat, expiresAt: input.expiresAt }
      chats.set(key(input.companyId, input.chatId), next)
      return next
    },
    async findChat(input) {
      return chats.get(key(input.companyId, input.chatId)) ?? null
    },
    async findChatByJid(input) {
      return (
        [...chats.values()].find(
          (chat) => chat.companyId === input.companyId && chat.chatJid === input.chatJid,
        ) ?? null
      )
    },
    async findTakeoverTimeoutSeconds() {
      return timeoutSeconds
    },
    async release(input) {
      const chat = chats.get(key(input.companyId, input.chatId))
      if (chat === undefined) return { outcome: 'not_found' }
      if (chat.state === 'bot') return { chat, outcome: 'already_bot' }
      const next: WhatsAppChat = {
        ...chat,
        expiresAt: null,
        releaseReason: 'manual',
        releasedAt: input.now,
        releasedByUserId: input.userId,
        state: 'bot',
        takenOverAt: null,
        takenOverByUserId: null,
      }
      chats.set(key(input.companyId, input.chatId), next)
      return { chat: next, outcome: 'released' }
    },
    async takeOver(input) {
      calls.push({ expiresAt: input.expiresAt, now: input.now })
      const chat = chats.get(key(input.companyId, input.chatId))
      if (chat === undefined) return { outcome: 'not_found' }
      const live =
        chat.state === 'operator' && (chat.expiresAt?.getTime() ?? 0) > input.now.getTime()
      if (live && chat.takenOverByUserId !== input.userId) {
        return {
          expiresAt: chat.expiresAt as Date,
          holderUserId: chat.takenOverByUserId as string,
          outcome: 'held',
        }
      }
      const next: WhatsAppChat = {
        ...chat,
        expiresAt: input.expiresAt,
        releaseReason: null,
        releasedAt: null,
        releasedByUserId: null,
        state: 'operator',
        takenOverAt: live ? chat.takenOverAt : input.now,
        takenOverByUserId: input.userId,
      }
      chats.set(key(input.companyId, input.chatId), next)
      return { chat: next, outcome: live ? 'renewed' : 'taken' }
    },
    async updateMessageStatus() {
      return null
    },
  }
  return { calls, repository }
}

function setUp(timeoutSeconds: number | null = null) {
  let now = new Date('2026-11-10T22:00:00.000Z')
  const fake = createFakeRepository(timeoutSeconds)
  const service = createWhatsAppChatTakeoverService({
    clock: () => now,
    repository: fake.repository,
  })
  return {
    advance(seconds: number) {
      now = new Date(now.getTime() + seconds * 1000)
    },
    calls: fake.calls,
    service,
  }
}

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work
  } catch (error) {
    if (error instanceof ApiError) return error.code
    throw error
  }
  throw new Error('expected an ApiError')
}

describe('assumir e devolver o chat (spec 319 T2)', () => {
  test('o chat que nunca existiu é do bot; JID fora da caixa é 400', async () => {
    const { service } = setUp()
    expect(await service.attendanceOf({ chatJid: GROUP, companyId: COMPANY })).toEqual({
      kind: 'bot',
    })
    expect(
      await codeOf(service.ensureChat({ chatJid: '123456789012345@lid', companyId: COMPANY })),
    ).toBe('WHATSAPP_CHAT_JID_INVALID')
  })

  test('assumir cala o bot pelo prazo padrão; o segundo atendente recebe 409 com quem segura', async () => {
    const { calls, service } = setUp()
    const chat = await service.ensureChat({ chatJid: GROUP, companyId: COMPANY })
    const taken = await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    expect(taken.renewed).toBe(false)
    const [first] = calls
    if (first === undefined) throw new Error('takeOver not called')
    expect(first.expiresAt.getTime() - first.now.getTime()).toBe(1800 * 1000)
    expect(await service.attendanceOf({ chatJid: GROUP, companyId: COMPANY })).toMatchObject({
      kind: 'operator',
      userId: ANA,
    })

    let refusal: unknown
    try {
      await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: BIA })
    } catch (error) {
      refusal = error
    }
    expect(refusal).toBeInstanceOf(ApiError)
    expect((refusal as ApiError).status).toBe(409)
    expect((refusal as ApiError).code).toBe('WHATSAPP_CHAT_ALREADY_TAKEN_OVER')
    expect((refusal as ApiError).extraBody).toEqual({
      takenOver: { expiresAt: '2026-11-10T22:30:00.000Z', userId: ANA },
    })
  })

  test('o próprio atendente renova; o prazo é o da empresa', async () => {
    const { advance, calls, service } = setUp(600)
    const chat = await service.ensureChat({ chatJid: GROUP, companyId: COMPANY })
    await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    advance(60)
    const again = await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    expect(again.renewed).toBe(true)
    expect(again.chat.takenOverAt).toEqual(new Date('2026-11-10T22:00:00.000Z'))
    expect(calls[1]?.expiresAt).toEqual(new Date('2026-11-10T22:11:00.000Z'))
  })

  test('vencido, a leitura já é do bot e outro atendente assume', async () => {
    const { advance, service } = setUp()
    const chat = await service.ensureChat({ chatJid: GROUP, companyId: COMPANY })
    await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    advance(1800)
    expect(await service.attendanceOf({ chatJid: GROUP, companyId: COMPANY })).toEqual({
      kind: 'bot',
    })
    expect(await service.touch({ chatId: chat.id, companyId: COMPANY, userId: ANA })).toBeNull()
    const taken = await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: BIA })
    expect(taken.chat.takenOverByUserId).toBe(BIA)
  })

  test('a mensagem do atendente empurra o prazo', async () => {
    const { advance, service } = setUp()
    const chat = await service.ensureChat({ chatJid: GROUP, companyId: COMPANY })
    await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    advance(1700)
    const touched = await service.touch({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    expect(touched?.expiresAt).toEqual(new Date('2026-11-10T22:58:20.000Z'))
    expect(await service.touch({ chatId: chat.id, companyId: COMPANY, userId: BIA })).toBeNull()
  })

  test('devolver religa o bot; devolver de novo é sem efeito; chat de outra empresa é 404', async () => {
    const { service } = setUp()
    const chat = await service.ensureChat({ chatJid: GROUP, companyId: COMPANY })
    await service.takeOver({ chatId: chat.id, companyId: COMPANY, userId: ANA })
    const released = await service.release({ chatId: chat.id, companyId: COMPANY, userId: BIA })
    expect(released).toMatchObject({
      releaseReason: 'manual',
      releasedByUserId: BIA,
      state: 'bot',
    })
    expect(await service.attendanceOf({ chatJid: GROUP, companyId: COMPANY })).toEqual({
      kind: 'bot',
    })
    expect(
      (await service.release({ chatId: chat.id, companyId: COMPANY, userId: ANA })).state,
    ).toBe('bot')
    expect(
      await codeOf(
        service.takeOver({
          chatId: chat.id,
          companyId: '00000000-0000-4000-8000-000000031999',
          userId: ANA,
        }),
      ),
    ).toBe('WHATSAPP_CHAT_NOT_FOUND')
  })
})
