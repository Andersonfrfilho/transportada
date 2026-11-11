/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T3 (RF2): com o chat assumido por um atendente, os dois trilhos de entrada do bot (o privado da 308 e o
 * grupo) não respondem nem avançam o pedido: só gravam a mensagem no histórico. Devolver ou vencer religa o bot.
 * O privado é cobrado no contrato do webhook (`test/whatsapp/evolution-webhook-use-case.contract.ts`).
 */
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../../src/shared/api.types.js'
import type {
  NewWhatsAppChatMessage,
  WhatsAppChat,
  WhatsAppChatRepositoryPort,
} from '../../src/whatsapp-inbox/application/whatsapp-chat.port.js'
import {
  createWhatsAppChatTakeoverGuard,
  WHATSAPP_CHAT_TAKEOVER_GUARD_LOG,
} from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover-guard.service.js'
import { createWhatsAppChatTakeoverService } from '../../src/whatsapp-inbox/application/whatsapp-chat-takeover.service.js'
import { classifyWhatsAppChatJid } from '../../src/whatsapp-inbox/domain/whatsapp-chat-jid.policy.js'
import {
  createEvolutionGroupIdentity,
  type EvolutionGroupDirectoryGatewayPort,
} from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  type AdmittedGroupMessage,
  createEvolutionGroupInbound,
  describeHeldMessage,
  type EvolutionMessageEvent,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000319'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000320'
const USER_ID = '00000000-0000-4000-8000-0000000003a1'
const DRIVER_ID = '00000000-0000-4000-8000-0000000003d1'
const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER = '5516988887777'
const DRIVER_LID = '22222222222222'
const SUPPORT = '5516977776666'
const NOW = new Date('2026-11-11T12:00:00.000Z')
const TEXT = 'o portão está fechado'

type LogEntry = { fields: Record<string, unknown>; level: string; message: string }

function createLogger() {
  const logs: LogEntry[] = []
  const logger = {
    error: (message: string, fields: Record<string, unknown>) =>
      logs.push({ fields, level: 'error', message }),
    info: (message: string, fields: Record<string, unknown>) =>
      logs.push({ fields, level: 'info', message }),
    warn: (message: string, fields: Record<string, unknown>) =>
      logs.push({ fields, level: 'warn', message }),
  } as unknown as ApiLogger
  return { logger, logs }
}

/** Dublê do repositório: só o que a guarda e o serviço usam, por empresa. */
function createRepository() {
  const chats = new Map<string, WhatsAppChat>()
  const appended: NewWhatsAppChatMessage[] = []
  const state = { failAppend: false, failLookup: false, lookups: 0 }
  const key = (companyId: string, chatJid: string) => `${companyId}|${chatJid}`
  const repository = {
    async appendMessage(input: NewWhatsAppChatMessage) {
      if (state.failAppend) throw new Error('db down')
      appended.push(input)
      return { message: {} as never, outcome: 'inserted' as const }
    },
    async ensureChat(input: { chatJid: string; companyId: string; kind: 'direct' | 'group' }) {
      const existing = chats.get(key(input.companyId, input.chatJid))
      if (existing !== undefined) return existing
      const chat = makeChat(input.companyId, input.chatJid, { state: 'bot' })
      chats.set(key(input.companyId, input.chatJid), chat)
      return chat
    },
    async findChatByJid(input: { chatJid: string; companyId: string }) {
      state.lookups += 1
      if (state.failLookup) throw new Error('db down')
      return chats.get(key(input.companyId, input.chatJid)) ?? null
    },
    async findTakeoverTimeoutSeconds() {
      return null
    },
  } as unknown as WhatsAppChatRepositoryPort
  /** Põe o chat com o atendente até `expiresAt` (padrão: daqui a 30 min). */
  const takeOver = (
    companyId: string,
    chatJid: string,
    expiresAt = new Date(NOW.getTime() + 1_800_000),
  ) =>
    chats.set(
      key(companyId, chatJid),
      makeChat(companyId, chatJid, { expiresAt, state: 'operator' }),
    )
  const release = (companyId: string, chatJid: string) =>
    chats.set(key(companyId, chatJid), makeChat(companyId, chatJid, { state: 'bot' }))
  return { appended, release, repository, state, takeOver }
}

