/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RNF1, caminho completo: webhook do grupo -> sessão do pedido -> fluxo do motorista -> canhoto. Com um
 * fluxo esperando resposta, cada entrada (localização, "1", "2", "pular", "cancelar", texto livre e a transcrição
 * de áudio confirmada) é tratada só pelo dono da pergunta; nenhum outro fluxo é chamado nem muda de estado.
 */
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../../src/shared/api.types.js'
import { createEvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  createEvolutionGroupInbound,
  createGroupQuestionAskedHandler,
  type EvolutionMessageEvent,
  type GroupAudio,
  type GroupAudioContext,
  type GroupMedia,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import { GROUP_OCCURRENCE_STEP } from '../../src/whatsapp/application/whatsapp-group-occurrence-flow.service.js'
import { createGroupProofIntake } from '../../src/whatsapp/application/whatsapp-group-proof-intake.service.js'
import type {
  GroupFlowOutcome,
  GroupFlowTurn,
  GroupRequest,
  GroupRequestRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createWhatsAppGroupRequestSessions } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER = '5516988887777'
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }
const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const NOW = new Date('2026-11-05T12:00:00.000Z')
const AUDIO = { data: Buffer.from('opus').toString('base64'), mimeType: 'audio/ogg' }
const VOICE: GroupAudio = {
  mimeType: 'audio/ogg',
  quotedParticipant: `${BOT}@s.whatsapp.net`,
  seconds: 5,
}
const LOCATION: GroupMedia = { kind: 'location', latitude: -20.5673337, longitude: -47.3604457 }

type Owner = 'canhoto' | 'close' | 'delivery' | 'occurrence' | 'route' | 'stop'
type Spies = {
  readonly canhoto: string[]
  readonly close: string[]
  readonly delivery: string[]
  readonly occurrence: string[]
  readonly stopRecords: unknown[]
}

const TARGET = { documentNumber: '1', event: 'depart', stopId: 'S1' }
const ONE_STOP = [{ id: 'S1', isAddressReliable: true, label: 'NF 1', numbers: ['1'] }]

const PENDING: readonly {
  readonly owner: Owner
  readonly state: Record<string, unknown>
  readonly step: string
}[] = [
  { owner: 'stop', state: { event: 'depart', stops: ONE_STOP }, step: 'stop.choose' },
  { owner: 'stop', state: { locationFor: TARGET }, step: 'stop.location' },
  { owner: 'stop', state: { outOfOrderFor: TARGET }, step: 'stop.confirm_order' },
  { owner: 'route', state: { routeOffer: { stopId: 'S1' } }, step: 'route.offer' },
  { owner: 'close', state: {}, step: 'close.confirm' },
  { owner: 'delivery', state: {}, step: 'delivery.answer' },
  ...Object.values(GROUP_OCCURRENCE_STEP).map((step) => ({
    owner: 'occurrence' as const,
    state: {},
    step,
  })),
]

function memoryRepository(seed: { step: string; state: Record<string, unknown> }) {
  const request: GroupRequest & { status: string } = {
    attempts: 0,
    companyId: COMPANY_ID,
    driverId: 'D1',
    expiresAt: new Date(NOW.getTime() + 3_600_000),
    groupJid: GROUP,
    id: 'R1',
    ownerNumber: DRIVER,
    state: seed.state,
    status: 'open',
    step: seed.step,
    version: 1n,
  }
  const claimed = new Set<string>()
  const repository: GroupRequestRepositoryPort = {
    claimMessage: async ({ providerMessageId }) => {
      if (claimed.has(providerMessageId)) return false
      claimed.add(providerMessageId)
      return true
    },
    findOpen: async () => (request.status === 'open' ? { ...request } : null),
    linkMessage: async () => undefined,
    open: async () => null,
    update: async ({ attempts, close, state, step, version }) => {
      if (request.status !== 'open' || request.version !== version) return false
      Object.assign(request, {
        attempts,
        state,
        step,
        version: version + 1n,
        ...(close === undefined ? {} : { status: close }),
      })
      return true
    },
  }
  return { repository, request }
}

