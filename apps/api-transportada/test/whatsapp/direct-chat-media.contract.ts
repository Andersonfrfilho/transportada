/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 308 T3 (RF3): a localização, o áudio e a resposta "1"/"2" (digitada ou falada) no chat direto
 * seguem o caminho do grupo, ponta a ponta pelas peças reais: a porta do webhook (`receiveDirect`), a
 * sessão do pedido, o fluxo do motorista (saí/cheguei com o passo da localização), a entrada da
 * foto/localização (293 T15), o áudio com confirmação (292 T9) e o envio da resposta. Só o banco, o
 * transcritor e o Evolution são dublês.
 */
import { describe, expect, test } from 'bun:test'

import type { ApiLogger } from '../../src/shared/api.types.js'
import {
  createEvolutionGroupInbound,
  createGroupQuestionAskedHandler,
  directChatJid,
  type EvolutionMessageEvent,
  type GroupAudio,
  type GroupAudioContext,
  type GroupMedia,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import type { EvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import { createGroupProofIntake } from '../../src/whatsapp/application/whatsapp-group-proof-intake.service.js'
import type {
  GroupRequest,
  GroupRequestRepositoryPort,
} from '../../src/whatsapp/application/whatsapp-group-request.port.js'
import { createWhatsAppGroupRequestSessions } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import {
  createGroupStopFlow,
  type GroupStopFlowPorts,
} from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import type { WhatsAppDeliveryPreparations } from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { LOCATION_PROMPT_TEXT } from '../../src/whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000308'
const DRIVER_ID = '00000000-0000-4000-8000-0000000003d1'
const DRIVER = '5516988887777'
const DIRECT = directChatJid(DRIVER)
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }
const VOICE: GroupAudio = { mimeType: 'audio/ogg', quotedParticipant: null, seconds: 4 }
const POINT: GroupMedia = { kind: 'location', latitude: -21.17, longitude: -47.81 }

const silent = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger

type Stored = GroupRequest & { status: string }

/** O pedido em memória: um aberto por conversa (aqui, o `…@s.whatsapp.net` do motorista). */
function memoryRepository(): GroupRequestRepositoryPort & { readonly requests: Stored[] } {
  const requests: Stored[] = []
  const claimed = new Set<string>()
  const openOf = (groupJid: string) =>
    requests.find((item) => item.groupJid === groupJid && item.status === 'open')
  return {
    async claimMessage({ providerMessageId }) {
      if (claimed.has(providerMessageId)) return false
      claimed.add(providerMessageId)
      return true
    },
    async findOpen({ groupJid }) {
      const open = openOf(groupJid)
      return open === undefined ? null : { ...open }
    },
    async linkMessage() {},
    async open({ driverId, groupJid, now, ownerNumber, step }) {
      if (openOf(groupJid) !== undefined) return null
      const request: Stored = {
        attempts: 0,
        companyId: COMPANY_ID,
        driverId,
        expiresAt: new Date(now.getTime() + 600_000),
        groupJid,
        id: `R${requests.length + 1}`,
        ownerNumber,
        state: {},
        status: 'open',
        step,
        version: 1n,
      }
      requests.push(request)
      return { ...request }
    },
    requests,
    async update({ attempts, close, id, state, step, version }) {
      const request = requests.find((item) => item.id === id)
      if (request === undefined || request.status !== 'open' || request.version !== version) {
        return false
      }
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
}

function setup() {
  const now = new Date('2026-11-08T15:00:00.000Z')
  /** O que o whisper "ouve", na ordem dos áudios. */
  const heard: string[] = []
  const sent: { body: string; mentionNumber?: string; number: string }[] = []
  const recorded: Parameters<GroupStopFlowPorts['record']>[0][] = []
  let remembered = false

  const replies = createEvolutionGroupReplySender({
    logger: silent,
    async sendText({ body, mentionNumber, number }) {
      sent.push({ body, number, ...(mentionNumber === undefined ? {} : { mentionNumber }) })
    },
  })
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger: silent,
    transcriber: {
      transcribe: async () => heard.shift() ?? '',
    },
  })
  const repository = memoryRepository()
  const sessions = createWhatsAppGroupRequestSessions({
    clock: () => now,
    flow: createGroupDriverFlow({
      occurrence: {
        answer: async () => ({ kind: 'done', replies: ['ocorrência'] }),
        initialStep: 'document',
        start: async () => ({ kind: 'done', replies: ['ocorrência'] }),
      },
      stop: createGroupStopFlow({
        clock: () => now,
        enRouteMessage: async () => 'a caminho',
        hasLocation: () => remembered,
        listStops: async () => [
          {
            arrivedAt: null,
            completedAt: null,
            documents: [{ number: '17234', separationStatus: 'loaded' as const }],
            enRouteSince: null,
            id: 'S1',
            isAddressReliable: true,
            sequence: 1,
          },
        ],
        record: async (input) => {
          recorded.push(input)
          remembered = false
          return { message: input.event === 'depart' ? 'Saída registrada.' : 'Chegada registrada.' }
        },
      }),
    }),
    logger: silent,
    onQuestionAsked: createGroupQuestionAskedHandler(bot),
    replies,
    repository,
  })
  const intake = createGroupProofIntake({
    advanceRequest: (request) => sessions.handleLocation(request),
    downloadMedia: async () => {
      throw new Error('localização não baixa nada')
    },
    findActorUserId: async () => 'user-motorista',
    forgetLocation: () => {
      remembered = false
    },
    openAnswerRequest: async () => undefined,
    preparations: {
      hasOpen: async () => false,
      receiveLocation: async () => null,
    } as unknown as WhatsAppDeliveryPreparations,
    rememberLocation: () => {
      remembered = true
    },
    replies,
    withoutAccessText: async () => 'sem acesso',
  })
  const identity = {
    async botNumber() {
      throw new Error('o 1:1 não pergunta o número do bot')
    },
    async lidDirectory() {
      throw new Error('o 1:1 não tem participantes de grupo')
    },
  } as unknown as EvolutionGroupIdentity
  const inbound = createEvolutionGroupInbound({
    audio: {
      bot,
      download: async () => ({
        data: Buffer.from('opus').toString('base64'),
        mimeType: 'audio/ogg',
      }),
      reply: (reply) => replies.send(reply),
      wakePhrase: ['atendimento', 'fernandes'],
    },
    async findDirectDriver({ phone }) {
      return phone === DRIVER ? { driverId: DRIVER_ID } : null
    },
    async findGroupDriver() {
      throw new Error('o 1:1 não consulta a ficha do grupo')
    },
    findOpenRequestOwner: (lookup) => sessions.findOpenOwner(lookup),
    handle: (message) => sessions.handle(message),
    handleMedia: (media) => intake.handle(media),
    async isGroupDriver() {
      throw new Error('no 1:1 o motorista já foi achado pelo telefone')
    },
    advanceRequestLocation: (request) => sessions.handleLocation(request),
    identity,
  })

  let sequence = 0
  const event = (text: null | string): EvolutionMessageEvent => {
    sequence += 1
    return {
      chat: 'user',
      externalMessageId: `D${sequence}`,
      from: DRIVER,
      fromMe: false,
      groupJid: null,
      mentionedJids: [],
      participant: '',
      pushName: 'Motorista',
      replyToExternalMessageId: null,
      text,
      timestamp: Math.floor(now.getTime() / 1000),
      type: 'message',
    }
  }
  const receive = async (
    text: null | string,
    extra: { audio?: GroupAudio; media?: GroupMedia } = {},
  ) => {
    const outcome = await inbound.receiveDirect!({
      companyId: COMPANY_ID,
      connection: async () => CONNECTION,
      driverId: DRIVER_ID,
      event: event(text),
      ...extra,
    })
    await bot.idle()
    await replies.idle()
    return outcome
  }
  /** O que o bot mandou desde a última leitura: tudo no 1:1 do motorista e sem `@número`. */
  const said = () => {
    const batch = sent.splice(0)
    for (const item of batch) {
      expect(item.number).toBe(DIRECT)
      expect(item.mentionNumber).toBeUndefined()
      expect(item.body.startsWith('@')).toBe(false)
    }
    return batch.map((item) => item.body)
  }
  return { heard, receive, recorded, repository, said }
}

describe('spec 308 T3: o passo da localização no chat direto', () => {
  test('"saí" pede a localização e a localização compartilhada no 1:1 registra a saída', async () => {
    const t = setup()

    expect(await t.receive('saí')).toBe('admitted')
    expect(t.said().join('\n')).toContain(LOCATION_PROMPT_TEXT.ask)
    expect(t.repository.requests).toMatchObject([{ groupJid: DIRECT, step: 'stop.location' }])

    expect(await t.receive(null, { media: POINT })).toBe('media')
    expect(t.recorded).toMatchObject([
      {
        documentNumber: '17234',
        event: 'depart',
        location: { latitude: -21.17, longitude: -47.81 },
        stopId: 'S1',
      },
    ])
    expect(t.said().join('\n')).toContain('Saída registrada.')
    expect(t.repository.requests[0]?.status).not.toBe('open')
  })

  test('"pular" digitado no 1:1 registra sem o ponto', async () => {
    const t = setup()
    await t.receive('cheguei')
    t.said()

    await t.receive('pular')

    expect(t.recorded).toMatchObject([{ event: 'arrive', stopId: 'S1' }])
    expect(t.recorded[0]?.location).toBeUndefined()
  })

  test('"pular" falado com o pedido aberto vai direto ao passo, sem pedir confirmação', async () => {
    const t = setup()
    await t.receive('saí')
    t.said()

    t.heard.push('Pular.')
    expect(await t.receive(null, { audio: VOICE })).toBe('audio')

    expect(t.recorded).toMatchObject([{ event: 'depart', stopId: 'S1' }])
    expect(t.said().join('\n')).toContain('Saída registrada.')
  })

  test('localização que ninguém pediu avisa no 1:1 e não registra nada', async () => {
    const t = setup()

    expect(await t.receive(null, { media: POINT })).toBe('media')

    expect(t.recorded).toEqual([])
    expect(t.said()).toEqual([
      '📍 *Recebi a localização.* Nenhuma pergunta minha está esperando por ela.\n➡️ _Próximo passo:_ quando eu pedir, mande de novo.',
    ])
  })
})

describe('spec 308 T3: o áudio no chat direto pede confirmação e aceita "1"/"2"', () => {
  test('áudio sem frase de chamada vira "Entendi assim" e o "1" digitado segue o fluxo', async () => {
    const t = setup()

    t.heard.push('cheguei')
    expect(await t.receive(null, { audio: VOICE })).toBe('audio')
    const confirmation = t.said().join('\n')
    expect(confirmation).toContain('cheguei')
    expect(confirmation).toContain('1')
    expect(t.repository.requests).toEqual([])

    expect(await t.receive('1')).toBe('admitted')
    expect(t.said().join('\n')).toContain(LOCATION_PROMPT_TEXT.ask)
    expect(t.repository.requests).toMatchObject([{ groupJid: DIRECT, ownerNumber: DRIVER }])
  })

  test('o "sim" falado confirma como o "1"', async () => {
    const t = setup()
    t.heard.push('saí')
    await t.receive(null, { audio: VOICE })
    t.said()

    t.heard.push('Sim.')
    expect(await t.receive(null, { audio: VOICE })).toBe('audio_answer')

    expect(t.said().join('\n')).toContain(LOCATION_PROMPT_TEXT.ask)
    expect(t.repository.requests).toMatchObject([{ step: 'stop.location' }])
  })

  test('o "não" falado (ou o "2") descarta o texto e nada é registrado', async () => {
    const spoken = setup()
    spoken.heard.push('saí')
    await spoken.receive(null, { audio: VOICE })
    spoken.said()
    spoken.heard.push('não')
    await spoken.receive(null, { audio: VOICE })
    expect(spoken.repository.requests).toEqual([])
    expect(spoken.said()).toHaveLength(1)

    const typed = setup()
    typed.heard.push('saí')
    await typed.receive(null, { audio: VOICE })
    typed.said()
    expect(await typed.receive('2')).toBe('admitted')
    expect(typed.repository.requests).toEqual([])
    expect(typed.recorded).toEqual([])
  })
})