function makeChat(
  companyId: string,
  chatJid: string,
  input: { expiresAt?: Date; state: 'bot' | 'operator' },
): WhatsAppChat {
  const operator = input.state === 'operator'
  return {
    chatJid,
    companyId,
    createdAt: NOW,
    expiresAt: operator ? (input.expiresAt ?? null) : null,
    id: `chat-${chatJid}`,
    kind: classifyWhatsAppChatJid(chatJid) ?? 'direct',
    lastInboundAt: null,
    lastMessageAt: null,
    readAt: null,
    releaseReason: null,
    releasedAt: null,
    releasedByUserId: null,
    state: input.state,
    takenOverAt: operator ? NOW : null,
    takenOverByUserId: operator ? USER_ID : null,
  }
}

function createGuard() {
  const { logger, logs } = createLogger()
  const store = createRepository()
  const guard = createWhatsAppChatTakeoverGuard({
    logger,
    repository: store.repository,
    service: createWhatsAppChatTakeoverService({ clock: () => NOW, repository: store.repository }),
  })
  return { guard, logs, ...store }
}

const held = {
  author: 'driver' as const,
  bodyText: TEXT,
  contentKind: 'text' as const,
  providerMessageId: 'P1',
  senderPhone: DRIVER,
}

describe('spec 319 T3: a guarda do chat assumido', () => {
  test('chat que nunca foi assumido é do bot: nada é montado nem gravado', async () => {
    const { appended, guard } = createGuard()
    let built = 0

    const result = await guard.holdIfTakenOver({
      chatJid: GROUP,
      companyId: COMPANY_ID,
      message: () => {
        built += 1
        return held
      },
    })

    expect(result).toBe(false)
    expect(built).toBe(0)
    expect(appended).toEqual([])
  })

  test('chat assumido segura a mensagem e grava no histórico, sem número nem texto no log', async () => {
    const { appended, guard, logs, takeOver } = createGuard()
    takeOver(COMPANY_ID, GROUP)

    expect(
      await guard.holdIfTakenOver({ chatJid: GROUP, companyId: COMPANY_ID, message: () => held }),
    ).toBe(true)

    expect(appended).toEqual([
      {
        author: 'driver',
        bodyText: TEXT,
        chatId: `chat-${GROUP}`,
        companyId: COMPANY_ID,
        contentKind: 'text',
        providerMessageId: 'P1',
        senderPhone: DRIVER,
      },
    ])
    expect(logs.map(({ message }) => message)).toEqual([WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.held])
    expect(JSON.stringify(logs)).not.toContain(DRIVER)
    expect(JSON.stringify(logs)).not.toContain(TEXT)
  })

  test('o assumido de uma empresa não cala o mesmo JID em outra', async () => {
    const { guard, takeOver } = createGuard()
    takeOver(OTHER_COMPANY_ID, GROUP)

    expect(
      await guard.holdIfTakenOver({ chatJid: GROUP, companyId: COMPANY_ID, message: () => held }),
    ).toBe(false)
  })

  test('devolver ou vencer o prazo religa o bot', async () => {
    const { guard, release, takeOver } = createGuard()
    const ask = () =>
      guard.holdIfTakenOver({ chatJid: GROUP, companyId: COMPANY_ID, message: () => held })

    takeOver(COMPANY_ID, GROUP)
    expect(await ask()).toBe(true)
    release(COMPANY_ID, GROUP)
    expect(await ask()).toBe(false)

    // Vencido e ainda não varrido pelo job da T7: já conta como bot na leitura.
    takeOver(COMPANY_ID, GROUP, NOW)
    expect(await ask()).toBe(false)
  })

  test('número fora de 8 a 15 dígitos vai ao histórico como nulo', async () => {
    const { appended, guard, takeOver } = createGuard()
    takeOver(COMPANY_ID, GROUP)

    await guard.holdIfTakenOver({
      chatJid: GROUP,
      companyId: COMPANY_ID,
      message: () => ({ ...held, senderPhone: '98765432101234567' }),
    })

    expect(appended.map(({ senderPhone }) => senderPhone)).toEqual([null])
  })

  test('sem conseguir perguntar quem atende, segue com o bot (como antes da 319) e loga', async () => {
    const { appended, guard, logs, state } = createGuard()
    state.failLookup = true

    expect(
      await guard.holdIfTakenOver({ chatJid: GROUP, companyId: COMPANY_ID, message: () => held }),
    ).toBe(false)
    expect(appended).toEqual([])
    expect(logs).toEqual([
      {
        fields: { companyId: COMPANY_ID, errorName: 'Error' },
        level: 'warn',
        message: WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.unavailable,
      },
    ])
  })

  test('assumido e a gravação falhou: o bot continua calado e o erro vai ao log', async () => {
    const { guard, logs, state, takeOver } = createGuard()
    takeOver(COMPANY_ID, GROUP)
    state.failAppend = true

    expect(
      await guard.holdIfTakenOver({ chatJid: GROUP, companyId: COMPANY_ID, message: () => held }),
    ).toBe(true)
    expect(logs).toEqual([
      {
        fields: { companyId: COMPANY_ID, errorName: 'Error', providerMessageId: 'P1' },
        level: 'warn',
        message: WHATSAPP_CHAT_TAKEOVER_GUARD_LOG.recordFailed,
      },
    ])
  })
})

