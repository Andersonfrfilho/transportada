/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Staging 05/11: "cancelar" fechava o pedido mas não a confirmação do áudio nem as transcrições em
 * andamento, e um "sim" no meio de uma fala longa confirmava o áudio anterior.
 */
import { describe, expect, test } from 'bun:test'

import { createEvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  type AdmittedGroupMessage,
  createEvolutionGroupInbound,
  type EvolutionMessageEvent,
  type GroupAudio,
  type GroupAudioContext,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import {
  BOT_AUDIO_SPEECH,
  createWhatsAppBotAudio,
} from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import type { ApiLogger } from '../../src/shared/api.types.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER = '5516988887777'
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }
const AUDIO = { data: Buffer.from('opus').toString('base64'), mimeType: 'audio/ogg' }
const CONVERSATION = `group:${GROUP}`
const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const VOICE: GroupAudio = {
  mimeType: 'audio/ogg',
  quotedParticipant: `${BOT}@s.whatsapp.net`,
  seconds: 5,
}

function gate() {
  let release: (text: string) => void = () => undefined
  const promise = new Promise<string>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function event(overrides: Partial<EvolutionMessageEvent>): EvolutionMessageEvent {
  return {
    chat: 'group',
    externalMessageId: 'M',
    from: '',
    fromMe: false,
    groupJid: GROUP,
    mentionedJids: [],
    participant: DRIVER,
    pushName: 'Anderson',
    replyToExternalMessageId: null,
    text: null,
    timestamp: 1,
    type: 'message',
    ...overrides,
  }
}

function setup(transcripts: readonly Promise<string>[]) {
  let index = 0
  const handled: AdmittedGroupMessage[] = []
  const replies: string[] = []
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger,
    transcriber: { transcribe: async () => (await transcripts[index++]) ?? '' },
  })
  const inbound = createEvolutionGroupInbound({
    audio: {
      bot,
      download: async () => AUDIO,
      reply: ({ texts }) => {
        replies.push(...texts)
      },
    },
    findGroupDriver: async () => ({ driverId: 'd1' }),
    findOpenRequestOwner: async () => null,
    handle: async (message) => {
      handled.push(message)
    },
    identity: createEvolutionGroupIdentity({
      gateway: { getOwnerNumber: async () => BOT, listGroupParticipants: async () => [] },
    }),
  })
  const receive = (message: EvolutionMessageEvent, audio: GroupAudio | null = null) =>
    inbound.receive({
      audio,
      companyId: COMPANY_ID,
      connection: async () => CONNECTION,
      event: message,
      senderLid: null,
    })
  return { bot, handled, receive, replies }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('cancelar encerra também o áudio', () => {
  test('passos 5 a 9 da conversa de staging: nada abre depois do cancelar', async () => {
    const first = gate()
    const second = gate()
    const third = gate()
    const { bot, handled, receive, replies } = setup([first.promise, second.promise, third.promise])
    expect(await receive(event({ externalMessageId: 'A1' }), VOICE)).toBe('audio')
    expect(await receive(event({ externalMessageId: 'A2' }), VOICE)).toBe('audio')
    second.release('Ou, tem que falar bem direitinho, né?')
    await tick()
    first.release('texto do primeiro áudio, que já perdeu a vez')
    await tick()
    // Com a confirmação pendente, o terceiro áudio é ouvido como possível resposta.
    expect(await receive(event({ externalMessageId: 'A3' }), VOICE)).toBe('audio_answer')
    const cancelled = await receive(
      event({
        externalMessageId: 'T1',
        mentionedJids: [`${BOT}@s.whatsapp.net`],
        text: `@${BOT} cancelar`,
      }),
    )
    expect(cancelled).toBe('admitted')
    third.release('Entendeu esse texto inteiro e não entendeu a palavra sim.')
    await bot.idle()
    expect(handled).toEqual([])
    expect(replies.filter((text) => text.includes('Entendi assim'))).toHaveLength(1)
    expect(replies.some((text) => text.includes('Entendeu esse texto'))).toBe(false)
    expect(
      bot.hasPending({ companyId: COMPANY_ID, conversation: CONVERSATION, owner: DRIVER }),
    ).toBe(false)
    expect(replies.at(-1)).toBe(BOT_AUDIO_SPEECH.discarded)
  })

  test('transcrição em andamento quando o cancelar chega não responde nada', async () => {
    const slow = gate()
    const { bot, handled, receive, replies } = setup([slow.promise])
    await receive(event({ externalMessageId: 'A1' }), VOICE)
    expect(bot.cancel({ companyId: COMPANY_ID, conversation: CONVERSATION, owner: DRIVER })).toBe(
      true,
    )
    slow.release('prorrogação de boleto nota 17234')
    await bot.idle()
    expect(replies).toEqual([BOT_AUDIO_SPEECH.received])
    expect(handled).toEqual([])
    expect(
      bot.hasPending({ companyId: COMPANY_ID, conversation: CONVERSATION, owner: DRIVER }),
    ).toBe(false)
  })

  test('cancelar de outra pessoa não mexe no áudio de quem falou', async () => {
    const { bot, receive } = setup([Promise.resolve('texto')])
    await receive(event({ externalMessageId: 'A1' }), VOICE)
    await bot.idle()
    expect(
      bot.cancel({ companyId: COMPANY_ID, conversation: CONVERSATION, owner: '5516911112222' }),
    ).toBe(false)
    expect(
      bot.hasPending({ companyId: COMPANY_ID, conversation: CONVERSATION, owner: DRIVER }),
    ).toBe(true)
  })

  test('um áudio novo depois do cancelar volta a funcionar', async () => {
    const { bot, receive, replies } = setup([Promise.resolve('texto novo')])
    bot.cancel({ companyId: COMPANY_ID, conversation: CONVERSATION, owner: DRIVER })
    await receive(event({ externalMessageId: 'A1' }), VOICE)
    await bot.idle()
    expect(replies.at(-1)).toContain('Entendi assim')
  })
})

describe('sim/não falado só vale sozinho', () => {
  async function answerSpoken(said: string) {
    const bot = createWhatsAppBotAudio<null>({
      logger,
      transcriber: { transcribe: async () => 'texto pendente' },
    })
    await bot.receive({
      companyId: COMPANY_ID,
      context: null,
      conversation: 'c',
      download: async () => AUDIO,
      mimeType: 'audio/ogg',
      owner: DRIVER,
      reply: () => undefined,
      seconds: 3,
    })
    await bot.idle()
    return bot.answer({
      companyId: COMPANY_ID,
      conversation: 'c',
      owner: DRIVER,
      spoken: true,
      text: said,
    }).kind
  }

  test.each<readonly [string, 'confirmed' | 'discarded' | 'none']>([
    ['Sim.', 'confirmed'],
    ['Sim, pode seguir.', 'confirmed'],
    ['Pode seguir', 'confirmed'],
    ['Isso mesmo!', 'confirmed'],
    ['Um.', 'confirmed'],
    ['Não.', 'discarded'],
    ['Não descarta', 'discarded'],
    ['Dois', 'discarded'],
    ['Não, está errado', 'discarded'],
    ['Não está certo', 'discarded'],
    ['Entendeu esse texto inteiro e não entendeu a palavra sim.', 'none'],
    ['Sim, mas não sei se é isso', 'none'],
    ['Sim não', 'none'],
    ['Isso não', 'none'],
    ['Sim, a nota é 899877', 'none'],
    ['Sim senhor pode seguir adiante', 'none'],
  ])('%s -> %s', async (said, expected) => {
    expect(await answerSpoken(said)).toBe(expected)
  })
})