function setup(seed: { step: string; state: Record<string, unknown> }) {
  const spies: Spies = { canhoto: [], close: [], delivery: [], occurrence: [], stopRecords: [] }
  const { repository, request } = memoryRepository(seed)
  const sent: string[] = []
  const spy = (name: 'close' | 'delivery' | 'occurrence', step: string): GroupFlowOutcome => {
    spies[name].push(step)
    return { kind: 'continue', replies: [name], state: {}, step: 'inner' }
  }
  const flow = createGroupDriverFlow({
    delivery: {
      answer: async (turn: GroupFlowTurn) => spy('delivery', turn.request.step),
      awaitingText: async () => false,
      begin: async () => spy('delivery', 'begin'),
      hasOpen: async () => false,
    } as never,
    occurrence: {
      answer: async (turn) => spy('occurrence', turn.request.step),
      initialStep: GROUP_OCCURRENCE_STEP.document,
      locationReceived: (turn) =>
        turn.request.step === GROUP_OCCURRENCE_STEP.location ? spy('occurrence', 'location') : null,
      start: async () => spy('occurrence', 'start'),
    },
    stop: createGroupStopFlow({
      enRouteMessage: async () => 'a caminho',
      hasLocation: () => false,
      listStops: async () => [],
      record: async (input) => {
        spies.stopRecords.push(input)
        return { message: 'registrado' }
      },
    }),
    tripClose: {
      answer: async (turn: GroupFlowTurn) => spy('close', turn.request.step),
      begin: async () => spy('close', 'begin'),
      matches: () => false,
    } as never,
  })
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger,
    transcriber: { transcribe: async () => 'tudo certo' },
  })
  const sessions = createWhatsAppGroupRequestSessions({
    clock: () => NOW,
    flow,
    logger,
    onQuestionAsked: createGroupQuestionAskedHandler(bot),
    replies: { send: ({ texts }) => void sent.push(...texts) },
    repository,
  })
  const intake = createGroupProofIntake({
    downloadMedia: async () => AUDIO,
    findActorUserId: async () => 'U1',
    openAnswerRequest: async () => undefined,
    preparations: {
      answer: async () => null,
      awaitingText: async () => false,
      begin: async () => ({ awaitingText: false, documentNumber: '', finished: true, texts: [] }),
      hasOpen: async () => false,
      receiveLocation: async () => {
        spies.canhoto.push('location')
        return { awaitingText: false, documentNumber: '1', finished: false, texts: ['canhoto'] }
      },
      receivePhoto: async () => {
        spies.canhoto.push('photo')
        return null
      },
    },
    advanceRequest: (input) => sessions.handleLocation(input),
    rememberLocation: () => undefined,
    replies: { send: ({ texts }) => void sent.push(...texts) },
    withoutAccessText: async () => 'sem acesso',
  })
  const inbound = createEvolutionGroupInbound({
    audio: { bot, download: async () => AUDIO, reply: () => undefined },
    findGroupDriver: async () => ({ driverId: 'D1' }),
    findOpenRequestOwner: async () => (request.status === 'open' ? DRIVER : null),
    handle: (message) => sessions.handle(message),
    handleMedia: (media) => intake.handle(media),
    identity: createEvolutionGroupIdentity({
      gateway: { getOwnerNumber: async () => BOT, listGroupParticipants: async () => [] },
    }),
    isGroupDriver: async () => true,
  })
  let counter = 0
  const base = (): EvolutionMessageEvent => {
    counter += 1
    return {
      chat: 'group',
      externalMessageId: `M${counter}`,
      from: '',
      fromMe: false,
      groupJid: GROUP,
      mentionedJids: [],
      participant: DRIVER,
      pushName: 'Motorista',
      replyToExternalMessageId: null,
      text: null,
      timestamp: Math.floor(Date.now() / 1000),
      type: 'message',
    }
  }
  const receive = (input: {
    audio?: GroupAudio | null
    media?: GroupMedia | null
    text?: string
  }) =>
    inbound.receive({
      audio: input.audio ?? null,
      companyId: COMPANY_ID,
      connection: async () => CONNECTION,
      event: { ...base(), text: input.text ?? null },
      media: input.media ?? null,
      senderLid: null,
    })
  return { bot, receive, request, sent, spies }
}