describe('spec 319 T3: o que vai ao histórico', () => {
  const event = (overrides: Partial<EvolutionMessageEvent> = {}): EvolutionMessageEvent => ({
    chat: 'group',
    externalMessageId: 'M1',
    from: '',
    fromMe: false,
    groupJid: GROUP,
    mentionedJids: [],
    participant: DRIVER,
    pushName: 'Motorista',
    replyToExternalMessageId: null,
    text: TEXT,
    timestamp: 1,
    type: 'message',
    ...overrides,
  })
  const base = { audio: null, author: 'member' as const, media: null, sender: SUPPORT }

  test('texto, foto com legenda, áudio, localização e mensagem sem texto', () => {
    expect(describeHeldMessage({ ...base, event: event() })).toEqual({
      author: 'member',
      bodyText: TEXT,
      contentKind: 'text',
      occurredAt: new Date(1000),
      providerMessageId: 'M1',
      senderPhone: SUPPORT,
    })
    expect(
      describeHeldMessage({
        ...base,
        event: event({ text: null }),
        media: { caption: 'canhoto', kind: 'image', mimeType: 'image/jpeg' },
      }),
    ).toMatchObject({ bodyText: 'canhoto', contentKind: 'image' })
    expect(
      describeHeldMessage({
        ...base,
        audio: { mimeType: 'audio/ogg', quotedParticipant: null, seconds: 4 },
        event: event({ text: null }),
      }),
    ).toMatchObject({ bodyText: '', contentKind: 'audio' })
    const location = describeHeldMessage({
      ...base,
      event: event({ text: null }),
      media: { kind: 'location', latitude: -21.17, longitude: -47.81 },
    })
    expect(location).toMatchObject({ bodyText: '', contentKind: 'other' })
    expect(JSON.stringify(location)).not.toContain('-21.17')
    expect(describeHeldMessage({ ...base, event: event({ text: null }) })).toMatchObject({
      bodyText: '',
      contentKind: 'other',
    })
  })
})

