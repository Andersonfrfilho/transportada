/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.3 (RF8–RF10, RF12, RNF1): a oferta da próxima rota no grupo do motorista e a matriz de
 * não interferência com os outros pedidos (ocorrência, entrega em preparo, escolha de parada, oferta, áudio).
 */
import { describe, expect, test } from 'bun:test'

import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import {
  ROUTE_OFFER_TEXT,
  type RouteOfferStop,
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

const GROUP = '120363025246125486@g.us'
const OWNER = '5516988887777'

const NEXT_STOP: RouteOfferStop = {
  address: 'Rua das Flores, 100 - Centro',
  coordinate: { latitude: '-21.1700000', longitude: '-47.8100000' },
  documents: [{ id: 'doc-5', number: '017300' }],
  id: 'stop-4',
  isAddressReliable: true,
  recipientName: 'Padaria Sol',
  sequence: 4,
  totalStops: 6,
}

const finished = (
  routeContinuation: WhatsAppDeliveryPreparationReply['routeContinuation'],
): WhatsAppDeliveryPreparationReply => ({
  awaitingText: false,
  documentNumber: '17234',
  finished: true,
  ...(routeContinuation === undefined ? {} : { routeContinuation }),
  texts: ['*NF 17234 entregue.* Parada concluída. ✅'],
})

function request(step: string, state: Record<string, unknown> = {}): GroupRequest {
  return {
    attempts: 0,
    companyId: 'C1',
    driverId: 'D1',
    expiresAt: new Date(),
    groupJid: GROUP,
    id: 'R1',
    ownerNumber: OWNER,
    state,
    step,
    version: 1n,
  }
}

function setup(options: {
  readonly continuation?: WhatsAppDeliveryPreparationReply['routeContinuation']
  readonly hasOpenAfter?: boolean
}) {
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  const occurrenceTexts: string[] = []
  let completed = false
  const preparations: WhatsAppDeliveryPreparations = {
    answer: async () => {
      completed = true
      return finished(options.continuation)
    },
    awaitingText: async () => !completed,
    begin: async () => ({
      awaitingText: true,
      documentNumber: '17234',
      finished: false,
      texts: ['Confirma?'],
    }),
    hasOpen: async () => (completed ? (options.hasOpenAfter ?? false) : true),
    receiveLocation: async () => null,
    receivePhoto: async () => null,
  }
  const flow = createGroupDriverFlow({
    delivery: createGroupDeliveryFlow({
      consumeLocation: () => null,
      findActorUserId: async () => 'U1',
      listOpenDocuments: async () => [{ id: 'DOC1', number: '017234' }],
      preparations,
      withoutAccessText: async () => 'sem acesso',
    }),
    occurrence: {
      answer: async (turn) => {
        occurrenceTexts.push(turn.text)
        return { kind: 'done', replies: ['occ-answer'] }
      },
      initialStep: 'document',
      start: async () => ({ kind: 'done', replies: ['occ-start'] }),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'en-route',
      listStops: async () => [
        {
          arrivedAt: null,
          completedAt: null,
          documents: [
            { number: '17300', separationStatus: 'loaded' },
            { number: '17301', separationStatus: 'loaded' },
          ],
          enRouteSince: null,
          id: 'stop-3',
          sequence: 3,
        },
        {
          arrivedAt: null,
          completedAt: null,
          documents: [{ number: '17400', separationStatus: 'loaded' }],
          enRouteSince: null,
          id: 'stop-4',
          sequence: 4,
        },
      ],
      record: async (input) => {
        recorded.push(input)
        return { message: input.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.' }
      },
    }),
  })
  let current: GroupRequest = request('delivery.answer')
  const turn = (text: string) => ({ request: current, sender: OWNER, senderName: null, text })
  const follow = (outcome: GroupFlowOutcome) => {
    if (outcome.kind === 'continue') current = request(outcome.step, { ...outcome.state })
    return outcome
  }
  return {
    answer: async (text: string) => follow(await flow.answer(turn(text))),
    occurrenceTexts,
    recorded,
    stepNow: () => current.step,
  }
}

const CONTINUES = { nextStop: NEXT_STOP, tripCompleted: false }

describe('grupo: a baixa que fecha a parada oferece a próxima rota', () => {
  test('confirmada a entrega, o mesmo pedido segue com a oferta e a pergunta 1/2', async () => {
    const t = setup({ continuation: CONTINUES })
    const offered = await t.answer('1')
    expect(offered.kind).toBe('continue')
    const replies = offered.kind === 'continue' ? offered.replies : []
    expect(replies[0]).toBe('*NF 17234 entregue.* Parada concluída. ✅')
    expect(replies[1]).toBe(
      [
        '➡️ *Próxima parada*',
        '*Parada 4 de 6*',
        '*NF 17300*',
        '🏪 *Padaria Sol*',
        '📍 Rua das Flores, 100 - Centro',
        '🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000',
        '',
        '*O que você quer fazer agora?*',
        '*1* - Seguir para ela 🚚',
        '*2* - Escolher outra da lista',
        '*3* - Nada por enquanto',
      ].join('\n'),
    )
    expect(t.stepNow()).toBe('journey.actions')
  })

  test('"1" registra a saída da parada oferecida pelo mesmo registro do "saí", com a chave do pedido', async () => {
    const t = setup({ continuation: CONTINUES })
    await t.answer('1')
    const started = await t.answer('1')
    expect(started).toEqual({ kind: 'done', replies: ['Saída registrada.'], withoutFarewell: true })
    expect(t.recorded).toEqual([
      {
        companyId: 'C1',
        documentNumber: '17300',
        driverId: 'D1',
        event: 'depart',
        idempotencyKey: 'whatsapp-group-request:R1',
        stopId: 'stop-4',
      },
    ])
  })

  test('"2" lista as paradas pendentes para escolher, sem registrar nada', async () => {
    const t = setup({ continuation: CONTINUES })
    await t.answer('1')
    expect(await t.answer('2')).toMatchObject({ kind: 'continue', step: 'stop.choose' })
    expect(t.recorded).toEqual([])
  })

  test('"3" encerra sem registrar nada e diz o próximo passo', async () => {
    const t = setup({ continuation: CONTINUES })
    await t.answer('1')
    expect(await t.answer('3')).toEqual({
      kind: 'done',
      replies: ['Certo, não registrei nada.\n' + ROUTE_OFFER_TEXT.withoutQuestion],
    })
    expect(t.recorded).toEqual([])
  })

  test.each([
    ['um', 1],
    ['sim', 1],
    ['dois', 0],
    ['agora não', 0],
    ['pular', 0],
  ])('falado "%s" responde à oferta (RF22)', async (spoken, saidCount) => {
    const t = setup({ continuation: CONTINUES })
    await t.answer('1')
    await t.answer(spoken)
    expect(t.recorded).toHaveLength(saidCount)
  })

  test('resposta que não é 1 nem 2 repete a pergunta, sem registrar', async () => {
    const t = setup({ continuation: CONTINUES })
    await t.answer('1')
    const outcome = await t.answer('talvez mais tarde eu vou')
    expect(outcome.kind).toBe('not_understood')
    expect(t.recorded).toEqual([])
    expect(t.stepNow()).toBe('journey.actions')
  })

  test('endereço não confiável: a oferta leva o aviso do RF12', async () => {
    const t = setup({
      continuation: { nextStop: { ...NEXT_STOP, isAddressReliable: false }, tripCompleted: false },
    })
    const offered = await t.answer('1')
    expect(offered.kind === 'continue' ? offered.replies[1] : '').toContain(
      'sem localização certa no mapa',
    )
  })

  test('última parada: "Rota concluída", sem pergunta e o pedido fecha (a despedida vem do pedido)', async () => {
    const t = setup({ continuation: { nextStop: null, tripCompleted: true } })
    expect(await t.answer('1')).toEqual({
      kind: 'done',
      replies: ['*NF 17234 entregue.* Parada concluída. ✅', ROUTE_OFFER_TEXT.routeCompleted],
    })
  })

  test('baixa que não fechou a parada não oferece nada', async () => {
    const t = setup({})
    expect(await t.answer('1')).toEqual({
      kind: 'done',
      replies: ['*NF 17234 entregue.* Parada concluída. ✅'],
    })
  })
})

describe('matriz de não interferência da oferta (RNF1, grupo)', () => {
  test('ocorrência ou entrega em coleta aberta: a frase sai sem pergunta e o pedido fecha', async () => {
    const t = setup({ continuation: CONTINUES, hasOpenAfter: true })
    const outcome = await t.answer('1')
    expect(outcome.kind).toBe('done')
    const replies = outcome.kind === 'done' ? outcome.replies : []
    expect(replies[1]).toContain('quando for sair, mande *saí*.')
    expect(replies[1]).not.toContain('*1* - Sim')
    // O "1" seguinte não tem oferta a responder: cai no fluxo de sempre, nunca inicia rota.
    expect(t.recorded).toEqual([])
  })

  test('com a oferta aberta, só o pedido dela responde: texto de outro assunto não vira saída nem ocorrência', async () => {
    const t = setup({ continuation: CONTINUES })
    await t.answer('1')
    const stranger = await t.answer('cliente fechado e ninguém atendeu')
    expect(stranger.kind).toBe('not_understood')
    expect(t.recorded).toEqual([])
    expect(t.occurrenceTexts).toEqual([])
  })

  test('escolha de parada aberta: o "1" escolhe a parada e não responde a oferta nenhuma', async () => {
    const t = setup({})
    const flow = createGroupDriverFlow({
      occurrence: {
        answer: async () => ({ kind: 'done', replies: ['occ'] }),
        initialStep: 'document',
        start: async () => ({ kind: 'done', replies: ['occ'] }),
      },
      stop: createGroupStopFlow({
        enRouteMessage: async () => 'en-route',
        listStops: async () => [],
        record: async (input) => {
          t.recorded.push(input)
          return { message: 'registrado' }
        },
      }),
    })
    const outcome = await flow.answer({
      request: request('stop.choose', {
        event: 'arrive',
        stops: [
          { id: 'a', label: 'NF 1', numbers: ['1'] },
          { id: 'b', label: 'NF 2', numbers: ['2'] },
        ],
      }),
      sender: OWNER,
      senderName: null,
      text: '1',
    })
    expect(outcome).toEqual({ kind: 'done', replies: ['registrado'], withoutFarewell: true })
    expect(t.recorded[0]).toMatchObject({ event: 'arrive', stopId: 'a' })
  })
})

describe('áudio esperando confirmação tem prioridade sobre a oferta (RNF1, grupo)', () => {
  const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
  const BOT = '5516900000001'
  const VOICE: GroupAudio = {
    mimeType: 'audio/ogg',
    quotedParticipant: `${BOT}@s.whatsapp.net`,
    seconds: 5,
  }
  const base: EvolutionMessageEvent = {
    chat: 'group',
    externalMessageId: 'M',
    from: '',
    fromMe: false,
    groupJid: GROUP,
    mentionedJids: [],
    participant: OWNER,
    pushName: 'Anderson',
    replyToExternalMessageId: null,
    text: null,
    timestamp: 1,
    type: 'message',
  }

  test('o "1" confirma o áudio, e é o texto do áudio que chega ao pedido da oferta, nunca o "1"', async () => {
    const handled: AdmittedGroupMessage[] = []
    const bot = createWhatsAppBotAudio<GroupAudioContext>({
      logger,
      transcriber: { transcribe: async () => 'quero ver o menu agora' },
    })
    const inbound = createEvolutionGroupInbound({
      audio: {
        bot,
        download: async () => ({
          data: Buffer.from('opus').toString('base64'),
          mimeType: 'audio/ogg',
        }),
        reply: () => undefined,
      },
      findGroupDriver: async () => ({ driverId: 'd1' }),
      findOpenRequestOwner: async () => OWNER,
      handle: async (message) => {
        handled.push(message)
      },
      identity: createEvolutionGroupIdentity({
        gateway: { getOwnerNumber: async () => BOT, listGroupParticipants: async () => [] },
      }),
    })
    const receive = (event: Partial<EvolutionMessageEvent>, audio: GroupAudio | null = null) =>
      inbound.receive({
        audio,
        companyId: 'C1',
        connection: async () => ({ apiKey: 'k', baseUrl: 'https://e.example', instanceName: 'x' }),
        event: { ...base, ...event },
        senderLid: null,
      })
    await receive({ externalMessageId: 'A1' }, VOICE)
    await bot.idle()
    expect(handled).toEqual([])
    await receive({ externalMessageId: 'T1', text: '1' })
    expect(handled.map((message) => message.text)).toEqual(['quero ver o menu agora'])
  })
})
