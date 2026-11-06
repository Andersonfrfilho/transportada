/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A jornada inteira do motorista na **conversa individual** (Meta), pelo caminho real de entrada: webhook assinado →
 * módulo do WhatsApp → despachante dos comandos → fluxo publicado e pedidos tipados → registro pelas MESMAS funções do
 * app → Postgres. As mesmas três paradas da jornada do grupo, com "iniciar rota", localização e "pular", "cheguei"
 * repetido, áudio, a oferta da próxima rota (1 e 2), fora de ordem, "saí" sem baixa, "não entreguei" e "rota
 * concluída". Confere o texto exato de cada resposta, a marcação do WhatsApp e os eventos gravados.
 */
import { createHmac } from 'node:crypto'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'

import { companyDeliveryProofSettings } from '../../src/database/company-delivery-proof-settings.schema.js'
import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
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
import { createDriverWhatsAppFlowActions } from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
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
import { createWhatsAppDriverPrompts } from '../../src/whatsapp-commands/application/whatsapp-driver-prompts.service.js'
import { createModuleWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import { createInMemoryWhatsAppSharedLocationStore } from '../../src/whatsapp-commands/application/whatsapp-shared-location.service.js'
import { createDrizzleWhatsAppDeliveryPreparationRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-delivery-preparation.repository.js'
import { DrizzleWhatsAppPhoneRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'
import { createWhatsAppCommandHookFactory } from '../../src/whatsapp-commands/infrastructure/whatsapp-command-hook.factory.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'
import { createDrizzleWhatsAppFlowGraphPublisher } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.js'
import { createWhatsAppStopCardReader } from '../../src/whatsapp-commands/infrastructure/whatsapp-stop-card.reader.js'
import { createMetaWhatsAppModuleResolver } from '../../src/whatsapp/application/meta-whatsapp-module.resolver.js'
import { createWhatsAppBotAudio } from '../../src/whatsapp/application/whatsapp-bot-audio.service.js'
import { createDrizzleWebhookNonceStore } from '../../src/whatsapp/infrastructure/drizzle-webhook-nonce.store.js'
import { createWhatsAppWebhookRoutes } from '../../src/whatsapp/presentation/whatsapp-webhook.routes.js'
import { botFarewell, botGreeting } from '../../src/whatsapp/domain/bot-greeting.policy.js'
import { formatBotClock } from '../../src/whatsapp-commands/domain/whatsapp-stop-card.policy.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'
import { directJourneyExpected } from '../fixtures/driver-journey-direct.expected.js'
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

const APP_SECRET = 'app-secret-journey'
const VERIFY_TOKEN = 'verify-token-journey'
const API_VERSION = 'v21.0'
const PHONE = '5516988887777'
const AUDIO_MEDIA_ID = 'media-audio-journey'
const ENVELOPE = {
  algorithm: 'A256GCM' as const,
  ciphertext: 'cipher',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1 as const,
}
const logger = { debug() {}, error() {}, info() {}, warn() {} } as unknown as ApiLogger
const ROAD: RouteGeometryPort = {
  readRouteGeometry: async () => ({
    legs: [{ distanceMetres: 12_300, durationSeconds: 1500 }],
    nodeIds: null,
    nodeIdsByLeg: null,
    points: [],
  }),
}

type GraphRequest = { readonly body: Record<string, unknown>; readonly path: string }

/** A Graph API falsa: guarda o que o bot mandou e entrega o áudio pedido pelo id. */
function startGraphServer() {
  const requests: GraphRequest[] = []
  const server: ReturnType<typeof Bun.serve> = Bun.serve({
    async fetch(request): Promise<Response> {
      const path = new URL(request.url).pathname
      if (request.method === 'GET' && path.endsWith(AUDIO_MEDIA_ID)) {
        return Response.json({
          id: AUDIO_MEDIA_ID,
          mime_type: 'audio/ogg',
          url: `http://127.0.0.1:${server.port}/download/audio`,
        })
      }
      if (request.method === 'GET') {
        return new Response(Buffer.from('opus'), { headers: { 'content-type': 'audio/ogg' } })
      }
      requests.push({ body: (await request.json()) as Record<string, unknown>, path })
      return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] })
    },
    hostname: '127.0.0.1',
    port: 0,
  })
  return { requests, server }
}

/** O que o motorista vê: o texto, ou a lista/botões com as opções. */
function readSent(body: Record<string, unknown>): string {
  const text = body.text as { readonly body?: string } | undefined
  if (text?.body !== undefined) return text.body
  const interactive = body.interactive as
    | {
        readonly action?: {
          readonly buttons?: readonly { readonly reply: { readonly title: string } }[]
          readonly sections?: readonly { readonly rows: readonly { readonly title: string }[] }[]
        }
        readonly body?: { readonly text: string }
      }
    | undefined
  const options = [
    ...(interactive?.action?.sections ?? []).flatMap((section) =>
      section.rows.map((row) => row.title),
    ),
    ...(interactive?.action?.buttons ?? []).map((button) => button.reply.title),
  ]
  return [interactive?.body?.text ?? '', ...options.map((title) => `[ ${title} ]`)].join('\n')
}

