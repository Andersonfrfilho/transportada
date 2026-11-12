/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T4.7 (RF22): na conversa individual todo áudio passa pelo "Entendi assim"; confirmado, o texto falado
 * ("um", "dois", "pular") responde ao passo novo em aberto. Foto e localização continuam mídia: o pedido é
 * repetido dizendo que o item vai por foto/localização.
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
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import type { ResolveWhatsAppActorResult } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import type {
  WhatsAppCommandSessionPort,
  WhatsAppMessageSenderPort,
  WhatsAppSessionPosition,
} from '../../src/whatsapp-commands/application/whatsapp-command-driver.port.js'
import { createWhatsAppCommandDriver } from '../../src/whatsapp-commands/application/whatsapp-command-driver.service.js'
import {
  createWhatsAppDeliveryPreparations,
  MEDIA_REQUEST_TEXT,
  type WhatsAppDeliveryPreparation,
  type WhatsAppDeliveryPreparationRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { createStaticWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import { createInMemoryWhatsAppSharedLocationStore } from '../../src/whatsapp-commands/application/whatsapp-shared-location.service.js'
import { DRIVER_PROMPT_CONTEXT_KEY } from '../../src/whatsapp-commands/domain/whatsapp-driver-prompt.policy.js'
import { ROUTE_OFFER_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  type DeliveryProofFieldSettings,
} from '../../src/trips/domain/delivery-proof-settings.policy.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000002971'
const USER_ID = '00000000-0000-4000-8000-000000002972'
const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000002973'
const DRIVER_ID = '00000000-0000-4000-8000-000000002974'
const PHONE = '5516999995151'
const FLOW_KEY = 'audio-new-steps-root'
const NOW = new Date('2026-11-05T12:00:00.000Z')
const logger = { error: () => undefined, info: () => undefined, warn: () => undefined }

const GRAPH: FlowGraphData = {
  key: FLOW_KEY,
  label: 'Contrato do áudio',
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

const text = (body: string) =>
  ({
    from: PHONE,
    id: crypto.randomUUID(),
    text: { body },
    timestamp: '1762344000',
    type: 'text',
  }) as unknown as WhatsAppMessage

const OFF: DeliveryProofFieldSettings = {
  ...DEFAULT_DELIVERY_PROOF_SETTINGS,
  cargo: 'off',
  photo: 'required',
  receivedBy: 'off',
  receiverDocument: 'off',
  receiverName: 'off',
  signature: 'off',
}

function createHarness(options: {
  readonly prompt?: Record<string, unknown>
  readonly awaiting?: string
  readonly withOpenPreparation?: boolean
}) {
  const sent: string[] = []
  const calls: { kind: string; input: Record<string, unknown> }[] = []
  let transcript = ''
  let position: WhatsAppSessionPosition = {
    context: options.prompt === undefined ? {} : { [DRIVER_PROMPT_CONTEXT_KEY]: options.prompt },
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
  const rows = new Map<string, WhatsAppDeliveryPreparation & { status: string }>()
  if (options.withOpenPreparation === true) {
    rows.set('P1', {
      awaiting: options.awaiting ?? 'photo',
      companyId: COMPANY_ID,
      documentId: 'DOC1',
      documentNumber: '17234',
      driverId: DRIVER_ID,
      id: 'P1',
      location: null,
      originChannel: 'individual',
      photos: [],
      receivedBy: null,
      receiverName: null,
      skipped: [],
      status: 'open',
      version: 1n,
    })
  }
  const repository: WhatsAppDeliveryPreparationRepositoryPort = {
    close: async () => true,
    findOpenByDocument: async ({ documentId }) =>
      [...rows.values()].find((row) => row.documentId === documentId) ?? null,
    listOpenForDriver: async () => [...rows.values()],
    open: async () => null,
    save: async () => true,
  }
  const preparations = createWhatsAppDeliveryPreparations({
    attachProof: async () => ({}),
    deliver: async () => ({ event: 'deliver', kind: 'already_registered' }),
    describeResult: async () => 'ok',
    media: {
      read: async () => new Uint8Array(),
      remove: async () => undefined,
      store: async () => ({ objectKey: 'k', sha256: 'x', sizeBytes: 1 }),
    },
    repository,
    resolveSettings: async () => OFF,
  })
  const sharedLocations = createInMemoryWhatsAppSharedLocationStore({ clock: () => NOW })
  const botAudio = createWhatsAppBotAudio<null>({
    logger,
    transcriber: { transcribe: async () => transcript },
  })
  const driver = createWhatsAppCommandDriver({
    botAudio,
    channel: {
      fetchMediaAsBase64: async () => ({
        data: Buffer.from('a').toString('base64'),
        mimeType: 'audio/ogg',
      }),
    } as unknown as ChannelAdapterInterface,
    clock: () => NOW,
    deliveryProofs: { preparations, resolveDriver: async () => DRIVER_ID },
    driverPrompts: createWhatsAppDriverPrompts({
      clock: () => NOW,
      ports: {
        reportArrival: async (input) => {
          calls.push({ input, kind: 'arrive' })
          return {}
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
    logger,
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
    /** Fala `spoken`, espera a transcrição e confirma com o "1 - Sim" do bot. */
    async speak(spoken: string) {
      transcript = spoken
      await driver(
        {
          audio: { id: 'media-1', mime_type: 'audio/ogg' },
          from: PHONE,
          id: crypto.randomUUID(),
          timestamp: '1762344000',
          type: 'audio',
        } as unknown as WhatsAppMessage,
        session,
      )
      await botAudio.idle()
    },
    send: (body: string) => driver(text(body), session),
    sent,
    sharedLocations,
  }
}

const PROMPT_BASE = { offeredAt: NOW.toISOString(), stopId: 'stop-4', documentNumber: '17300' }

describe('conversa individual: o áudio responde ao passo novo (RF22)', () => {
  test.each([
    ['um', 1],
    ['sim', 1],
    ['dois', 0],
    ['agora não', 0],
  ])('oferta da próxima rota: falou "%s" e confirmou', async (spoken, departures) => {
    const harness = createHarness({ prompt: { ...PROMPT_BASE, kind: 'route_offer' } })
    // Com o ponto compartilhado há pouco, a saída não pergunta a localização de novo (RF24).
    harness.sharedLocations.remember({
      companyId: COMPANY_ID,
      location: {
        accuracyMeters: null,
        capturedAt: NOW.toISOString(),
        latitude: '-21.17',
        longitude: '-47.81',
      },
      whatsappNumber: PHONE,
    })
    await harness.speak(spoken)
    expect(harness.sent.at(-1)).toContain('Entendi assim')
    expect(harness.calls).toHaveLength(0)
    await harness.send('1')
    expect(harness.calls.filter((call) => call.kind === 'depart')).toHaveLength(departures)
    if (departures === 0) expect(harness.sent.at(-1)).toBe(ROUTE_OFFER_TEXT.declined)
  })

  test('pedido de localização: "pular" falado registra a chegada sem ponto', async () => {
    const harness = createHarness({
      prompt: { ...PROMPT_BASE, attempts: 0, event: 'arrive', kind: 'location' },
    })
    await harness.speak('pular')
    await harness.send('1')
    expect(harness.calls).toHaveLength(1)
    expect(harness.calls[0]).toMatchObject({ input: { location: null }, kind: 'arrive' })
  })

  test('fora de ordem: "um" falado confirma e reenvia com confirmOutOfOrder', async () => {
    const harness = createHarness({
      prompt: { ...PROMPT_BASE, event: 'depart', kind: 'out_of_order', nextStopId: 'stop-3' },
    })
    await harness.speak('um')
    await harness.send('1')
    expect(harness.calls.at(-1)).toMatchObject({
      input: { confirmOutOfOrder: true, stopId: 'stop-4' },
      kind: 'depart',
    })
  })

  test('fora de ordem: "dois" falado vai à próxima do roteiro', async () => {
    const harness = createHarness({
      prompt: { ...PROMPT_BASE, event: 'depart', kind: 'out_of_order', nextStopId: 'stop-3' },
    })
    await harness.speak('dois')
    await harness.send('1')
    expect(harness.calls.at(-1)).toMatchObject({ input: { stopId: 'stop-3' }, kind: 'depart' })
  })
})

describe('pediu foto e veio áudio (RF22, conversa individual)', () => {
  test('o áudio confirmado repete o pedido dizendo que o item vai por foto', async () => {
    const harness = createHarness({ withOpenPreparation: true })
    await harness.speak('já mandei a foto do canhoto')
    await harness.send('1')
    expect(harness.sent).toContain(MEDIA_REQUEST_TEXT.photo)
    expect(harness.sent.at(-1)).toBe(
      [
        '📍 *NF `17234` · localização*',
        'Se puder, compartilhe a localização da entrega (clipe 📎 → Localização).',
        '_Falta 1 item. Se não tiver, responda pular._',
      ].join('\n'),
    )
  })

  test('pediu a localização e veio áudio: o pedido diz que o item vai por localização', async () => {
    const harness = createHarness({ awaiting: 'location', withOpenPreparation: true })
    await harness.speak('estou aqui na porta do cliente')
    await harness.send('1')
    expect(harness.sent).toContain(MEDIA_REQUEST_TEXT.location)
  })

  test('o mesmo texto digitado segue o fluxo de sempre, sem repetir o pedido', async () => {
    const harness = createHarness({ withOpenPreparation: true })
    await harness.send('já mandei a foto do canhoto')
    expect(harness.sent).not.toContain(MEDIA_REQUEST_TEXT.photo)
  })

  test('"pular" falado vale quando o item é opcional (a preparação o aceita como texto)', async () => {
    const harness = createHarness({ withOpenPreparation: true })
    await harness.speak('pular')
    await harness.send('1')
    expect(harness.sent).not.toContain(MEDIA_REQUEST_TEXT.photo)
  })
})
