/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.3 (RF8–RF10, RF12, RNF1): a oferta da próxima rota na conversa individual — texto, resposta
 * "1"/"2" (também falada) e a matriz de não interferência com os outros pedidos em aberto.
 */
import { describe, expect, test } from 'bun:test'
import type {
  ChannelAdapterInterface,
  ConversationSession,
  FlowGraphData,
  WhatsAppMessage,
} from '@adatechnology/meta-whatsapp-contracts'
import { FlowInterpreter } from '@adatechnology/meta-whatsapp-module'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import type {
  WhatsAppDeliveryPreparationReply,
  WhatsAppDeliveryPreparations,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import {
  createWhatsAppBotAudio,
  type WhatsAppBotAudio,
} from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import { DRIVER_FLOW_NODE } from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import { interpretDriverChoice } from '../../src/whatsapp-commands/domain/whatsapp-driver-choice.policy.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  DRIVER_PROMPT_TEXT,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'
import {
  canAskRouteOffer,
  describeRouteOffer,
  ROUTE_OFFER_TEXT,
  type RouteOfferStop,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000002951'
const USER_ID = '00000000-0000-4000-8000-000000002952'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000002953'
const DRIVER_ID = '00000000-0000-4000-8000-000000002954'
const PHONE = '5516999995151'
const FLOW_KEY = 'route-offer-root'
const NOW = new Date('2026-11-05T12:00:00.000Z')

const NEXT_STOP: RouteOfferStop = {
  address: 'Rua das Flores, 100 - Centro',
  coordinate: { latitude: '-21.1700000', longitude: '-47.8100000' },
  documents: [
    { id: 'doc-5', number: '017300' },
    { id: 'doc-6', number: '17301' },
  ],
  id: 'stop-4',
  isAddressReliable: true,
  recipientName: 'Padaria Sol',
  sequence: 4,
  totalStops: 6,
}

describe('a oferta da próxima rota (spec 294 RF8, RF12)', () => {
  test('mostra parada N de M, cliente, endereço, notas, mapa pela coordenada e as duas opções', () => {
    const text = describeRouteOffer(NEXT_STOP, { asks: true })
    expect(text).toContain('Próxima parada: 4 de 6 — Padaria Sol')
    expect(text).toContain('Rua das Flores, 100 - Centro')
    expect(text).toContain('NF 17300, NF 17301')
    expect(text).toContain('https://www.google.com/maps/dir/?api=1&destination=-21.17,-47.81')
    expect(text).toContain('*1* - Seguir para ela 🚚')
    expect(text).toContain('*2* - Escolher outra da lista')
    expect(text).not.toContain('sem localização certa')
  })

  test('endereço não confiável leva o aviso de que a localização no "Cheguei" corrige o cadastro', () => {
    const text = describeRouteOffer(
      { ...NEXT_STOP, coordinate: null, isAddressReliable: false },
      { asks: true },
    )
    expect(text).toContain(ROUTE_OFFER_TEXT.unreliableAddress)
    expect(text).toContain('compartilhe a localização: eu atualizo o endereço')
    expect(text).not.toContain('maps')
  })

  test('sem pergunta, a frase só diz como seguir', () => {
    const text = describeRouteOffer(NEXT_STOP, { asks: false })
    expect(text).toContain('quando for sair, mande *saí*.')
    expect(text).not.toContain('*1* - Sim')
  })
})

describe('a resposta falada ou digitada (spec 294 RF22)', () => {
  test.each<[string, 'first' | 'second' | 'skip']>([
    ['1', 'first'],
    ['Um.', 'first'],
    ['sim', 'first'],
    ['opção um', 'first'],
    ['2', 'second'],
    ['dois', 'second'],
    ['Agora não.', 'second'],
    ['não', 'second'],
    ['pular', 'skip'],
    ['Pular, por favor', 'skip'],
  ])('"%s" é %s', (text, expected) => {
    expect(interpretDriverChoice(text)).toBe(expected)
  })

  test.each([
    ['frase longa', 'não entendi a palavra sim que você falou'],
    ['sim e não juntos', 'sim não'],
    ['vazio', ''],
    ['conversa', 'oi tudo bem'],
  ])('%s não responde', (_name, text) => {
    expect(interpretDriverChoice(text)).toBeUndefined()
  })
})

describe('a pergunta só abre quando nada mais espera resposta (RNF1)', () => {
  const FREE = {
    hasOpenCollection: false,
    hasOpenStopChoice: false,
    hasPendingAudio: false,
    hasPendingPrompt: false,
  }
  test('livre pergunta; cada pedido em aberto, sozinho, bloqueia', () => {
    expect(canAskRouteOffer(FREE)).toBe(true)
    for (const key of Object.keys(FREE) as (keyof typeof FREE)[]) {
      expect(canAskRouteOffer({ ...FREE, [key]: true })).toBe(false)
    }
  })
})

const GRAPH: FlowGraphData = {
  key: FLOW_KEY,
  label: 'Contrato da oferta',
  nodes: {
    menu: {
      fallbackMessage: 'Escolha uma das opções.',
      id: 'menu',
      next: { byAnswer: { a: 'menu' }, default: 'menu' },
      options: [['a', '1']],
      question: 'O que você quer fazer?',
      type: 'menu',
    },
  },
  startNodeId: 'menu',
  version: 1,
}

async function authorized(): Promise<ResolveWhatsAppActorResult> {
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: [],
        membershipId: MEMBERSHIP_ID,
        roles: ['driver'],
      }),
    },
  })
  const context = await tenantContext.resolveCompanyForUser({
    channel: 'whatsapp',
    companyId: COMPANY_ID,
    userId: USER_ID,
  })
  if (context === null) throw new Error('fixture sem contexto')
  return { context, status: 'authorized' }
}