async function buildDirectJourney(
  db: JourneyDatabase,
  world: JourneyWorld,
  graph: ReturnType<typeof startGraphServer>,
  now: Date,
) {
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
  const listStops = async (input: { readonly companyId: string; readonly driverId: string }) =>
    (await listActiveTrips(input)).flatMap((trip) => trip.stops)
  const sharedLocations = createInMemoryWhatsAppSharedLocationStore({ clock: () => new Date() })
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
    listStops,
    logger,
    media: { read: async () => new Uint8Array(), write: async () => 'key' } as never,
    repository: createDrizzleWhatsAppDeliveryPreparationRepository(db),
    resolveSettings: (query) => proofs.resolveProofFieldSettings(query),
  })
  const driverPrompts = createWhatsAppDriverPrompts({
    clock,
    listStops,
    ports,
    sharedLocations,
    speech: CATALOG_BOT_SPEECH,
    stopCards: createWhatsAppStopCardReader({
      database: db,
      listActiveTrips,
      logger,
      routing: ROAD,
    }),
  })
  const flowActions = createDriverWhatsAppFlowActions({
    consumeSharedLocation: (key) => sharedLocations.consume(key),
    deliveryPreparations: preparations,
    driverPrompts,
    findCurrentTrip: (input) =>
      findCurrentDriverTrip({
        ...input,
        now: new Date(),
        repository: trips,
        scores: new DrizzleDriverScoreRepository(db),
      }),
    listOccurrenceTypes: async () => [],
    registerOccurrence: () => Promise.reject(new Error('a jornada não abre ocorrência')),
    reportArrival: ports.reportArrival,
    reportDelivery: ports.reportDelivery,
    reportDeparture: ports.reportDeparture,
    reportReturn: ports.reportReturn,
    resolveDriverId: (input) => trips.findDriverIdByMembership(input),
    speech: CATALOG_BOT_SPEECH,
  })
  const transcription = { next: '' }
  const phoneNumberId = '109876543210987'
  const resolver = createMetaWhatsAppModuleResolver({
    apiVersion: API_VERSION,
    appSecret: APP_SECRET,
    baseUrl: `http://127.0.0.1:${graph.server.port}`,
    buildMessageHook: createWhatsAppCommandHookFactory({
      authorization: new AuthorizationService(),
      botAudio: createWhatsAppBotAudio<null>({
        logger,
        transcriber: { transcribe: async () => transcription.next },
      }),
      clock,
      deliveryProofs: {
        preparations,
        resolveDriver: (input) => trips.findDriverIdByMembership(input),
      },
      driverPrompts,
      flowActions,
      graphs: createModuleWhatsAppFlowGraphProvider({
        repository: new FlowGraphRepository(db as never),
        rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
      }),
      logger,
      // A jornada manda dezenas de mensagens em segundos: o teto por número não é o que se testa aqui.
      rateLimiter: { consume: () => ({ allowed: true }) } as unknown as ReturnType<
        typeof createRateLimiter
      >,
      resolveActor: createResolveWhatsAppActorUseCase({
        memberships: new DrizzleMembershipRepository(db),
        phones: new DrizzleWhatsAppPhoneRepository(db),
        tenantContext: new TenantContextService({
          repository: new DrizzleMembershipRepository(db),
        }),
      }),
      sharedLocations,
    }),
    database: db,
    nonceStore: createDrizzleWebhookNonceStore(db),
    repository: {
      findByPhoneNumberId: async (input) =>
        input.phoneNumberId === phoneNumberId
          ? {
              channelId: `channel-${phoneNumberId}`,
              companyId: world.companyId,
              envelope: ENVELOPE,
              phoneNumberId,
              version: '1',
              wabaId: '',
            }
          : undefined,
    },
    secretService: {
      decrypt: async () => ({ accessToken: 'token' }),
      encrypt: async () => ENVELOPE,
    },
    verifyToken: VERIFY_TOKEN,
  })
  const post = createWhatsAppWebhookRoutes({
    appSecret: APP_SECRET,
    logger,
    resolver,
    verifyToken: VERIFY_TOKEN,
  }).find((route) => route.method === 'POST')
  if (post === undefined) throw new Error('rota do webhook não registrada')

  const transcript: JourneyLine[] = []
  const sentBodies = () =>
    graph.requests.filter((request) => request.path === `/${API_VERSION}/${phoneNumberId}/messages`)

  async function receive(input: {
    readonly message: Record<string, unknown>
    readonly shown: string
  }): Promise<readonly string[]> {
    const before = sentBodies().length
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Anderson Motorista' }, wa_id: PHONE }],
                messages: [
                  {
                    from: PHONE,
                    id: `wamid.${crypto.randomUUID()}`,
                    timestamp: String(Math.floor(now.getTime() / 1000)),
                    ...input.message,
                  },
                ],
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5516000000000', phone_number_id: phoneNumberId },
              },
            },
          ],
          id: 'waba-journey',
        },
      ],
      object: 'whatsapp_business_account',
    })
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
    const response = await post?.execute({
      correlationId: 'corr-journey',
      pathParameters: {},
      request: new Request('https://api.local/public/whatsapp/webhook', {
        body,
        headers: { 'x-hub-signature-256': signature },
        method: 'POST',
      }),
    })
    expect(response?.status).toBe(200)
    // O áudio responde fora do turno (transcrição em segundo plano).
    await Bun.sleep(input.message.type === 'audio' ? 300 : 0)
    const answered = sentBodies()
      .slice(before)
      .map((request) => readSent(request.body))
    transcript.push({ from: 'motorista', text: input.shown })
    for (const reply of answered) transcript.push({ from: 'bot', text: reply })
    return answered
  }
  return { receive, transcript, transcription }
}

