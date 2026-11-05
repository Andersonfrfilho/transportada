/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.9 (RF24): antes de registrar "Iniciar rota"/"saí" e "cheguei" pelo bot, a conversa individual pede
 * a localização opcional ("pular" falado ou digitado vale) e usa sem perguntar a que foi compartilhada há pouco.
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
import type { CompanyPermission } from '../../src/identity/domain/authorization.policy.js'
import type { FindCurrentDriverTripResult } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import {
  createDriverWhatsAppFlowActions,
  type DriverFlowActionDependencies,
} from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import { createInMemoryWhatsAppSharedLocationStore } from '../../src/whatsapp-commands/application/whatsapp-shared-location.service.js'
import {
  DRIVER_FLOW_ACTION_KIND,
  DRIVER_FLOW_CONTEXT_KEY,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-flow.constant.js'
import {
  DRIVER_PROMPT_CONTEXT_KEY,
  DRIVER_PROMPT_KIND,
} from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'
import { LOCATION_PROMPT_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000002961'
const USER_ID = '00000000-0000-4000-8000-000000002962'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000002963'
const DRIVER_ID = '00000000-0000-4000-8000-000000002964'
const TRIP_ID = '00000000-0000-4000-8000-000000002965'
const PHONE = '5516999995151'
const NOW = new Date('2026-11-05T12:00:00.000Z')
const FLOW_KEY = 'stop-location-root'
const POINT = {
  accuracyMeters: null,
  capturedAt: NOW.toISOString(),
  latitude: '-21.17',
  longitude: '-47.81',
}

const GRAPH: FlowGraphData = {
  key: FLOW_KEY,
  label: 'Contrato do pedido de localização',
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

const textMessage = (body: string) =>
  ({
    from: PHONE,
    id: crypto.randomUUID(),
    text: { body },
    timestamp: '1762344000',
    type: 'text',
  }) as unknown as WhatsAppMessage
const locationMessage = () =>
  ({
    from: PHONE,
    id: crypto.randomUUID(),
    location: { latitude: -21.17, longitude: -47.81 },
    timestamp: '1762344000',
    type: 'location',
  }) as unknown as WhatsAppMessage

function createHarness(prompt?: Record<string, unknown>, arrivalOutcome: object = { id: 'e' }) {
  const sent: string[] = []
  const calls: { kind: string; input: Record<string, unknown> }[] = []
  let position: WhatsAppSessionPosition = {
    context: prompt === undefined ? {} : { [DRIVER_PROMPT_CONTEXT_KEY]: prompt },
    currentNodeId: null,
    currentState: 'start',
    flowKey: null,
  }
  const sessions: WhatsAppCommandSessionPort = {
    getContext: async () => position,
    requestHuman: async () => undefined,
    setFlowPosition: async (_c, _p, flowKey, currentNodeId) => {
      position = { ...position, currentNodeId, flowKey }
    },
    setState: async (_c, _p, currentState, context) => {
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
  const sharedLocations = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
  const driver = createWhatsAppCommandDriver({
    channel: {} as ChannelAdapterInterface,
    clock: () => NOW,
    deliveryProofs: {
      preparations: {
        answer: async () => null,
        awaitingText: async () => false,
        begin: async () => ({ awaitingText: false, documentNumber: '', finished: true, texts: [] }),
        hasOpen: async () => false,
        receiveLocation: async () => null,
        receivePhoto: async () => null,
      },
      resolveDriver: async () => DRIVER_ID,
    },
    driverPrompts: createWhatsAppDriverPrompts({
      clock: () => NOW,
      ports: {
        reportArrival: async (input) => {
          calls.push({ input, kind: 'arrive' })
          return arrivalOutcome
        },
        reportDeparture: async (input) => {
          calls.push({ input, kind: 'depart' })
          return { changed: true }
        },
      },
      sharedLocations,
      speech: CATALOG_BOT_SPEECH,
    }),
    graphs: createStaticWhatsAppFlowGraphProvider({ graphs: [GRAPH], rootFlowKey: FLOW_KEY }),
    interpreter: new FlowInterpreter(),
    logger: { error: () => undefined, info: () => undefined, warn: () => undefined },
    rateLimiter: createRateLimiter(),
    resolveActor: authorized,
    sender,
    sessions,
    sharedLocations,
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
    calls,
    contextOf: () => position.context,
    send: (message: WhatsAppMessage) => driver(message, session),
    sent,
    sharedLocations,
  }
}

const ARRIVE_PROMPT = {
  attempts: 0,
  documentNumber: '17234',
  event: 'arrive',
  kind: DRIVER_PROMPT_KIND.location,
  offeredAt: NOW.toISOString(),
  stopId: 'stop-1',
}

describe('conversa individual: a resposta ao pedido de localização (RF24)', () => {
  test('"pular" digitado registra a chegada sem ponto e fecha o pedido', async () => {
    const harness = createHarness(ARRIVE_PROMPT)
    await harness.send(textMessage('pular'))
    expect(harness.calls).toHaveLength(1)
    expect(harness.calls[0]).toMatchObject({
      input: { location: null, stopId: 'stop-1' },
      kind: 'arrive',
    })
    expect(harness.sent).toEqual(['Chegada registrada. 📍'])
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test.each(['Pular.', 'pular por favor', 'não'])('falado "%s" também pula', async (spoken) => {
    const harness = createHarness({ ...ARRIVE_PROMPT, event: 'depart' })
    await harness.send(textMessage(spoken))
    expect(harness.calls.map((call) => call.kind)).toEqual(['depart'])
  })

  test('a localização compartilhada registra o evento com o ponto, e o ponto não fica lembrado', async () => {
    const harness = createHarness(ARRIVE_PROMPT)
    await harness.send(locationMessage())
    expect(harness.calls).toHaveLength(1)
    expect(harness.calls[0]?.input.location).toMatchObject({ latitude: '-21.1700000' })
    expect(harness.sharedLocations.has({ companyId: COMPANY_ID, whatsappNumber: PHONE })).toBe(
      false,
    )
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test('outra resposta repete que o item vai por localização; na terceira o pedido é abandonado sem registrar', async () => {
    const harness = createHarness(ARRIVE_PROMPT)
    await harness.send(textMessage('estou aqui na frente'))
    expect(harness.sent.at(-1)).toBe(LOCATION_PROMPT_TEXT.askAgain)
    await harness.send(textMessage('na frente do cliente'))
    await harness.send(textMessage('chegando agora mesmo ok'))
    expect(harness.sent.at(-1)).toBe(LOCATION_PROMPT_TEXT.gaveUp)
    expect(harness.calls).toEqual([])
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })

  test('outro comando ("saí") tira o pedido de cena e segue o fluxo, sem registrar a chegada', async () => {
    const harness = createHarness(ARRIVE_PROMPT)
    await harness.send(textMessage('saí'))
    expect(harness.calls).toEqual([])
    expect(harness.contextOf()[DRIVER_PROMPT_CONTEXT_KEY]).toBeUndefined()
  })
})

describe('o "saí"/"cheguei" da conversa individual pede a localização (RF24)', () => {
  function actionsHarness(options: {
    readonly isAddressReliable?: boolean
    readonly withLocation: boolean
  }) {
    const sent: string[] = []
    const calls: string[] = []
    const sharedLocations = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
    if (options.withLocation) {
      sharedLocations.remember({
        companyId: COMPANY_ID,
        location: POINT,
        whatsappNumber: PHONE,
      })
    }
    const trip = {
      isRegisteredDriver: true,
      pendingProofs: [],
      trips: [
        {
          id: TRIP_ID,
          manifest: null,
          status: 'dispatched',
          stops: [
            {
              arrivedAt: null,
              completedAt: null,
              documents: [{ id: 'doc-1', number: '017234', separationStatus: 'loaded' }],
              enRouteSince: null,
              id: 'stop-1',
              isAddressReliable: options.isAddressReliable ?? true,
              sequence: 1,
            },
          ],
          vehiclePlate: 'ABC1D23',
        },
      ],
    } as unknown as FindCurrentDriverTripResult
    const ports = {
      reportArrival: async () => {
        calls.push('arrive')
        return {}
      },
      reportDeparture: async () => {
        calls.push('depart')
        return { changed: true }
      },
    }
    const deps: DriverFlowActionDependencies = {
      consumeSharedLocation: (key) => sharedLocations.consume(key),
      driverPrompts: createWhatsAppDriverPrompts({
        clock: () => NOW,
        ports,
        sharedLocations,
        speech: CATALOG_BOT_SPEECH,
      }),
      findCurrentTrip: async () => trip,
      listOccurrenceTypes: async () => [],
      now: () => NOW,
      registerOccurrence: async () => ({}) as never,
      ...ports,
      reportDelivery: async () => ({ alreadySettled: false }),
      reportReturn: async () => ({ alreadySettled: false }),
      resolveDriverId: async () => DRIVER_ID,
    }
    const channel = {
      sendText: async (_to: string, body: string) => {
        sent.push(body)
        return { externalMessageId: null }
      },
    } as unknown as ChannelAdapterInterface
    async function run(kind: string) {
      const definition = createDriverWhatsAppFlowActions(deps).find((item) => item.kind === kind)
      const context = { [DRIVER_FLOW_CONTEXT_KEY.tripId]: TRIP_ID }
      return definition?.handler({
        actor: {
          identity: { channel: 'whatsapp', userId: USER_ID },
          scope: {
            companyId: COMPANY_ID,
            kind: 'company',
            membershipId: MEMBERSHIP_ID,
            permissions: new Set<CompanyPermission>(['trip.read', 'trip.report']),
            roles: ['driver'],
            userId: USER_ID,
          },
        } as never,
        channel,
        context,
        node: { actionKind: kind, id: 'n', type: 'action' } as never,
        session: {
          companyId: COMPANY_ID,
          context,
          whatsappNumber: PHONE,
        } as unknown as ConversationSession,
      })
    }
    return { calls, run, sent }
  }

  test.each([
    [DRIVER_FLOW_ACTION_KIND.depart, 'depart'],
    [DRIVER_FLOW_ACTION_KIND.arrive, 'arrive'],
  ] as const)('%s sem ponto recente pergunta antes de registrar', async (kind, event) => {
    const harness = actionsHarness({ withLocation: false })
    const result = await harness.run(kind)
    expect(harness.calls).toEqual([])
    expect(harness.sent).toEqual([LOCATION_PROMPT_TEXT.ask])
    expect(result).toMatchObject({
      context: { [DRIVER_PROMPT_CONTEXT_KEY]: { event, kind: 'location', stopId: 'stop-1' } },
    })
  })

  test('com a localização compartilhada há pouco, registra direto sem perguntar de novo', async () => {
    const harness = actionsHarness({ withLocation: true })
    await harness.run(DRIVER_FLOW_ACTION_KIND.arrive)
    expect(harness.calls).toEqual(['arrive'])
    expect(harness.sent).toEqual(['Chegada registrada. 📍'])
  })

  describe('"cheguei" em parada sem localização certa corrige o endereço (spec 294 RF14)', () => {
    test('o pedido de localização explica que o ponto atualiza o endereço', async () => {
      const harness = actionsHarness({ isAddressReliable: false, withLocation: false })
      await harness.run(DRIVER_FLOW_ACTION_KIND.arrive)
      expect(harness.sent).toEqual([LOCATION_PROMPT_TEXT.askUnreliableAddress])
      expect(LOCATION_PROMPT_TEXT.askUnreliableAddress).toContain('eu atualizo o endereço')
    })

    test('parada confiável e "saí" não mudam o pedido', async () => {
      const reliable = actionsHarness({ isAddressReliable: true, withLocation: false })
      await reliable.run(DRIVER_FLOW_ACTION_KIND.arrive)
      expect(reliable.sent).toEqual([LOCATION_PROMPT_TEXT.ask])
      const departing = actionsHarness({ isAddressReliable: false, withLocation: false })
      await departing.run(DRIVER_FLOW_ACTION_KIND.depart)
      expect(departing.sent).toEqual([LOCATION_PROMPT_TEXT.ask])
    })

    test('a localização da chegada corrigiu o cadastro: a resposta diz "Endereço atualizado"', async () => {
      const harness = createHarness(ARRIVE_PROMPT, { addressCorrection: 'applied', id: 'e' })
      await harness.send(locationMessage())
      expect(harness.sent).toEqual(['Chegada registrada. 📍\nEndereço atualizado. ✅'])
    })

    test('o ponto ficou longe do cadastro: a resposta diz que foi ao escritório conferir', async () => {
      const harness = createHarness(ARRIVE_PROMPT, { addressCorrection: 'suggested', id: 'e' })
      await harness.send(locationMessage())
      expect(harness.sent[0]).toContain('Enviei para o escritório conferir')
    })

    test.each(['ignored', 'failed'])('"%s" não diz nada sobre o endereço', async (outcome) => {
      const harness = createHarness(ARRIVE_PROMPT, { addressCorrection: outcome, id: 'e' })
      await harness.send(locationMessage())
      expect(harness.sent).toEqual(['Chegada registrada. 📍'])
    })
  })
})
