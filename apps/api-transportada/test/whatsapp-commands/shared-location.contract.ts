/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 T3.6 (D3 revista, CA03): a mensagem de localização do motorista vira o mesmo
 * `ReportedLocation` das rotas HTTP, fica lembrada só em memória e só para um toque, e só o
 * motorista (`trip.report`) tem ponto lembrado — o operador compartilha o canal e nunca.
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
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import {
  createInMemoryWhatsAppSharedLocationStore,
  extractWhatsAppIncomingLocation,
  type WhatsAppSharedLocationStore,
} from '../../src/whatsapp-commands/application/whatsapp-shared-location.service.js'
import { WHATSAPP_SHARED_LOCATION_REPLY } from '../../src/whatsapp-commands/domain/whatsapp-command.constant.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000051'
const USER_ID = '00000000-0000-4000-8000-000000000052'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000053'
const PHONE = '5516999995151'
const FLOW_KEY = 'shared-location-root'
const NOW = new Date('2026-09-11T12:00:00.000Z')
const SENT_AT_SECONDS = '1757592000'

const GRAPH: FlowGraphData = {
  key: FLOW_KEY,
  label: 'Contrato de localização',
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

function locationMessage(input: {
  readonly location?: unknown
  readonly timestamp?: string
  readonly type?: string
}): WhatsAppMessage {
  return {
    from: PHONE,
    id: crypto.randomUUID(),
    ...(input.location === undefined ? {} : { location: input.location }),
    timestamp: input.timestamp ?? SENT_AT_SECONDS,
    type: input.type ?? 'location',
  } as unknown as WhatsAppMessage
}

describe('a mensagem de localização vira o ReportedLocation das rotas HTTP', () => {
  test('latitude e longitude entram no formato de 7 casas, com a hora da mensagem e sem precisão', () => {
    const location = extractWhatsAppIncomingLocation(
      locationMessage({ location: { latitude: -23.55052, longitude: -46.633308 } }),
      NOW,
    )

    expect(location).toEqual({
      accuracyMeters: null,
      capturedAt: '2025-09-11T12:00:00.000Z',
      latitude: '-23.5505200',
      longitude: '-46.6333080',
    })
  })

  test('nome, endereço e url são texto do motorista e não entram', () => {
    const location = extractWhatsAppIncomingLocation(
      locationMessage({
        location: {
          address: 'Rua do Motorista, 1',
          latitude: -23.5,
          longitude: -46.6,
          name: 'Casa',
          url: 'https://maps.example/x',
        },
      }),
      NOW,
    )

    expect(Object.keys(location ?? {}).toSorted()).toEqual([
      'accuracyMeters',
      'capturedAt',
      'latitude',
      'longitude',
    ])
  })

  test.each([
    ['latitude acima de 90', { latitude: 91, longitude: 0 }],
    ['latitude abaixo de -90', { latitude: -90.0001, longitude: 0 }],
    ['longitude acima de 180', { latitude: 0, longitude: 180.5 }],
    ['longitude abaixo de -180', { latitude: 0, longitude: -181 }],
    ['latitude em texto', { latitude: '-23.5', longitude: -46.6 }],
    ['sem longitude', { latitude: -23.5 }],
    ['objeto vazio', {}],
    ['valor que não é objeto', 'aqui'],
  ])('%s é recusada como se a mensagem não trouxesse ponto', (_name, location) => {
    expect(extractWhatsAppIncomingLocation(locationMessage({ location }), NOW)).toBeUndefined()
  })

  test('só a mensagem do tipo location conta, mesmo que outra traga a chave', () => {
    expect(
      extractWhatsAppIncomingLocation(
        locationMessage({ location: { latitude: -23.5, longitude: -46.6 }, type: 'text' }),
        NOW,
      ),
    ).toBeUndefined()
    expect(extractWhatsAppIncomingLocation(locationMessage({}), NOW)).toBeUndefined()
  })

  test('hora da mensagem ilegível cai na hora do servidor', () => {
    const location = extractWhatsAppIncomingLocation(
      locationMessage({
        location: { latitude: -23.5, longitude: -46.6 },
        timestamp: 'ontem',
      }),
      NOW,
    )

    expect(location?.capturedAt).toBe(NOW.toISOString())
  })
})

describe('o armazém do ponto: memória, um toque, cinco minutos', () => {
  const LOCATION = {
    accuracyMeters: null,
    capturedAt: NOW.toISOString(),
    latitude: '-23.5000000',
    longitude: '-46.6000000',
  }
  const KEY = { companyId: COMPANY_ID, whatsappNumber: PHONE }

  function createClockedStore(options: { readonly maxEntries?: number } = {}) {
    const clock = { now: NOW.getTime() }
    const store = createInMemoryWhatsAppSharedLocationStore({
      clock: () => new Date(clock.now),
      ...options,
    })

    return { clock, store }
  }

  test('o ponto é devolvido uma vez e esquecido', () => {
    const { store } = createClockedStore()
    store.remember({ ...KEY, location: LOCATION })

    expect(store.consume(KEY)).toEqual(LOCATION)
    expect(store.consume(KEY)).toBeNull()
  })

  test('uma localização nova substitui a anterior do mesmo número', () => {
    const { store } = createClockedStore()
    store.remember({ ...KEY, location: LOCATION })
    store.remember({ ...KEY, location: { ...LOCATION, latitude: '-1.0000000' } })

    expect(store.consume(KEY)?.latitude).toBe('-1.0000000')
  })

  test('passados cinco minutos o ponto vence e não é entregue', () => {
    const { clock, store } = createClockedStore()
    store.remember({ ...KEY, location: LOCATION })
    clock.now += 5 * 60_000 + 1

    expect(store.consume(KEY)).toBeNull()
  })

  test('um instante antes do vencimento o ponto ainda vale', () => {
    const { clock, store } = createClockedStore()
    store.remember({ ...KEY, location: LOCATION })
    clock.now += 5 * 60_000 - 1

    expect(store.consume(KEY)).toEqual(LOCATION)
  })

  test('empresa e número diferentes não enxergam o ponto um do outro', () => {
    const { store } = createClockedStore()
    store.remember({ ...KEY, location: LOCATION })

    expect(store.consume({ companyId: 'outra', whatsappNumber: PHONE })).toBeNull()
    expect(store.consume({ companyId: COMPANY_ID, whatsappNumber: '5511000000000' })).toBeNull()
    expect(store.consume(KEY)).toEqual(LOCATION)
  })

  test('os vencidos saem a cada remember e a cada consume, não só quando alguém os lê', () => {
    const { clock, store } = createClockedStore()
    store.remember({ ...KEY, location: LOCATION, whatsappNumber: '1' })
    store.remember({ ...KEY, location: LOCATION, whatsappNumber: '2' })
    clock.now += 5 * 60_000 + 1
    expect(store.size()).toBe(2)

    store.remember({ ...KEY, location: LOCATION, whatsappNumber: '3' })
    expect(store.size()).toBe(1)

    clock.now += 5 * 60_000 + 1
    expect(store.consume({ ...KEY, whatsappNumber: '9' })).toBeNull()
    expect(store.size()).toBe(0)
  })

  test('no teto de entradas o mais antigo sai, e o armazém não cresce sem limite', () => {
    const { store } = createClockedStore({ maxEntries: 2 })
    store.remember({ ...KEY, location: LOCATION, whatsappNumber: '1' })
    store.remember({ ...KEY, location: LOCATION, whatsappNumber: '2' })
    store.remember({ ...KEY, location: LOCATION, whatsappNumber: '3' })

    expect(store.consume({ ...KEY, whatsappNumber: '1' })).toBeNull()
    expect(store.consume({ ...KEY, whatsappNumber: '2' })).toEqual(LOCATION)
    expect(store.consume({ ...KEY, whatsappNumber: '3' })).toEqual(LOCATION)
  })
})

async function buildActor(role: 'driver' | 'operator'): Promise<ResolveWhatsAppActorResult> {
  const tenantContext = new TenantContextService({
    repository: {
      findActiveByUserAndCompany: async () => ({
        grantedPermissions: [],
        membershipId: MEMBERSHIP_ID,
        roles: [role],
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

function buildSession(): ConversationSession {
  return {
    assignedUserId: null,
    companyId: COMPANY_ID,
    context: {},
    createdAt: NOW.toISOString(),
    currentState: 'start',
    humanRequestedAt: null,
    id: 'session-location',
    lastActivity: NOW.toISOString(),
    lastAgentReadAt: null,
    lastInboundAt: null,
    mode: 'bot',
    updatedAt: NOW.toISOString(),
    whatsappNumber: PHONE,
  }
}

function createHarness(input: {
  readonly role: 'driver' | 'operator'
  readonly sharedLocations?: WhatsAppSharedLocationStore
}) {
  const logged: unknown[] = []
  const sessionCalls: string[] = []
  const sent: unknown[] = []
  const sessions: WhatsAppCommandSessionPort = {
    async getContext() {
      return undefined
    },
    async requestHuman() {
      sessionCalls.push('requestHuman')
    },
    async setFlowPosition() {
      sessionCalls.push('setFlowPosition')
    },
    async setState() {
      sessionCalls.push('setState')
    },
  }
  const sender: WhatsAppMessageSenderPort = {
    async sendButtons(message) {
      sent.push(message)
    },
    async sendList(message) {
      sent.push(message)
    },
    async sendText(message) {
      sent.push(message)
    },
  }
  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, meta })
  }

  const onMessageReceived = createWhatsAppCommandDriver({
    channel: {} as ChannelAdapterInterface,
    clock: () => NOW,
    graphs: createStaticWhatsAppFlowGraphProvider({ graphs: [GRAPH], rootFlowKey: FLOW_KEY }),
    interpreter: new FlowInterpreter(),
    logger: { error: record, info: record, warn: record },
    rateLimiter: createRateLimiter(),
    resolveActor: async () => buildActor(input.role),
    sender,
    sessions,
    ...(input.sharedLocations === undefined ? {} : { sharedLocations: input.sharedLocations }),
  })

  return { logged, onMessageReceived, sent, sessionCalls }
}

const SHARED_KEY = { companyId: COMPANY_ID, whatsappNumber: PHONE }
const MESSAGE_WITH_POINT = locationMessage({
  location: { latitude: -23.55052, longitude: -46.633308 },
})

describe('o despachante lembra a localização só do motorista (spec 196 T3.6)', () => {
  test('o motorista manda a localização: o ponto é lembrado e a resposta confirma, sem coordenada', async () => {
    const store = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
    const harness = createHarness({ role: 'driver', sharedLocations: store })

    await harness.onMessageReceived(MESSAGE_WITH_POINT, buildSession())

    expect(harness.sent).toEqual([{ body: WHATSAPP_SHARED_LOCATION_REPLY, to: PHONE }])
    expect(store.consume(SHARED_KEY)).toMatchObject({
      latitude: '-23.5505200',
      longitude: '-46.6333080',
    })
  })

  test('a localização não é resposta do menu: não mexe na posição do fluxo nem conta tentativa', async () => {
    const store = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
    const harness = createHarness({ role: 'driver', sharedLocations: store })

    await harness.onMessageReceived(MESSAGE_WITH_POINT, buildSession())

    expect(harness.sessionCalls).toEqual([])
  })

  test('o operador compartilha o canal e nunca tem ponto lembrado', async () => {
    const store = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
    const harness = createHarness({ role: 'operator', sharedLocations: store })

    await harness.onMessageReceived(MESSAGE_WITH_POINT, buildSession())

    expect(store.consume(SHARED_KEY)).toBeNull()
    expect(JSON.stringify(harness.sent)).not.toContain(WHATSAPP_SHARED_LOCATION_REPLY)
  })

  test('sem armazém configurado a localização não é interceptada', async () => {
    const harness = createHarness({ role: 'driver' })

    await harness.onMessageReceived(MESSAGE_WITH_POINT, buildSession())

    expect(JSON.stringify(harness.sent)).not.toContain(WHATSAPP_SHARED_LOCATION_REPLY)
  })

  test('localização fora da faixa do globo não é lembrada nem confirmada', async () => {
    const store = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
    const harness = createHarness({ role: 'driver', sharedLocations: store })

    await harness.onMessageReceived(
      locationMessage({ location: { latitude: 200, longitude: -46.6 } }),
      buildSession(),
    )

    expect(store.consume(SHARED_KEY)).toBeNull()
    expect(JSON.stringify(harness.sent)).not.toContain(WHATSAPP_SHARED_LOCATION_REPLY)
  })

  test('a coordenada nunca aparece em log nem no que o bot responde', async () => {
    const store = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
    const harness = createHarness({ role: 'driver', sharedLocations: store })

    await harness.onMessageReceived(MESSAGE_WITH_POINT, buildSession())
    await harness.onMessageReceived(
      locationMessage({ location: { latitude: 200, longitude: -46.633308 } }),
      buildSession(),
    )

    const everything = JSON.stringify([harness.logged, harness.sent])
    expect(everything).not.toContain('23.55')
    expect(everything).not.toContain('46.63')
  })
})