function textMessage(body: string): WhatsAppMessage {
  return {
    from: PHONE,
    id: crypto.randomUUID(),
    text: { body },
    timestamp: '1762344000',
    type: 'text',
  } as unknown as WhatsAppMessage
}

type HarnessOptions = {
  readonly continuation?: WhatsAppDeliveryPreparationReply['routeContinuation']
  readonly hasOpenAfter?: boolean
  readonly isPreparationAwaiting?: boolean
  readonly preparationAskedAt?: Date
  readonly botAudio?: WhatsAppBotAudio<null>
  readonly position?: Partial<WhatsAppSessionPosition>
}

function createHarness(options: HarnessOptions = {}) {
  const sent: string[] = []
  const departures: Record<string, unknown>[] = []
  let position: WhatsAppSessionPosition = {
    context: {},
    currentNodeId: null,
    currentState: 'start',
    flowKey: null,
    ...options.position,
  }
  const sessions: WhatsAppCommandSessionPort = {
    getContext: async () => position,
    requestHuman: async () => undefined,
    setFlowPosition: async (_company, _phone, flowKey, currentNodeId) => {
      position = { ...position, currentNodeId, flowKey }
    },
    setState: async (_company, _phone, currentState, context) => {
      position = { ...position, context: context ?? position.context, currentState }
    },
  }
  const sender: WhatsAppMessageSenderPort = {
    sendButtons: async () => undefined,
    sendList: async () => undefined,
    sendText: async ({ body }) => {
      sent.push(body)
    },
  }
  let answered = 0
  const preparations: WhatsAppDeliveryPreparations = {
    answer: async () => {
      answered += 1
      const reply: WhatsAppDeliveryPreparationReply = {
        awaitingText: false,
        documentNumber: '17234',
        finished: true,
        ...(options.continuation === undefined ? {} : { routeContinuation: options.continuation }),
        texts: ['*NF 17234 entregue.* Parada concluída. ✅'],
      }
      return reply
    },
    awaitingText: async () => (options.isPreparationAwaiting ?? true) && answered === 0,
    awaitingTextSince: async () => options.preparationAskedAt ?? null,
    begin: async () => ({ awaitingText: false, documentNumber: '', finished: true, texts: [] }),
    hasOpen: async () =>
      answered === 0 && options.isPreparationAwaiting !== false
        ? true
        : (options.hasOpenAfter ?? false),
    receiveLocation: async () => null,
    receivePhoto: async () => null,
  }
  const driver = createWhatsAppCommandDriver({
    ...(options.botAudio === undefined ? {} : { botAudio: options.botAudio }),
    channel: {
      fetchMediaAsBase64: async () => ({
        data: Buffer.from('audio').toString('base64'),
        mimeType: 'audio/ogg',
      }),
    } as unknown as ChannelAdapterInterface,
    clock: () => NOW,
    deliveryProofs: { preparations, resolveDriver: async () => DRIVER_ID },
    driverPrompts: createWhatsAppDriverPrompts({
      clock: () => NOW,
      ports: {
        reportArrival: async () => ({}),
        reportDeparture: async (input) => {
          departures.push(input)
          return { changed: true }
        },
      },
      speech: CATALOG_BOT_SPEECH,
    }),
    graphs: createStaticWhatsAppFlowGraphProvider({ graphs: [GRAPH], rootFlowKey: FLOW_KEY }),
    interpreter: new FlowInterpreter(),
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    rateLimiter: createRateLimiter(),
    resolveActor: authorized,
    sender,
    sessions,
  })
  const session = {
    companyId: COMPANY_ID,
    context: {},
    currentNodeId: null,
    currentState: 'start',
    flowKey: null,
    mode: 'bot',
    whatsappNumber: PHONE,
  } as unknown as ConversationSession
  return {
    contextOf: () => position.context,
    departures,
    preparationAnswers: () => answered,
    sendAudio: () =>
      driver(
        {
          audio: { id: 'media-1', mime_type: 'audio/ogg' },
          from: PHONE,
          id: crypto.randomUUID(),
          timestamp: '1762344000',
          type: 'audio',
        } as unknown as WhatsAppMessage,
        session,
      ),
    send: (body: string) => driver(textMessage(body), session),
    sent,
  }
}

