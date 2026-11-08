/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 308 T2: o chat direto (1:1) do motorista com o número do Evolution entra no mesmo fluxo do grupo,
 * como um "grupo de um só" (`<número>@s.whatsapp.net`): sem marcação do bot, sem frase de chamada no
 * áudio, sem perguntar ao Evolution quem escreveu e sem `@número` na resposta.
 */
import { describe, expect, test } from 'bun:test'

import {
  type AdmittedGroupMedia,
  type AdmittedGroupMessage,
  createEvolutionGroupInbound,
  directChatJid,
  type EvolutionMessageEvent,
  type GroupAudioContext,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import type { EvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import type {
  ReceiveBotAudioInput,
  WhatsAppBotAudio,
} from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'
import { decideDriverPhoneMatch } from '../../src/whatsapp/infrastructure/whatsapp-group-sender.adapter.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000308'
const DRIVER_ID = '00000000-0000-4000-8000-0000000003d1'
const DRIVER = '5516988887777'
const DIRECT = `${DRIVER}@s.whatsapp.net`
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }

function direct(overrides: Partial<EvolutionMessageEvent> = {}): EvolutionMessageEvent {
  return {
    chat: 'user',
    externalMessageId: 'D1',
    from: DRIVER,
    fromMe: false,
    groupJid: null,
    mentionedJids: [],
    participant: '',
    pushName: 'Motorista',
    replyToExternalMessageId: null,
    text: 'oi',
    timestamp: 1,
    type: 'message',
    ...overrides,
  }
}

function setup(options: { openRequestOwner?: null | string; wakePhrase?: string[] } = {}) {
  const state = {
    audios: [] as ReceiveBotAudioInput<GroupAudioContext>[],
    handled: [] as AdmittedGroupMessage[],
    identityCalls: 0,
    listened: 0,
    media: [] as AdmittedGroupMedia[],
    openLookups: [] as string[],
  }
  const identity: EvolutionGroupIdentity = {
    async botNumber() {
      state.identityCalls += 1
      return '5516900000001'
    },
    async lidDirectory() {
      state.identityCalls += 1
      throw new Error('o 1:1 não tem participantes de grupo')
    },
  } as unknown as EvolutionGroupIdentity
  const bot = {
    answer: () => ({ kind: 'none' }),
    cancel: () => false,
    hasPending: () => false,
    listen: () => {
      state.listened += 1
    },
    async receive(input: ReceiveBotAudioInput<GroupAudioContext>) {
      state.audios.push(input)
    },
  } as unknown as WhatsAppBotAudio<GroupAudioContext>
  const inbound = createEvolutionGroupInbound({
    audio: {
      bot,
      download: async () => ({ data: '', mimeType: 'audio/ogg' }),
      reply: () => undefined,
      wakePhrase: options.wakePhrase ?? ['atendimento', 'fernandes'],
    },
    async findDirectDriver({ phone }) {
      return phone === DRIVER ? { driverId: DRIVER_ID } : null
    },
    async findGroupDriver() {
      throw new Error('o 1:1 não consulta a ficha do grupo')
    },
    async findOpenRequestOwner({ groupJid }) {
      state.openLookups.push(groupJid)
      return options.openRequestOwner ?? null
    },
    async handle(message) {
      state.handled.push(message)
    },
    async handleMedia(media) {
      state.media.push(media)
    },
    identity,
  })
  const receive = (
    event: EvolutionMessageEvent,
    extra: Partial<Parameters<NonNullable<typeof inbound.receiveDirect>>[0]> = {},
  ) =>
    inbound.receiveDirect!({
      companyId: COMPANY_ID,
      connection: async () => CONNECTION,
      driverId: DRIVER_ID,
      event,
      ...extra,
    })
  return { inbound, receive, state }
}

describe('spec 308: o motorista no chat direto', () => {
  test('o motorista é achado pelo telefone; outro número não', async () => {
    const { inbound } = setup()

    expect(await inbound.findDirectDriver?.({ companyId: COMPANY_ID, phone: DRIVER })).toEqual({
      driverId: DRIVER_ID,
    })
    expect(
      await inbound.findDirectDriver?.({ companyId: COMPANY_ID, phone: '5516911112222' }),
    ).toBeNull()
  })

  test('"oi" sem marcar o bot abre o fluxo do grupo como grupo de um só, sem perguntar ao Evolution', async () => {
    const { receive, state } = setup()

    expect(await receive(direct({ text: '  oi  ' }))).toBe('admitted')

    expect(state.handled).toEqual([
      {
        companyId: COMPANY_ID,
        driverId: DRIVER_ID,
        groupJid: DIRECT,
        providerMessageId: 'D1',
        replyToProviderMessageId: null,
        requestOwner: null,
        sender: DRIVER,
        senderName: 'Motorista',
        sentAt: new Date(1000),
        text: 'oi',
        via: 'mention',
      },
    ])
    expect(state.openLookups).toEqual([DIRECT])
    expect(state.identityCalls).toBe(0)
  })

  test('com o pedido dele aberto no 1:1, a mensagem é a resposta (owner_reply)', async () => {
    const { receive, state } = setup({ openRequestOwner: DRIVER })

    expect(await receive(direct({ text: '2' }))).toBe('admitted')

    expect(
      state.handled.map(({ requestOwner, text, via }) => ({ requestOwner, text, via })),
    ).toEqual([{ requestOwner: DRIVER, text: '2', via: 'owner_reply' }])
  })

  test('o áudio vai direto à transcrição, sem a frase de chamada nem identidade', async () => {
    const { receive, state } = setup()

    expect(
      await receive(direct({ text: null }), {
        audio: { mimeType: 'audio/ogg', quotedParticipant: null, seconds: 5 },
      }),
    ).toBe('audio')

    expect(state.listened).toBe(0)
    expect(state.identityCalls).toBe(0)
    expect(state.audios.map(({ conversation, owner }) => ({ conversation, owner }))).toEqual([
      { conversation: `group:${DIRECT}`, owner: DRIVER },
    ])
  })

  test('a foto do 1:1 é endereçada ao bot como a que o marca no grupo', async () => {
    const { receive, state } = setup()

    expect(
      await receive(direct({ text: null }), {
        media: { caption: null, kind: 'image', mimeType: 'image/jpeg' },
      }),
    ).toBe('media')

    expect(
      state.media.map(({ driverId, groupJid, mentionsBot, sender }) => ({
        driverId,
        groupJid,
        mentionsBot,
        sender,
      })),
    ).toEqual([{ driverId: DRIVER_ID, groupJid: DIRECT, mentionsBot: true, sender: DRIVER }])
    expect(state.identityCalls).toBe(0)
  })

  test('a própria mensagem e o que não é chat de pessoa não entram', async () => {
    const { receive, state } = setup()

    expect(await receive(direct({ fromMe: true }))).toBe('from_me')
    expect(await receive(direct({ chat: 'lid', from: '' }))).toBe('unknown_sender')
    expect(state.handled).toEqual([])
  })
})

describe('spec 308: a resposta no chat direto não marca ninguém', () => {
  test('no grupo abre com @número; no 1:1 sai o texto puro', async () => {
    const sent: { body: string; mentionNumber?: string; number: string }[] = []
    const replies = createEvolutionGroupReplySender({
      logger: { warn: () => undefined } as unknown as ApiLogger,
      async sendText({ body, mentionNumber, number }) {
        sent.push({ body, number, ...(mentionNumber === undefined ? {} : { mentionNumber }) })
      },
    })

    replies.send({
      companyId: COMPANY_ID,
      groupJid: '120363025246125486@g.us',
      mentionNumber: DRIVER,
      texts: ['menu'],
    })
    replies.send({
      companyId: COMPANY_ID,
      groupJid: directChatJid(DRIVER),
      mentionNumber: DRIVER,
      texts: ['menu'],
    })
    await replies.idle()

    expect(sent).toEqual([
      { body: `@${DRIVER} menu`, mentionNumber: DRIVER, number: '120363025246125486@g.us' },
      { body: 'menu', number: DIRECT },
    ])
  })
})

describe('spec 308: qual ficha é do número', () => {
  const row = (driverId: string, phone: string) => ({ driverId, phone })

  test('uma ficha só, pelo número exato ou com/sem o nono dígito', () => {
    expect(decideDriverPhoneMatch([row('a', '16988887777')], '16988887777')).toBe('a')
    expect(decideDriverPhoneMatch([row('a', '1688887777')], '16988887777')).toBe('a')
  })

  test('o número exato decide entre as duas grafias', () => {
    expect(
      decideDriverPhoneMatch([row('a', '16988887777'), row('b', '1688887777')], '16988887777'),
    ).toBe('a')
  })

  test('duas fichas no mesmo número, ou nenhuma: o bot não adivinha', () => {
    expect(
      decideDriverPhoneMatch([row('a', '16988887777'), row('b', '16988887777')], '16988887777'),
    ).toBeNull()
    expect(
      decideDriverPhoneMatch([row('a', '1688887777'), row('b', '1688887777')], '16988887777'),
    ).toBeNull()
    expect(decideDriverPhoneMatch([], '16988887777')).toBeNull()
  })
})
