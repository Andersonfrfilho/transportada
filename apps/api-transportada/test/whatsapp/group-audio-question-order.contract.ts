/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RNF1: a pergunta mais recente é a dona do "1"/"2". Confirmação de áudio pendente não rouba a resposta
 * de uma pergunta que o bot fez depois dela (ex.: o pedido de localização do "iniciar rota").
 */
import { describe, expect, test } from 'bun:test'

import { createEvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  type AdmittedGroupMessage,
  createEvolutionGroupInbound,
  createGroupQuestionAskedHandler,
  type EvolutionMessageEvent,
  type GroupAudio,
  type GroupAudioContext,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import type { ApiLogger } from '../../src/shared/api.types.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER = '5516988887777'
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }
const AUDIO = { data: Buffer.from('opus').toString('base64'), mimeType: 'audio/ogg' }
const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const VOICE: GroupAudio = {
  mimeType: 'audio/ogg',
  quotedParticipant: `${BOT}@s.whatsapp.net`,
  seconds: 5,
}

const event = (overrides: Partial<EvolutionMessageEvent>): EvolutionMessageEvent => ({
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
})

function setup() {
  const handled: AdmittedGroupMessage[] = []
  let openOwner: null | string = null
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger,
    transcriber: { transcribe: async () => 'iniciar rota' },
  })
  const inbound = createEvolutionGroupInbound({
    audio: { bot, download: async () => AUDIO, reply: () => undefined },
    findGroupDriver: async () => ({ driverId: 'd1' }),
    findOpenRequestOwner: async () => openOwner,
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
  return {
    bot,
    handled,
    openRequest: () => {
      openOwner = DRIVER
    },
    receive,
  }
}

describe('a pergunta mais recente é a dona da resposta', () => {
  test('sem pergunta nova do pedido, o "1" confirma o áudio pendente', async () => {
    const { bot, handled, openRequest, receive } = setup()
    await receive(event({ externalMessageId: 'A1' }), VOICE)
    await bot.idle()
    openRequest()
    await receive(event({ externalMessageId: 'T1', text: '1' }))
    expect(handled.map((message) => message.text)).toEqual(['iniciar rota'])
  })

  test('com o pedido perguntando de novo depois do áudio, o "1" é do pedido', async () => {
    const { bot, handled, openRequest, receive } = setup()
    await receive(event({ externalMessageId: 'A1' }), VOICE)
    await bot.idle()
    openRequest()
    createGroupQuestionAskedHandler(bot)({ companyId: COMPANY_ID, groupJid: GROUP, owner: DRIVER })
    await receive(event({ externalMessageId: 'T1', text: '1' }))
    expect(handled.map((message) => message.text)).toEqual(['1'])
  })

  test('pergunta nova para outra pessoa não mexe no áudio de quem falou', async () => {
    const { bot, handled, openRequest, receive } = setup()
    await receive(event({ externalMessageId: 'A1' }), VOICE)
    await bot.idle()
    openRequest()
    createGroupQuestionAskedHandler(bot)({
      companyId: COMPANY_ID,
      groupJid: GROUP,
      owner: '5516911112222',
    })
    await receive(event({ externalMessageId: 'T1', text: '1' }))
    expect(handled.map((message) => message.text)).toEqual(['iniciar rota'])
  })
})