const INPUTS = ['1', '2', 'pular', 'cancelar', 'texto livre qualquer'] as const
const OWNED: Record<Owner, keyof Spies | undefined> = {
  canhoto: 'canhoto',
  close: 'close',
  delivery: 'delivery',
  occurrence: 'occurrence',
  route: undefined,
  stop: undefined,
}

function expectOnlyOwner(spies: Spies, owner: Owner): void {
  for (const name of ['canhoto', 'close', 'delivery', 'occurrence'] as const) {
    if (OWNED[owner] !== name) expect(spies[name]).toEqual([])
  }
}

describe('caminho completo do grupo: só o dono da pergunta trata a resposta', () => {
  for (const pending of PENDING) {
    for (const input of INPUTS) {
      test(`${pending.step} esperando: "${input}" digitado é só do fluxo ${pending.owner}`, async () => {
        const { receive, spies } = setup(pending)
        await receive({ text: input })
        expectOnlyOwner(spies, pending.owner)
        if (pending.owner !== 'stop' && pending.owner !== 'route')
          expect(spies.stopRecords).toEqual([])
      })
    }

    test(`${pending.step} esperando: a transcrição de áudio confirmada ("1") é só do fluxo ${pending.owner}`, async () => {
      const { bot, receive, spies } = setup(pending)
      await receive({ audio: VOICE })
      await bot.idle()
      await receive({ text: '1' })
      expectOnlyOwner(spies, pending.owner)
      if (pending.owner !== 'stop' && pending.owner !== 'route')
        expect(spies.stopRecords).toEqual([])
    })

    test(`${pending.step} esperando: a localização compartilhada só avança quem a pediu`, async () => {
      const { receive, request, spies } = setup(pending)
      await receive({ media: LOCATION })
      const asksLocation =
        pending.step === 'stop.location' || pending.step === GROUP_OCCURRENCE_STEP.location
      if (pending.step === 'stop.location') expect(spies.stopRecords).toHaveLength(1)
      if (pending.step !== 'stop.location') expect(spies.stopRecords).toEqual([])
      if (pending.step === GROUP_OCCURRENCE_STEP.location) {
        expect(spies.occurrence).toEqual(['location'])
        expect(spies.canhoto).toEqual([])
      }
      if (!asksLocation) {
        // Ninguém pediu: o pedido não muda de passo e a localização vai ao canhoto/ao ponto lembrado.
        expect(request.step).toBe(pending.step)
        expect(spies.occurrence).toEqual([])
        expect(spies.close).toEqual([])
        expect(spies.delivery).toEqual([])
        expect(spies.canhoto).toEqual(['location'])
      }
    })
  }

  test('"iniciar rota": escolher a parada e mandar a localização registra a saída, sem tocar a ocorrência', async () => {
    const { receive, request, sent, spies } = setup({
      state: {
        event: 'depart',
        stops: [...ONE_STOP, { ...ONE_STOP[0], id: 'S2', numbers: ['2'] }],
      },
      step: 'stop.choose',
    })
    await receive({ text: '1' })
    expect(request.step).toBe('stop.location')
    await receive({ media: LOCATION })
    expect(spies.stopRecords).toMatchObject([{ event: 'depart', stopId: 'S1' }])
    expect(spies.occurrence).toEqual([])
    expect(sent.some((text) => text.includes('Vou registrar'))).toBe(false)
  })

  test('canhoto esperando a foto: "1", "2" e a localização não tocam outro fluxo', async () => {
    const { receive, spies } = setup({ state: {}, step: 'bogus.idle' })
    await receive({ media: LOCATION })
    expect(spies.canhoto).toEqual(['location'])
    expect(spies.occurrence).toEqual([])
    expect(spies.stopRecords).toEqual([])
  })
})