describe('jornada do motorista na conversa individual do WhatsApp (caminho real, Postgres)', () => {
  testWithPostgres(
    'três paradas do "iniciar rota" ao "rota concluída", com o texto exato de cada resposta',
    async () => {
      if (databaseUrl === undefined) return
      const graph = startGraphServer()
      try {
        await withDisposableDatabase({
          adminUrl: databaseUrl,
          migrate: (connection) => runAllDatabaseMigrations({ connectionString: connection }),
          namePrefix: 'transportada_driver_journey_direct',
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
            await new DrizzleWhatsAppPhoneRepository(db).saveVerified({
              phone: PHONE,
              userId: world.userId,
              verifiedAt: new Date(),
            })
            await createDrizzleWhatsAppFlowGraphPublisher(db)({
              companyId: world.companyId,
              graph: WHATSAPP_ROOT_FLOW_GRAPH,
              publishedBy: 'code',
              source: 'code',
            })
            const now = await startOfQuietMinute()
            const journey = await buildDirectJourney(db, world, graph, now)
            const recording = process.env.JOURNEY_RECORD === '1'
            const expected = directJourneyExpected({
              at: formatBotClock(now),
              eta: formatBotClock(new Date(now.getTime() + 1500 * 1000)),
              farewell: botFarewell(now),
              greeting: botGreeting(now, 'Anderson Motorista'),
            })
            const recorded: unknown[] = []

            for (const [index, step] of directJourneySteps(world).entries()) {
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
            expect(await readJourneyEvents(db, world)).toEqual([
              'parada 1: departed 📍',
              'parada 1: arrived',
              'parada 1: delivered',
              'parada 3: departed',
              'parada 3: arrived 📍',
              'parada 3: returned',
              'parada 2: departed',
              'parada 2: arrived',
              'parada 2: delivered',
            ])
            if (process.env.JOURNEY_TRANSCRIPT === '1') {
              console.log(formatJourneyTranscript(journey.transcript))
            }
          },
        })
      } finally {
        await graph.server.stop(true)
      }
    },
    120_000,
  )
})

type JourneyStep = {
  readonly send: { readonly message: Record<string, unknown>; readonly shown: string }
  readonly transcription?: string
}

function directJourneySteps(world: JourneyWorld): readonly JourneyStep[] {
  const text = (body: string): JourneyStep => ({
    send: { message: { text: { body }, type: 'text' }, shown: body },
  })
  const tap = (id: string, title: string): JourneyStep => ({
    send: {
      message: {
        interactive: { list_reply: { id, title }, type: 'list_reply' },
        type: 'interactive',
      },
      shown: `(toca) ${title}`,
    },
  })
  const location = (latitude: number, longitude: number): JourneyStep => ({
    send: {
      message: { location: { latitude, longitude }, type: 'location' },
      shown: '📍 (localização)',
    },
  })
  const audio = (heard: string): JourneyStep => ({
    send: {
      message: { audio: { id: AUDIO_MEDIA_ID, mime_type: 'audio/ogg' }, type: 'audio' },
      shown: `🎤 (áudio: "${heard}")`,
    },
    transcription: heard,
  })
  const button = (id: string, title: string): JourneyStep => ({
    send: {
      message: {
        interactive: { button_reply: { id, title }, type: 'button_reply' },
        type: 'interactive',
      },
      shown: `(toca) ${title}`,
    },
  })
  const [first, second] = world.stops
  return [
    text('iniciar rota'),
    tap(first.stopId, `NF ${first.number}`),
    location(-21.165, -47.805),
    text('cheguei'),
    text('pular'),
    text('cheguei'),
    audio('um'),
    text('1'),
    button('yes', '✅ Sim'),
    text('pular'),
    text('pular'),
    text('1'),
    text('2'),
    text('2'),
    text('pular'),
    text('1'),
    text('saí'),
    text('3'),
    text('cheguei'),
    location(-21.341, -47.731),
    text('saí'),
    text('2'),
    tap('recipient_refused', '🙅 Recusou receber'),
    text('1'),
    text('pular'),
    text('cheguei'),
    text('pular'),
    text(`entreguei ${second.number}`),
    button('yes', '✅ Sim'),
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
