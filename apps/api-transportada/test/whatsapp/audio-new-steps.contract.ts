/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.7 (RF22): todo passo novo da spec aceita resposta falada no grupo — "um"/"dois", "sim"/"não" curtos,
 * "pular" — pelo mesmo caminho de áudio (resposta curta sem número segue direto; o resto passa pelo "Entendi assim").
 * Foto e localização continuam mídia: o pedido é repetido dizendo que o item vai por foto/localização.
 */
import { describe, expect, test } from 'bun:test'

import { OUT_OF_ORDER_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import {
  LOCATION_PROMPT_TEXT,
  ROUTE_OFFER_TEXT,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import { createEvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  createEvolutionGroupInbound,
  type AdmittedGroupMessage,
  type EvolutionMessageEvent,
  type GroupAudio,
  type GroupAudioContext,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { createGroupDeliveryFlow } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import type {
  GroupFlowOutcome,
  GroupRequest,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import {
  createGroupStopFlow,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import type { WhatsAppDeliveryPreparations } from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'

const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER = '5516988887777'
const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const VOICE: GroupAudio = {
  mimeType: 'audio/ogg',
  quotedParticipant: `${BOT}@s.whatsapp.net`,
  seconds: 5,
}

function inboundWith(transcript: string) {
  const handled: AdmittedGroupMessage[] = []
  const replies: string[] = []
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger,
    transcriber: { transcribe: async () => transcript },
  })
  const inbound = createEvolutionGroupInbound({
    audio: {
      bot,
      download: async () => ({
        data: Buffer.from('opus').toString('base64'),
        mimeType: 'audio/ogg',
      }),
      reply: ({ texts }) => {
        replies.push(...texts)
      },
    },
    findGroupDriver: async () => ({ driverId: 'd1' }),
    findOpenRequestOwner: async () => DRIVER,
    handle: async (message) => {
      handled.push(message)
    },
    identity: createEvolutionGroupIdentity({
      gateway: { getOwnerNumber: async () => BOT, listGroupParticipants: async () => [] },
    }),
  })
  const event: EvolutionMessageEvent = {
    chat: 'group',
    externalMessageId: 'A1',
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
  }
  return {
    bot,
    handled,
    replies,
    speak: () =>
      inbound.receive({
        audio: VOICE,
        companyId: 'C1',
        connection: async () => ({ apiKey: 'k', baseUrl: 'https://e.example', instanceName: 'x' }),
        event,
        senderLid: null,
      }),
  }
}

describe('o caminho do áudio para os passos novos (RF22)', () => {
  test.each([
    'um',
    'Dois.',
    'sim',
    'Não',
    'pular',
    'Pular.',
    'agora não',
    'foi engano',
    'descartar',
    'trocar',
  ])('"%s" é resposta curta: vai direto ao passo do pedido, sem confirmação', async (spoken) => {
    const { bot, handled, replies, speak } = inboundWith(spoken)
    await speak()
    await bot.idle()
    expect(handled.map((message) => message.text)).toEqual([spoken.replace(/[.!?]+$/u, '')])
    expect(replies.some((text) => text.includes('Entendi assim'))).toBe(false)
  })

  test.each([
    ['frase longa', 'sim, pode iniciar a rota agora mesmo por favor'],
    ['nota falada', 'entreguei a nota 17234'],
  ])('%s passa pela confirmação "Entendi assim" e só segue com o "1"', async (_name, spoken) => {
    const { bot, handled, replies, speak } = inboundWith(spoken)
    await speak()
    await bot.idle()
    expect(handled).toEqual([])
    expect(replies.at(-1)).toContain('Entendi assim')
  })
})

function request(step: string, state: Record<string, unknown> = {}): GroupRequest {
  return {
    attempts: 0,
    companyId: 'C1',
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: GROUP,
    id: 'R1',
    ownerNumber: DRIVER,
    state,
    step,
    version: 1n,
  }
}

function flowSetup(options: { readonly repeat?: readonly string[] } = {}) {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const preparations: WhatsAppDeliveryPreparations = {
    answer: async () => null,
    awaitingText: async () => false,
    begin: async () => ({ awaitingText: false, documentNumber: '1', finished: true, texts: [] }),
    hasOpen: async () => true,
    receiveLocation: async () => null,
    receivePhoto: async () => null,
    repeatMediaRequest: async () =>
      options.repeat === undefined
        ? null
        : { awaitingText: false, documentNumber: '17234', finished: false, texts: options.repeat },
  }
  const flow = createGroupDriverFlow({
    delivery: createGroupDeliveryFlow({
      consumeLocation: () => null,
      findActorUserId: async () => 'U1',
      listOpenDocuments: async () => [],
      preparations,
      withoutAccessText: async () => 'sem acesso',
    }),
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['occ'] }),
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      hasLocation: () => true,
      listStops: async () => [],
      record: async (input) => {
        recorded.push(input)
        if (input.confirmOutOfOrder !== true && input.stopId === 's6') {
          return { message: 'PERGUNTA', outOfOrder: { nextStopId: 's4', stopId: 's6' } }
        }
        return { message: 'registrado' }
      },
    }),
  })
  const answerAt = async (
    step: string,
    state: Record<string, unknown>,
    text: string,
  ): Promise<GroupFlowOutcome> =>
    flow.answer({ request: request(step, state), sender: DRIVER, senderName: null, text })
  return { answerAt, recorded }
}

