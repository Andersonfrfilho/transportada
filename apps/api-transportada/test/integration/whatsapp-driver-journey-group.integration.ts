/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A jornada inteira do motorista no **grupo** do WhatsApp, pelo caminho real de entrada: evento do Evolution →
 * `createEvolutionGroupInbound` → sessão do pedido (Postgres) → roteador dos fluxos → registro pelas MESMAS funções do
 * app (`reportStopDeparture`, `reportStopArrival`, `reportDocumentDelivery`, `reportDocumentReturn`) → Postgres. Três
 * paradas, do "iniciar rota" ao "rota concluída", passando por localização e "pular", "cheguei" repetido, "saí" sem
 * baixa, a oferta da próxima rota (1 e 2), fora de ordem, "não entreguei", "cancelar", nota já baixada e áudio.
 * Confere o texto exato de cada resposta, a marcação do WhatsApp e os eventos gravados.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import type { RouteGeometryPort } from '../../src/trips/application/route-geometry.port.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDeliveryProofRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import {
  CATALOG_BOT_SPEECH,
  renderBotSpeechLine,
} from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { createWhatsAppDeliveryPreparations } from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import { describeWhatsAppDriverEventResult } from '../../src/whatsapp-commands/application/whatsapp-driver-event-speech.service.js'
import {
  deliverWhatsAppDriverDocument,
  type WhatsAppDriverEventPorts,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import { createInMemoryWhatsAppSharedLocationStore } from '../../src/whatsapp-commands/application/whatsapp-shared-location.service.js'
import { createDrizzleWhatsAppDeliveryPreparationRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-delivery-preparation.repository.js'
import { createWhatsAppStopCardReader } from '../../src/whatsapp-commands/infrastructure/whatsapp-stop-card.reader.js'
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
import { createGroupDeliveryFlow } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import {
  createGroupDriverFlow,
  GROUP_DRIVER_STEP,
} from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import { GROUP_DELIVERY_STEP } from '../../src/whatsapp/application/whatsapp-group-delivery-flow.service.js'
import { createGroupProofIntake } from '../../src/whatsapp/application/whatsapp-group-proof-intake.service.js'
import { createWhatsAppGroupRequestSessions } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import { createGroupReturnFlow } from '../../src/whatsapp/application/whatsapp-group-return-flow.service.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { createDrizzleWhatsAppGroupRequestRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-group-request.repository.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'
import { createGroupDeliveryWiring } from '../../src/whatsapp/infrastructure/whatsapp-group-delivery.adapter.js'
import { createGroupReturnPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-return.adapter.js'
import { createGroupStopPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-stop.adapter.js'
import { botFarewell, botGreeting } from '../../src/whatsapp/domain/bot-greeting.policy.js'
import { formatBotClock } from '../../src/whatsapp-commands/domain/whatsapp-stop-card.policy.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'
import { groupJourneyExpected } from '../fixtures/driver-journey-group.expected.js'
import {
  expectBalancedMarkup,
  formatJourneyTranscript,
  readJourneyEvents,
  seedJourneyTrip,
  type JourneyDatabase,
  type JourneyLine,
  type JourneyWorld,
} from '../fixtures/driver-journey.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const GROUP = '120363025246125486@g.us'
const BOT = '5516900000001'
const DRIVER_PHONE = '5516988887777'
const CONNECTION = { apiKey: 'chave', baseUrl: 'https://evolution.exemplo.com', instanceName: 'x' }
const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
/** A estrada do OSRM, fixa: 12,3 km e 25 min. */
const ROAD: RouteGeometryPort = {
  readRouteGeometry: async () => ({
    legs: [{ distanceMetres: 12_300, durationSeconds: 1500 }],
    nodeIds: null,
    nodeIdsByLeg: null,
    points: [],
  }),
}

export type GroupJourneyHarness = Awaited<ReturnType<typeof buildGroupJourney>>

async function buildGroupJourney(db: JourneyDatabase, world: JourneyWorld, now: Date) {
  const clock = () => now
  const trips = new DrizzleCurrentDriverTripRepository(db)
  const listActiveTrips = (input: { readonly companyId: string; readonly driverId: string }) =>
    trips.listActiveTrips(input)
  const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(db, 'test-bucket')
  const proofs = new DrizzleDeliveryProofRepository(db, 'test-bucket')
  const ports = {
    registerOccurrence: () => Promise.reject(new Error('a jornada não abre ocorrência')),
    reportArrival: (input) =>
      reportStopArrival({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        now: new Date(),
        unitOfWork,
      }),
    reportDelivery: (input) =>
      reportDocumentDelivery({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        now: new Date(),
        resolveProofSettings: (settings) => proofs.resolveProofFieldSettings(settings),
        unitOfWork,
      }),
    reportDeparture: (input) =>
      reportStopDeparture({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        now: new Date(),
        unitOfWork,
      }),
    reportReturn: (input) =>
      reportDocumentReturn({
        ...input,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        now: new Date(),
        unitOfWork,
      }),
  } satisfies WhatsAppDriverEventPorts
  const locations = createInMemoryWhatsAppSharedLocationStore({ clock: () => new Date() })
  const keyOf = (input: { readonly companyId: string; readonly driverId: string }) => ({
    companyId: input.companyId,
    whatsappNumber: `group-driver:${input.driverId}`,
  })
  const crew = async () => ({ kind: 'crew' as const })
  const stopCards = createWhatsAppStopCardReader({
    database: db,
    listActiveTrips,
    logger,
    routing: ROAD,
  })
  const preparations = createWhatsAppDeliveryPreparations({
    attachProof: async () => {
      throw new Error('a jornada não manda foto')
    },
    deliver: (input) => deliverWhatsAppDriverDocument(ports, input),
    describeResult: ({ channel, companyId, documentNumber, result }) =>
      renderBotSpeechLine({
        companyId,
        line: describeWhatsAppDriverEventResult(result, {
          documentNumber,
          kind: channel === 'group' ? 'group' : 'driver',
        }),
        speech: CATALOG_BOT_SPEECH,
      }),
    logger,
    media: { read: async () => new Uint8Array(), write: async () => 'key' } as never,
    repository: createDrizzleWhatsAppDeliveryPreparationRepository(db),
    resolveSettings: (query) => proofs.resolveProofFieldSettings(query),
  })
  const delivery = createGroupDeliveryWiring({
    consumeLocation: (input) => locations.consume(keyOf(input)),
    database: db,
    deliverAsAttendant: async () => {
      throw new Error('sem atendente na jornada')
    },
    forgetLocation: (key) => void locations.consume(keyOf(key)),
    listActiveTrips,
    logger,
    preparations,
    rememberLocation: ({ location, ...key }) => locations.remember({ ...keyOf(key), location }),
    resolveSenderRole: crew,
    stopCards,
  })
  const occurrenceCalls: string[] = []
  const flow = createGroupDriverFlow({
    delivery: createGroupDeliveryFlow(delivery.flow),
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['(fluxo de ocorrência)'] }),
      initialStep: 'document',
      start: async (turn) => {
        occurrenceCalls.push(turn.text)
        return { kind: 'done', replies: [`(fluxo de ocorrência da NF ${turn.text})`] }
      },
    },
    return: createGroupReturnFlow(
      createGroupReturnPorts({
        consumeLocation: (input) => locations.consume(keyOf(input)),
        database: db,
        listActiveTrips,
        logger,
        ports,
        resolveSenderRole: crew,
      }),
    ),
    stop: createGroupStopFlow(
      createGroupStopPorts({
        clock,
        consumeLocation: (input) => locations.consume(keyOf(input)),
        database: db,
        hasLocation: (input) => locations.has(keyOf(input)),
        listActiveTrips,
        logger,
        ports,
        resolveSenderRole: crew,
        stopCards,
      }),
    ),
  })
  // O remetente de verdade do grupo: cada texto é UMA mensagem do Evolution, e em produção o espaçador de envio (por
  // instância) segura a seguinte — a pergunta mandada em mensagem separada chegava depois da resposta do motorista.
  const sent: string[] = []
  const replies = createEvolutionGroupReplySender({
    logger,
    sendText: async ({ body }) => void sent.push(body),
  })
  const requests = createDrizzleWhatsAppGroupRequestRepository(db)
  const bot = createWhatsAppBotAudio<GroupAudioContext>({
    logger,
    transcriber: { transcribe: async () => transcription.next },
  })
  const transcription = { next: '' }
  const sessions = createWhatsAppGroupRequestSessions({
    clock,
    flow,
    logger,
    onQuestionAsked: createGroupQuestionAskedHandler(bot),
    onRequestClosed: (key) => delivery.intake.forgetLocation(key),
    replies,
    repository: requests,
  })
  const intake = createGroupProofIntake({
    ...delivery.intake,
    advanceRequest: (request) => sessions.handleLocation(request),
    openAnswerRequest: async (request) => {
      await requests.open({
        ...request,
        now: clock(),
        step: `${GROUP_DRIVER_STEP.deliveryPrefix}${GROUP_DELIVERY_STEP.answer}`,
      })
    },
    replies,
  })
  const inbound = createEvolutionGroupInbound({
    advanceRequestLocation: (request) => sessions.handleLocation(request),
    audio: {
      bot,
      download: async () => ({
        data: Buffer.from('opus').toString('base64'),
        mimeType: 'audio/ogg',
      }),
      reply: (reply) => replies.send(reply),
    },
    findGroupDriver: async () => ({ driverId: world.driverId }),
    findOpenRequestOwner: (lookup) => sessions.findOpenOwner(lookup),
    handle: (message) => sessions.handle(message),
    handleMedia: (media) => intake.handle(media),
    identity: createEvolutionGroupIdentity({
      gateway: { getOwnerNumber: async () => BOT, listGroupParticipants: async () => [] },
    }),
    isGroupDriver: delivery.isGroupDriver,
    now: () => now.getTime(),
  })

  let counter = 0
  const transcript: JourneyLine[] = []
  async function receive(input: {
    readonly audio?: GroupAudio
    readonly media?: GroupMedia
    readonly shown: string
    readonly text?: string
  }): Promise<readonly string[]> {
    counter += 1
    const before = sent.length
    const text = input.text ?? null
    const mentions = text?.startsWith('@bot') === true
    const event: EvolutionMessageEvent = {
      chat: 'group',
      externalMessageId: `journey-${counter}`,
      from: '',
      fromMe: false,
      groupJid: GROUP,
      mentionedJids: mentions ? [`${BOT}@s.whatsapp.net`] : [],
      participant: DRIVER_PHONE,
      pushName: 'Anderson Motorista',
      replyToExternalMessageId: null,
      text: mentions && text !== null ? `@${BOT}${text.slice('@bot'.length)}` : text,
      timestamp: Math.floor(now.getTime() / 1000),
      type: 'message',
    }
    await inbound.receive({
      audio: input.audio ?? null,
      companyId: world.companyId,
      connection: async () => CONNECTION,
      event,
      media: input.media ?? null,
      senderLid: null,
    })
    await bot.idle()
    await replies.idle()
    const answered = sent.slice(before)
    transcript.push({ from: 'motorista', text: input.shown })
    for (const reply of answered) transcript.push({ from: 'bot', text: reply })
    return answered
  }
  return { occurrenceCalls, receive, transcript, transcription }
}

describe('jornada do motorista no grupo do WhatsApp (caminho real, Postgres)', () => {
  testWithPostgres(
    'três paradas do "iniciar rota" ao "rota concluída", com o texto exato de cada resposta',
    async () => {
      if (databaseUrl === undefined) return
      await withDisposableDatabase({
        adminUrl: databaseUrl,
        migrate: (connection) => runAllDatabaseMigrations({ connectionString: connection }),
        namePrefix: 'transportada_driver_journey_group',
        open: (connection) => createDrizzleProvider({ connection }),
        operation: async (database) => {
          const db = database.db
          const world = await seedJourneyTrip(db, { driverPhone: '16988887777' })
          await db.insert(companyDeliveryProofSettings).values({
            companyId: world.companyId,
            photo: 'optional',
            receivedBy: 'off',
            receiverDocument: 'off',
            receiverName: 'off',
            signature: 'off',
          })
          const now = await startOfQuietMinute()
          const journey = await buildGroupJourney(db, world, now)
          const recording = process.env.JOURNEY_RECORD === '1'
          const expected = groupJourneyExpected({
            at: formatBotClock(now),
            eta: formatBotClock(new Date(now.getTime() + 1500 * 1000)),
            farewell: botFarewell(now),
            greeting: botGreeting(now, 'Anderson Motorista'),
          })
          const recorded: unknown[] = []
          for (const [index, step] of groupJourneySteps(world).entries()) {
            if (step.transcription !== undefined) journey.transcription.next = step.transcription
            const answered = await journey.receive(step.send)
            if (recording) recorded.push({ answered, shown: step.send.shown })
            else
              expect({ answered, shown: step.send.shown }).toEqual(
                expected[index] ?? { answered: [], shown: '(passo a mais)' },
              )
          }
          if (recording) console.log(JSON.stringify(recorded, null, 2))
          if (recording) console.log(await readJourneyEvents(db, world))
          expect(expectBalancedMarkup(journey.transcript)).toEqual([])
          expect(journey.occurrenceCalls).toEqual(['17236'])
          expect(await readJourneyEvents(db, world)).toEqual([
            'parada 1: departed 📍',
            'parada 1: arrived 📍',
            'parada 1: delivered',
            'parada 3: departed',
            'parada 3: arrived',
            'parada 3: returned',
            'parada 2: departed 📍',
            'parada 2: arrived',
            'parada 2: delivered',
          ])
          if (process.env.JOURNEY_TRANSCRIPT === '1') {
            console.log(formatJourneyTranscript(journey.transcript))
          }
        },
      })
    },
    120_000,
  )
})

describe('"@bot entreguei" sem número segue a entrega em andamento (defeito de staging, NF 899840)', () => {
  testWithPostgres(
    'chegou → menu 1 → localização → foto pedida → pedido vence → "@bot entreguei" retoma a NF da parada',
    async () => {
      if (databaseUrl === undefined) return
      await withDisposableDatabase({
        adminUrl: databaseUrl,
        migrate: (connection) => runAllDatabaseMigrations({ connectionString: connection }),
        namePrefix: 'transportada_driver_journey_group_resume',
        open: (connection) => createDrizzleProvider({ connection }),
        operation: async (database) => {
          const db = database.db
          const world = await seedJourneyTrip(db, { driverPhone: '16988887777' })
          await db.insert(companyDeliveryProofSettings).values({
            companyId: world.companyId,
            photo: 'required',
            receivedBy: 'off',
            receiverDocument: 'off',
            receiverName: 'off',
            signature: 'off',
          })
          const now = await startOfQuietMinute()
          const journey = await buildGroupJourney(db, world, now)
          const greeting = botGreeting(now, 'Anderson Motorista')
          const at = formatBotClock(now)
          const steps = resumeJourneySteps({ at, greeting })
          const recording = process.env.JOURNEY_RECORD === '1'
          for (const step of steps) {
            if (step.expireRequest === true) {
              // O tempo passou: o pedido do grupo venceu com a foto ainda pedida.
              await db.execute(
                sql`update whatsapp_group_requests set expires_at = ${new Date(now.getTime() - 60_000)} where status = 'open'`,
              )
            }
            const answered = await journey.receive(step.send)
            if (recording) console.log(JSON.stringify({ answered, shown: step.send.shown }))
            else expect({ answered, shown: step.send.shown }).toEqual(step.expected)
          }
          expect(expectBalancedMarkup(journey.transcript)).toEqual([])
          expect(await readJourneyEvents(db, world)).toEqual([
            'parada 1: departed',
            'parada 1: arrived',
          ])
        },
      })
    },
    120_000,
  )
})

const STOP_1_CARD = [
  '*Parada 1 de 3*',
  '*NF 17234* · R$ 1.234,56',
  '🏪 *PADARIA SOL NASCENTE*',
  '🏢 Contratante: Distribuidora Aurora',
  '📍 RUA DAS FLORES, 100, RIBEIRAO PRETO, SP',
  '🗺️ https://www.google.com/maps/search/?api=1&query=-21.1700000,-47.8100000',
]

function resumeJourneySteps(input: { readonly at: string; readonly greeting: string }): readonly {
  readonly expected: { readonly answered: readonly string[]; readonly shown: string }
  readonly expireRequest?: true
  readonly send: { readonly media?: GroupMedia; readonly shown: string; readonly text?: string }
}[] {
  const { at, greeting } = input
  const text = (value: string) => ({ shown: value, text: value })
  const cancelled =
    'Pedido cancelado, não registrei nada.\n➡️ _Próximo passo:_ quando quiser, marque o bot de novo.'
  return [
    {
      // Nada em andamento: a lista da viagem inteira, como antes.
      expected: {
        answered: [
          `${greeting}\n\nQual nota você entregou? Responda com o número da nota:\n1. NF 17234 · PADARIA SOL NASCENTE\n2. NF 17235 · MERCADO LUA CHEIA\n3. NF 17236 · ACOUGUE ESTRELA`,
        ],
        shown: '@bot entreguei',
      },
      send: text('@bot entreguei'),
    },
    {
      // "cancelar" com a lista aberta fecha o pedido (antes: "não achei essa nota na lista").
      expected: { answered: [cancelled], shown: '@bot cancelar' },
      send: text('@bot cancelar'),
    },
    {
      expected: {
        answered: [
          `${greeting}\n\n*Qual parada?* _Responda com o número da opção ou da nota:_\n*1* - NF 17234 · PADARIA SOL NASCENTE\n*2* - NF 17235 · MERCADO LUA CHEIA\n*3* - NF 17236 · ACOUGUE ESTRELA`,
        ],
        shown: '@bot iniciar rota',
      },
      send: text('@bot iniciar rota'),
    },
    {
      expected: {
        answered: ['📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_'],
        shown: '1',
      },
      send: text('1'),
    },
    {
      expected: {
        answered: [
          [
            '*Saída registrada* 🚚',
            ...STOP_1_CARD,
            '📦 3 volumes',
            '➡️ _Próximo passo:_ quando chegar, mande *cheguei*.',
          ].join('\n'),
        ],
        shown: 'pular',
      },
      send: text('pular'),
    },
    {
      expected: {
        answered: [`${greeting}\n\n📍 *Mande sua localização* pelo clipe 📎 _ou responda pular_`],
        shown: '@bot cheguei',
      },
      send: text('@bot cheguei'),
    },
    {
      expected: {
        answered: [
          [
            '*Chegada registrada* 📍',
            ...STOP_1_CARD,
            '📦 3 volumes para entregar',
            '➡️ _Próximo passo:_ depois da entrega, mande a foto do canhoto, ou *não entreguei*.',
            '🔜 _Depois desta:_ *NF 17235* · MERCADO LUA CHEIA – SERTAOZINHO',
          ].join('\n'),
        ],
        shown: 'pular',
      },
      send: text('pular'),
    },
    {
      expected: {
        answered: [
          [
            `${greeting}`,
            '',
            `⚠️ *A chegada nesta parada já foi registrada* às ${at}.`,
            ...STOP_1_CARD,
            '📦 3 volumes',
            '',
            '*O que você quer fazer agora?*',
            '*1* - Entreguei _(mande a foto do canhoto)_',
            '*2* - Não entreguei',
            '*3* - Abrir ocorrência',
            '*4* - Nada por enquanto',
          ].join('\n'),
        ],
        shown: '@bot cheguei',
      },
      send: text('@bot cheguei'),
    },
    {
      expected: {
        answered: [
          '⚠️ *NF 17234 ainda não fechou.* Falta: foto do canhoto.',
          '📍 *NF 17234:* se puder, compartilhe a localização da entrega (clipe 📎 → Localização). _Se não tiver, responda pular._',
        ],
        shown: '1',
      },
      send: text('1'),
    },
    {
      expected: {
        answered: ['Localização recebida.', '📸 *NF 17234:* mande a foto do canhoto assinado.'],
        shown: '📍 (localização)',
      },
      send: { media: LOCATION_S1, shown: '📍 (localização)' },
    },
    {
      // O pedido venceu com a foto pedida: "entreguei" retoma a NF da parada, nunca lista as outras.
      expected: {
        answered: [
          // UMA mensagem: o aviso e a pergunta pendente (o defeito de staging mandava a pergunta só no turno seguinte).
          `${greeting}\n\n↩️ *Continuando a entrega da NF 17234.*\n📸 *NF 17234:* mande a foto do canhoto assinado.`,
        ],
        shown: '@bot entreguei',
      },
      expireRequest: true,
      send: text('@bot entreguei'),
    },
  ]
}

const LOCATION_S1: GroupMedia = { kind: 'location', latitude: -21.165, longitude: -47.805 }
const LOCATION_S2: GroupMedia = { kind: 'location', latitude: -21.141, longitude: -47.989 }
const VOICE: GroupAudio = {
  mimeType: 'audio/ogg',
  quotedParticipant: `${BOT}@s.whatsapp.net`,
  seconds: 3,
}

type JourneyStep = {
  readonly send: {
    readonly audio?: GroupAudio
    readonly media?: GroupMedia
    readonly shown: string
    readonly text?: string
  }
  readonly transcription?: string
}

function groupJourneySteps(world: JourneyWorld): readonly JourneyStep[] {
  void world
  const text = (value: string, transcription?: string): JourneyStep => ({
    send: { shown: value, text: value },
    ...(transcription === undefined ? {} : { transcription }),
  })
  const location = (media: GroupMedia): JourneyStep => ({
    send: { media, shown: '📍 (localização)' },
  })
  return [
    text('@bot iniciar rota'),
    text('1'),
    location(LOCATION_S1),
    text('@bot cheguei'),
    location(LOCATION_S1),
    {
      send: { audio: VOICE, shown: '🎤 (áudio: "cheguei")' },
      transcription: 'cheguei',
    },
    text('1'),
    // Comando digitado com o menu aberto segue como comando (revisão do #552).
    text('saí'),
    text('4'),
    text('@bot saí'),
    text('1'),
    text('pular'),
    text('pular'),
    text('1'),
    text('cancelar'),
    text('@bot entreguei 17234'),
    text('2'),
    text('2'),
    text('pular'),
    text('1'),
    text('@bot cheguei'),
    text('pular'),
    text('@bot cheguei'),
    text('3'),
    text('@bot cheguei'),
    text('não entreguei 17236'),
    text('2'),
    text('saí'),
    location(LOCATION_S2),
    text('@bot saí'),
    text('1'),
    text('pular'),
    text('@bot entreguei 17235'),
    text('pular'),
    text('pular'),
    text('1'),
  ]
}

/** As horas da resposta ("às 14:35") saem do relógio do servidor: a jornada começa longe da virada do minuto. */
async function startOfQuietMinute(): Promise<Date> {
  const seconds = new Date().getSeconds()
  if (seconds > 40) await Bun.sleep((61 - seconds) * 1000)
  return new Date()
}