const CONTINUES = { nextStop: NEXT_STOP, tripCompleted: false }

describe('conversa individual: a baixa que fecha a parada oferece a próxima rota', () => {
  test('a oferta pergunta, guarda o pedido e "1" registra a saída pela função do "saí" com chave da oferta', async () => {
    const harness = createHarness({ continuation: CONTINUES })
    await harness.send('1')
    expect(harness.sent[0]).toBe('*NF 17234 entregue.* Parada concluída. ✅')
    expect(harness.sent[1]).toContain('*Parada 4 de 6*')
    expect(harness.sent[1]).toContain('🏪 *Padaria Sol*')
    expect(harness.sent[1]).toContain('*1* - 🚚 Seguir para a *parada 4*')
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toMatchObject({
      kind: 'journey_actions',
      stopId: 'stop-4',
    })

    await harness.send('1')
    expect(harness.departures).toHaveLength(1)
    expect(harness.departures[0]).toMatchObject({
      actorUserId: USER_ID,
      companyId: COMPANY_ID,
      driverId: DRIVER_ID,
      idempotencyKey: `whatsapp-route-offer:stop-4:${NOW.toISOString()}`,
      stopId: 'stop-4',
    })
    expect(harness.sent.at(-1)).toBe('🚚 *Saída registrada* · 09:00')
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test('"3" encerra sem registrar nada e diz o próximo passo', async () => {
    const harness = createHarness({ continuation: CONTINUES })
    await harness.send('1')
    await harness.send('3')
    expect(harness.departures).toHaveLength(0)
    expect(harness.sent.at(-1)).toStartWith('👍 *Certo, nada foi registrado.*\n')
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test.each([
    ['um', 1],
    ['sim', 1],
    ['dois', 0],
    ['agora não', 0],
  ])('falado "%s" responde à oferta (RF22)', async (spoken, departures) => {
    const harness = createHarness({ continuation: CONTINUES })
    await harness.send('1')
    await harness.send(spoken)
    expect(harness.departures).toHaveLength(departures)
  })

  test('texto que não responde repete a pergunta e o pedido continua aberto, sem registrar saída', async () => {
    const harness = createHarness({ continuation: CONTINUES })
    await harness.send('1')
    await harness.send('quero ver o menu')
    expect(harness.departures).toHaveLength(0)
    expect(harness.sent.at(-1)).toBe(
      [
        '🤔 *Não entendi.* Responda com o número da opção:',
        '*1* - 🚚 Seguir para a *parada 4*',
        '*2* - 📋 Escolher outra da lista',
        '*3* - 💤 Nada por enquanto',
      ].join('\n'),
    )
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toMatchObject({ stopId: 'stop-4' })
  })

  test.each(['menu', 'saí'])(
    '"%s" é comando e tira o pedido de cena, sem registrar a saída da oferta',
    async (command) => {
      const harness = createHarness({ continuation: CONTINUES })
      await harness.send('1')
      await harness.send(command)
      expect(harness.departures).toHaveLength(0)
      expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
    },
  )

  test('"cancelar" é do dono da pergunta: encerra a oferta sem registrar', async () => {
    const harness = createHarness({ continuation: CONTINUES })
    await harness.send('1')
    await harness.send('cancelar')
    expect(harness.departures).toHaveLength(0)
    expect(harness.sent.at(-1)).toBe(DRIVER_PROMPT_TEXT.cancelled)
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test('endereço não confiável: a oferta leva o aviso (RF12)', async () => {
    const harness = createHarness({
      continuation: { nextStop: { ...NEXT_STOP, isAddressReliable: false }, tripCompleted: false },
    })
    await harness.send('1')
    expect(harness.sent[1]).toContain('sem localização certa no mapa')
  })

  test('última parada: "Rota concluída", sem oferta nem pedido (RF10)', async () => {
    const harness = createHarness({ continuation: { nextStop: null, tripCompleted: true } })
    await harness.send('1')
    expect(harness.sent).toEqual([
      '*NF 17234 entregue.* Parada concluída. ✅',
      ROUTE_OFFER_TEXT.routeCompleted,
    ])
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test('baixa que não fechou a parada não oferece nada', async () => {
    const harness = createHarness()
    await harness.send('1')
    expect(harness.sent).toEqual(['*NF 17234 entregue.* Parada concluída. ✅'])
  })
})

describe('matriz de não interferência da oferta (RNF1, conversa individual)', () => {
  const WITHOUT_QUESTION = 'quando for sair, mande *saí*.'

  test.each([
    ['entrega ou ocorrência em coleta aberta', { hasOpenAfter: true }],
    ['escolha de parada aberta', { position: { currentNodeId: DRIVER_FLOW_NODE.stopEntry } }],
    [
      'outro pedido em aberto',
      {
        position: {
          context: {
            [DRIVER_PROMPT_CONTEXT_KEY]: {
              kind: 'route_offer',
              offeredAt: NOW.toISOString(),
              stopId: 'stop-9',
            },
          },
        },
      },
    ],
  ] as const)(
    'com %s a frase sai sem pergunta e nenhum pedido novo é aberto',
    async (_name, options) => {
      const harness = createHarness({ ...options, continuation: CONTINUES })
      await harness.send('1')
      expect(harness.sent[1]).toContain(WITHOUT_QUESTION)
      expect(harness.sent[1]).not.toContain('*1* - Sim')
      const stored = harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY] as
        | { stopId?: string }
        | undefined
      expect(stored?.stopId).not.toBe('stop-4')
    },
  )

  test('o "1" do outro pedido em aberto não inicia a rota da oferta antiga que não chegou a existir', async () => {
    const harness = createHarness({ continuation: CONTINUES, hasOpenAfter: true })
    await harness.send('1')
    await harness.send('1')
    expect(harness.departures).toHaveLength(0)
  })
})

describe('a pergunta mais recente é a dona do "1"/"2" (RNF1, áudio x oferta)', () => {
  const SEEDED_OFFER = {
    [DRIVER_PROMPT_CONTEXT_KEY]: {
      kind: 'route_offer',
      offeredAt: NOW.toISOString(),
      stopId: 'stop-4',
    },
  }

  test('áudio pedido ANTES da oferta não rouba o "1": a oferta, mais nova, responde', async () => {
    const botAudio = createWhatsAppBotAudio<null>({
      clock: () => NOW.getTime() - 60_000,
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      transcriber: { transcribe: async () => 'quero ver o menu' },
    })
    const harness = createHarness({
      botAudio,
      isPreparationAwaiting: false,
      position: { context: SEEDED_OFFER },
    })
    await harness.sendAudio()
    await botAudio.idle()
    await harness.send('1')
    expect(harness.departures).toHaveLength(1)
    expect(harness.departures[0]).toMatchObject({ stopId: 'stop-4' })
  })
})

describe('a pergunta mais recente é a dona do "1" (RNF1, entrega em preparo x oferta)', () => {
  const SEEDED_OFFER = {
    [DRIVER_PROMPT_CONTEXT_KEY]: {
      kind: 'route_offer',
      offeredAt: NOW.toISOString(),
      stopId: 'stop-4',
    },
  }

  test('entrega esperando texto desde ANTES da oferta não rouba o "1": a oferta, mais nova, responde', async () => {
    const harness = createHarness({
      position: { context: SEEDED_OFFER },
      preparationAskedAt: new Date(NOW.getTime() - 60_000),
    })
    await harness.send('1')
    expect(harness.preparationAnswers()).toBe(0)
    expect(harness.departures).toHaveLength(1)
    expect(harness.departures[0]).toMatchObject({ stopId: 'stop-4' })
  })

  test('entrega que voltou a perguntar DEPOIS da oferta é quem responde o "1"', async () => {
    const harness = createHarness({
      continuation: CONTINUES,
      position: { context: SEEDED_OFFER },
      preparationAskedAt: new Date(NOW.getTime() + 60_000),
    })
    await harness.send('1')
    expect(harness.preparationAnswers()).toBe(1)
    expect(harness.departures).toHaveLength(0)
  })
})

describe('áudio esperando confirmação tem prioridade sobre a oferta (RNF1)', () => {
  test('o "1" confirma o áudio e não inicia a rota; o texto do áudio é que segue ao fluxo', async () => {
    const botAudio = createWhatsAppBotAudio<null>({
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      transcriber: { transcribe: async () => 'quero ver o menu' },
    })
    const harness = createHarness({ botAudio, continuation: CONTINUES })
    await harness.send('1')
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeDefined()
    await harness.sendAudio()
    await botAudio.idle()
    expect(harness.sent.at(-1)).toContain('Entendi assim')
    await harness.send('1')
    expect(harness.departures).toHaveLength(0)
    // O texto do áudio não responde à oferta: ela é repetida e segue aberta.
    expect(harness.sent.at(-1)).toContain('🤔 *Não entendi.* Responda com o número da opção:')
  })

  test('o "dois" falado descarta o áudio pendente e não responde à oferta', async () => {
    const botAudio = createWhatsAppBotAudio<null>({
      logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
      transcriber: { transcribe: async () => 'quero ver o menu' },
    })
    const harness = createHarness({ botAudio, continuation: CONTINUES })
    await harness.send('1')
    await harness.sendAudio()
    await botAudio.idle()
    await harness.send('2')
    expect(harness.departures).toHaveLength(0)
    expect(harness.sent.at(-1)).toContain('descartei o áudio')
  })
})