describe('cada passo novo do grupo entende a fala curta (RF22)', () => {
  const OFFER = { routeOffer: { documentNumber: '17300', stopId: 's6' } }
  const LOCATION = { locationFor: { documentNumber: '17400', event: 'depart', stopId: 's1' } }
  const ORDER = {
    outOfOrderFor: { documentNumber: '17400', event: 'depart', nextStopId: 's4', stopId: 's6' },
  }

  test.each(['um', 'sim', 'Um.'])('oferta da próxima rota: "%s" inicia a rota', async (spoken) => {
    const t = flowSetup()
    const outcome = await t.answerAt('route.offer', { routeOffer: { stopId: 's1' } }, spoken)
    expect(outcome).toEqual({ kind: 'done', replies: ['registrado'] })
    expect(t.recorded.at(-1)).toMatchObject({ event: 'depart', stopId: 's1' })
  })

  test.each(['dois', 'não', 'agora não', 'pular'])(
    'oferta da próxima rota: "%s" deixa para depois',
    async (spoken) => {
      const t = flowSetup()
      expect(await t.answerAt('route.offer', OFFER, spoken)).toEqual({
        kind: 'done',
        replies: [ROUTE_OFFER_TEXT.declined],
      })
      expect(t.recorded).toEqual([])
    },
  )

  test.each(['pular', 'Pular.', 'pular por favor', 'não', 'dois'])(
    'pedido de localização: "%s" registra sem ponto',
    async (spoken) => {
      const t = flowSetup()
      expect(await t.answerAt('stop.location', LOCATION, spoken)).toEqual({
        kind: 'done',
        replies: ['registrado'],
      })
    },
  )

  test('pedido de localização: fala que não é "pular" repete que o item vai por localização', async () => {
    const t = flowSetup()
    expect(await t.answerAt('stop.location', LOCATION, 'estou chegando')).toMatchObject({
      kind: 'not_understood',
      prompt: LOCATION_PROMPT_TEXT.askAgain,
    })
    expect(t.recorded).toEqual([])
  })

  test.each(['um', 'sim'])('fora de ordem: "%s" confirma', async (spoken) => {
    const t = flowSetup()
    await t.answerAt('stop.confirm_order', ORDER, spoken)
    expect(t.recorded.at(-1)).toMatchObject({ confirmOutOfOrder: true, stopId: 's6' })
  })

  test.each(['dois', 'não', 'foi engano'])(
    'fora de ordem na saída: "%s" vai à próxima do roteiro',
    async (spoken) => {
      const t = flowSetup()
      await t.answerAt('stop.confirm_order', ORDER, spoken)
      expect(t.recorded.at(-1)).toMatchObject({ stopId: 's4' })
    },
  )

  test('fora de ordem: fala longa não responde', async () => {
    const t = flowSetup()
    expect(
      await t.answerAt('stop.confirm_order', ORDER, 'não entendi a palavra sim que você falou'),
    ).toMatchObject({ kind: 'not_understood', prompt: OUT_OF_ORDER_TEXT.notUnderstood })
    expect(t.recorded).toEqual([])
  })
})

describe('pediu foto ou localização e veio áudio (RF22, grupo)', () => {
  test('a resposta repete o pedido dizendo que o item vai por foto', async () => {
    const t = flowSetup({
      repeat: [
        'Esse item vai por foto: tire a foto e envie aqui.',
        'NF 17234: mande a foto do canhoto.',
      ],
    })
    const outcome = await t.answerAt('delivery.answer', {}, 'já mandei a foto do canhoto')
    expect(outcome).toMatchObject({
      kind: 'not_understood',
      prompt: 'NF 17234: mande a foto do canhoto.',
      reason: 'Esse item vai por foto: tire a foto e envie aqui.',
    })
  })

  test('sem mídia esperada, a resposta de sempre', async () => {
    const t = flowSetup()
    expect(await t.answerAt('delivery.answer', {}, 'blá')).toMatchObject({ kind: 'not_understood' })
  })
})