describe('spec 319 T3: o grupo assumido não chega ao bot', () => {
  function setup(options: { groupDrivers?: readonly string[] } = {}) {
    const store = createGuard()
    const evolution = { owner: 0, participants: 0 }
    const handled: AdmittedGroupMessage[] = []
    const gateway: EvolutionGroupDirectoryGatewayPort = {
      async getOwnerNumber() {
        evolution.owner += 1
        return BOT
      },
      async listGroupParticipants() {
        evolution.participants += 1
        return [
          { lid: '11111111111111', number: BOT },
          { lid: DRIVER_LID, number: DRIVER },
        ]
      },
    }
    const inbound = createEvolutionGroupInbound({
      chatTakeover: store.guard,
      async findGroupDriver({ companyId, groupJid }) {
        return companyId === COMPANY_ID && groupJid === GROUP ? { driverId: DRIVER_ID } : null
      },
      async findOpenRequestOwner() {
        return DRIVER
      },
      async handle(message) {
        handled.push(message)
      },
      identity: createEvolutionGroupIdentity({ gateway }),
      isGroupDriver: async ({ sender }) => (options.groupDrivers ?? [DRIVER]).includes(sender),
    })
    const receive = (
      overrides: Partial<EvolutionMessageEvent> = {},
      senderLid: null | string = null,
      extra: Pick<Parameters<typeof inbound.receive>[0], 'audio' | 'media'> = {},
    ) =>
      inbound.receive({
        ...extra,
        companyId: COMPANY_ID,
        connection: async () => ({
          apiKey: 'k',
          baseUrl: 'https://evo.exemplo.com',
          instanceName: 'x',
        }),
        event: {
          chat: 'group',
          externalMessageId: 'M1',
          from: '',
          fromMe: false,
          groupJid: GROUP,
          mentionedJids: [`${BOT}@s.whatsapp.net`],
          participant: DRIVER,
          pushName: 'Motorista',
          replyToExternalMessageId: null,
          text: `@${BOT} 2`,
          timestamp: 1,
          type: 'message',
          ...overrides,
        },
        senderLid,
      })
    return { ...store, evolution, handled, receive }
  }

  test('sem assumir, a mensagem marcando o bot segue para o pedido, como antes', async () => {
    const { appended, handled, receive } = setup()

    expect(await receive()).toBe('admitted')
    expect(handled).toHaveLength(1)
    expect(appended).toEqual([])
  })

  test('assumido: nem a resposta ao pedido aberto chega ao bot, e a mensagem do motorista é gravada', async () => {
    const { appended, evolution, handled, receive, takeOver } = setup()
    takeOver(COMPANY_ID, GROUP)

    expect(await receive()).toBe('taken_over')

    expect(handled).toEqual([])
    // Nem o número do bot é perguntado ao Evolution: quem escreveu já veio no evento.
    expect(evolution).toEqual({ owner: 0, participants: 0 })
    expect(
      appended.map(({ author, bodyText, senderPhone }) => ({ author, bodyText, senderPhone })),
    ).toEqual([{ author: 'driver', bodyText: `@${BOT} 2`, senderPhone: DRIVER }])
  })

  test('assumido: outra pessoa do grupo é gravada como membro; quem só veio por @lid é resolvido', async () => {
    const { appended, receive, takeOver } = setup()
    takeOver(COMPANY_ID, GROUP)

    expect(
      await receive({ externalMessageId: 'M2', participant: SUPPORT, text: 'chego 10h' }),
    ).toBe('taken_over')
    expect(
      await receive({ externalMessageId: 'M3', participant: '', text: 'ok' }, DRIVER_LID),
    ).toBe('taken_over')

    expect(appended.map(({ author, senderPhone }) => ({ author, senderPhone }))).toEqual([
      { author: 'member', senderPhone: SUPPORT },
      { author: 'driver', senderPhone: DRIVER },
    ])
  })

  test('assumido: áudio e foto também não chegam ao bot', async () => {
    const { appended, handled, receive, takeOver } = setup()
    takeOver(COMPANY_ID, GROUP)

    expect(
      await receive({ externalMessageId: 'A1', text: null }, null, {
        audio: { mimeType: 'audio/ogg', quotedParticipant: null, seconds: 4 },
      }),
    ).toBe('taken_over')
    expect(
      await receive({ externalMessageId: 'F1', text: null }, null, {
        media: { caption: null, kind: 'image', mimeType: 'image/jpeg' },
      }),
    ).toBe('taken_over')
    expect(handled).toEqual([])
    expect(appended.map(({ contentKind }) => contentKind)).toEqual(['audio', 'image'])
  })

  test('grupo fora da ficha nem pergunta quem atende', async () => {
    const { receive, state } = setup()

    expect(await receive({ groupJid: '120363099999999999@g.us' })).toBe('unknown_group')
    expect(state.lookups).toBe(0)
  })

  test('devolvido ao bot, a mesma mensagem volta a andar', async () => {
    const { handled, receive, release, takeOver } = setup()
    takeOver(COMPANY_ID, GROUP)
    expect(await receive()).toBe('taken_over')

    release(COMPANY_ID, GROUP)
    expect(await receive({ externalMessageId: 'M9' })).toBe('admitted')
    expect(handled.map(({ providerMessageId }) => providerMessageId)).toEqual(['M9'])
  })
})
