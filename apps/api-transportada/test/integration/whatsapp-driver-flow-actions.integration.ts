/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T015 — AC7: o motorista entrega pelo WhatsApp. Webhook assinado, Graph API fake, grafo
 * publicado (T008) e o mesmo repositório que a rota `/me/trips/current` do PWA usa
 * (`report-document-delivery.use-case.ts`) — a prova de que não existe caminho paralelo.
 */
import { createHmac } from 'node:crypto'
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'
import { eq } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
  membershipRoles,
} from '../../src/database/database.schema.js'
import {
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { registerDriverOccurrence } from '../../src/trips/application/register-driver-occurrence.use-case.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import {
  findDriverReachableDocument,
  findOccurrenceType,
  listDocumentProducts,
  listOccurrenceTypes,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import { createDriverWhatsAppFlowActions } from '../../src/whatsapp-commands/application/register-driver-flow-actions.js'
import { createModuleWhatsAppFlowGraphProvider } from '../../src/whatsapp-commands/application/whatsapp-flow-graph.service.js'
import {
  WHATSAPP_ROOT_FLOW_GRAPH,
  WHATSAPP_ROOT_FLOW_GRAPH_KEY,
} from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph.constant.js'
import { DrizzleWhatsAppPhoneRepository } from '../../src/whatsapp-commands/infrastructure/drizzle-whatsapp-phone.repository.js'
import { createWhatsAppCommandHookFactory } from '../../src/whatsapp-commands/infrastructure/whatsapp-command-hook.factory.js'
import { createDrizzleWhatsAppFlowGraphPublisher } from '../../src/whatsapp-commands/infrastructure/whatsapp-flow-graph-publisher.factory.js'
import { createMetaWhatsAppModuleResolver } from '../../src/whatsapp/application/meta-whatsapp-module.resolver.js'
import { createDrizzleWebhookNonceStore } from '../../src/whatsapp/infrastructure/drizzle-webhook-nonce.store.js'
import { createWhatsAppWebhookRoutes } from '../../src/whatsapp/presentation/whatsapp-webhook.routes.js'

type TestDatabase = ReturnType<typeof createDrizzleProvider>
type Database = TestDatabase['db']

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const APP_SECRET = 'app-secret-t015'
const VERIFY_TOKEN = 'verify-token-t015'
const ACCESS_TOKEN = 'access-token-t015'
const API_VERSION = 'v21.0'
const ENVELOPE = {
  algorithm: 'A256GCM' as const,
  ciphertext: 'cipher',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1 as const,
}

type GraphRequest = {
  readonly authorization: string | null
  readonly body: Record<string, unknown>
  readonly path: string
}

const graphRequests: GraphRequest[] = []
let graphServer: ReturnType<typeof Bun.serve> | undefined
let shared: { readonly database: TestDatabase; readonly name: string } | undefined

beforeAll(async () => {
  if (databaseUrl === undefined) return
  graphServer = Bun.serve({
    async fetch(request) {
      graphRequests.push({
        authorization: request.headers.get('authorization'),
        body: (await request.json()) as Record<string, unknown>,
        path: new URL(request.url).pathname,
      })
      return Response.json({ messages: [{ id: `wamid.${crypto.randomUUID()}` }] })
    },
    hostname: '127.0.0.1',
    port: 0,
  })

  const admin = new SQL(databaseUrl, { max: 1 })
  const name = `transportada_144_t015_${crypto.randomUUID().replaceAll('-', '')}`
  const url = new URL(databaseUrl)
  url.pathname = `/${name}`
  url.search = ''
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${name}"`)
    await runAllDatabaseMigrations({ connectionString: url.toString() })
    shared = { database: createDrizzleProvider({ connection: url.toString() }), name }
  } finally {
    await admin.close({ timeout: 0 })
  }
})

afterAll(async () => {
  await graphServer?.stop(true)
  if (databaseUrl === undefined || shared === undefined) return
  const admin = new SQL(databaseUrl, { max: 1 })
  try {
    await shared.database.close()
    await admin.unsafe(`drop database if exists "${shared.name}" with (force)`)
  } finally {
    await admin.close({ timeout: 0 })
  }
})

describe('o motorista entrega pelo WhatsApp (spec 144 T015 AC7)', () => {
  testWithPostgres(
    'menu → minha viagem → entregar → escolhe a nota → nota vira "delivered" no mesmo evento do PWA',
    async () => {
      const db = requireDatabase()
      const world = await seedDispatchedTripWithOneDocument(db)
      await new DrizzleWhatsAppPhoneRepository(db).saveVerified({
        phone: world.phone,
        userId: world.userId,
        verifiedAt: new Date(),
      })

      await createDrizzleWhatsAppFlowGraphPublisher(db)({
        companyId: world.companyId,
        graph: WHATSAPP_ROOT_FLOW_GRAPH,
        publishedBy: 'code',
        source: 'code',
      })
      const scenario = await buildScenario(db, world.companyId)

      await scenario.receive({ from: world.phone, text: { body: 'oi' }, type: 'text' })
      expect(scenario.sentMessages().at(-1)?.body).toMatchObject({
        interactive: { type: 'button' },
      })

      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'minha_viagem', title: '🚚 Minha viagem' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      const tripMenu = scenario.sentMessages().at(-1)
      expect(tripMenu?.body).toMatchObject({
        interactive: {
          action: {
            buttons: [
              { reply: { id: 'deliver' }, type: 'reply' },
              { reply: { id: 'return' }, type: 'reply' },
              { reply: { id: 'occurrence' }, type: 'reply' },
            ],
          },
          type: 'button',
        },
      })

      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'deliver', title: '📦 Entregar' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      /**
       * A `FlowAction` manda a lista dinâmica ela mesma (título com o nome do destinatário nunca
       * toca o `context` persistido); o nó `entrada_choice` que a sucede é o que fica de posição —
       * e ele manda, em seguida, o nudge de texto curto (segunda mensagem do turno).
       */
      const documentList = scenario.sentMessages().at(-2)
      expect(documentList?.body).toMatchObject({
        interactive: {
          action: {
            sections: [{ rows: [{ id: world.documentId }] }],
          },
          type: 'list',
        },
      })

      await scenario.receive({
        from: world.phone,
        interactive: { list_reply: { id: world.documentId, title: '1' }, type: 'list_reply' },
        type: 'interactive',
      })
      /** A confirmação sai antes de o fluxo voltar a esperar no menu da viagem (2ª mensagem). */
      expect(scenario.sentMessages().at(-2)?.body).toMatchObject({
        text: { body: 'Entrega registrada. ✅' },
        type: 'text',
      })

      const [document] = await db
        .select()
        .from(tripDocuments)
        .where(eq(tripDocuments.id, world.documentId))
      expect(document?.separationStatus).toBe('delivered')
      expect(document?.deliveredAt).not.toBeNull()

      const events = await db
        .select()
        .from(tripStopEvents)
        .where(eq(tripStopEvents.tripDocumentId, world.documentId))
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        actorUserId: world.userId,
        companyId: world.companyId,
        kind: 'delivered',
        stopId: world.stopId,
        tripDocumentId: world.documentId,
      })

      /**
       * A viagem tinha uma parada e uma nota só: entregá-la fecha a parada e conclui a viagem
       * sozinha (spec 056 D1) — o mesmo efeito que a rota `/me/trips/current/documents/:id/deliver`
       * do PWA produz, porque é a mesma `reportDocumentDelivery` que corre nos dois canais.
       */
      const [completedTrip] = await db.select().from(trips).where(eq(trips.id, world.tripId))
      expect(completedTrip?.status).toBe('completed')

      /** Sem viagem para o novo lookup do fixture, o pedido de nova ação fica sem alcance. */
      const opened = await findCurrentDriverTrip({
        companyId: world.companyId,
        membershipId: world.membershipId,
        now: new Date(),
        repository: new DrizzleCurrentDriverTripRepository(db),
        scores: new DrizzleDriverScoreRepository(db),
      })
      expect(opened.trips).toHaveLength(0)
    },
  )
})

type SeededWorld = {
  readonly companyId: string
  readonly documentId: string
  readonly membershipId: string
  readonly phone: string
  readonly stopId: string
  readonly tripId: string
  readonly userId: string
}

async function seedDispatchedTripWithOneDocument(db: Database): Promise<SeededWorld> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const phone = randomPhone()

  await db.insert(companies).values({ id: companyId, status: 'active' })
  await db.insert(identityUsers).values({ id: userId, status: 'active' })
  await db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await db.insert(membershipRoles).values({ membershipId, role: 'driver' })
  await db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista T015',
    taxId: '11122233344',
  })
  await db.insert(trips).values({ companyId, id: tripId, status: 'dispatched', vehicleId })
  await db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista T015',
    driverTaxId: '11122233344',
    position: 1n,
    tripId,
  })
  await db.insert(tripStops).values({
    addressKey: '3550308|01001000|100',
    /** O motorista já chegou — a chegada é passo de uma spec anterior, fora do escopo da T015. */
    arrivedAt: new Date('2026-09-11T09:00:00.000Z'),
    companyId,
    id: stopId,
    label: 'Centro, 100',
    sequence: 1n,
    tripId,
  })

  const nfeDocumentId = await seedNfeDocument(db, { companyId, userId })
  const documentId = crypto.randomUUID()
  await db.insert(tripDocuments).values({
    companyId,
    id: documentId,
    loadedAt: new Date('2026-09-11T08:00:00.000Z'),
    nfeDocumentId,
    separatedAt: new Date('2026-09-11T07:00:00.000Z'),
    separationStatus: 'loaded',
    stopId,
    tripId,
  })

  return { companyId, documentId, membershipId, phone, stopId, tripId, userId }
}

async function seedNfeDocument(
  db: Database,
  input: { readonly companyId: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = '9'.repeat(64)

  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: 'nfe/t015.xml',
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: 'correlation-t015',
    id: importId,
    idempotencyKey: 't015',
    requestFingerprint: 'fingerprint-t015',
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await db.insert(nfeDocuments).values({
    accessKey: `1${'1'.repeat(43)}`,
    authorizationProtocol: 'protocol-t015',
    companyId: input.companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-11T06:00:00.000Z'),
    model: '55',
    number: '1',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '100.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '100.0000',
    xmlObjectId,
    xmlSha256: sha,
  })

  const participantId = crypto.randomUUID()
  await db.insert(nfeParticipants).values({
    companyId: input.companyId,
    documentId,
    id: participantId,
    legalName: 'Cliente T015',
    role: 'recipient',
  })
  await db.insert(nfeAddresses).values({
    city: 'Sao Paulo',
    cityCode: '3550308',
    companyId: input.companyId,
    number: '100',
    participantId,
    postalCode: '01001000',
    state: 'SP',
    street: 'Rua T015',
  })

  return documentId
}

async function buildScenario(db: Database, companyId: string) {
  const phoneNumberId = randomDigits(15)
  const logged: { message: string; meta?: unknown }[] = []
  const record = (message: string, meta?: unknown): void => {
    logged.push({ message, ...(meta === undefined ? {} : { meta }) })
  }
  const logger = { error: record, info: record, warn: record }
  const baseUrl = `http://127.0.0.1:${graphServer?.port}`

  const currentDriverTripRepository = new DrizzleCurrentDriverTripRepository(db)
  const driverFieldReports = new DrizzleDriverFieldReportUnitOfWork(db, 'test-bucket')
  const driverFlowActions = createDriverWhatsAppFlowActions({
    findCurrentTrip: (input) =>
      findCurrentDriverTrip({
        ...input,
        now: new Date(),
        repository: currentDriverTripRepository,
        scores: new DrizzleDriverScoreRepository(db),
      }),
    listOccurrenceTypes: (input) => listOccurrenceTypes(db, { companyId: input.companyId }),
    registerOccurrence: (input) =>
      registerDriverOccurrence({
        ...input,
        repository: {
          findConfirmedUpload: async () => null,
          findOccurrenceType: (query) => findOccurrenceType(db, query),
          findReachableDocument: (query) => findDriverReachableDocument(db, query),
          listDocumentProducts: (query) => listDocumentProducts(db, query),
        },
        unitOfWork: driverFieldReports,
      }),
    reportDelivery: (input) =>
      reportDocumentDelivery({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
    reportReturn: (input) =>
      reportDocumentReturn({ ...input, now: new Date(), unitOfWork: driverFieldReports }),
    resolveDriverId: (input) => currentDriverTripRepository.findDriverIdByMembership(input),
  })

  const resolver = createMetaWhatsAppModuleResolver({
    apiVersion: API_VERSION,
    appSecret: APP_SECRET,
    baseUrl,
    buildMessageHook: createWhatsAppCommandHookFactory({
      apiVersion: API_VERSION,
      authorization: new AuthorizationService(),
      baseUrl,
      clock: () => new Date(),
      flowActions: driverFlowActions,
      graphs: createModuleWhatsAppFlowGraphProvider({
        repository: new FlowGraphRepository(db as never),
        rootFlowKey: WHATSAPP_ROOT_FLOW_GRAPH_KEY,
      }),
      logger,
      rateLimiter: createRateLimiter(),
      resolveActor: createResolveWhatsAppActorUseCase({
        memberships: new DrizzleMembershipRepository(db),
        phones: new DrizzleWhatsAppPhoneRepository(db),
        tenantContext: new TenantContextService({
          repository: new DrizzleMembershipRepository(db),
        }),
      }),
    }),
    database: db,
    nonceStore: createDrizzleWebhookNonceStore(db),
    repository: {
      findByPhoneNumberId: async (input) =>
        input.phoneNumberId === phoneNumberId
          ? {
              channelId: `channel-${phoneNumberId}`,
              companyId,
              envelope: ENVELOPE,
              phoneNumberId,
              version: '1',
              wabaId: '',
            }
          : undefined,
    },
    secretService: {
      decrypt: async () => ({ accessToken: ACCESS_TOKEN }),
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

  async function receive(message: Record<string, unknown>): Promise<void> {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ profile: { name: 'Motorista' }, wa_id: message.from }],
                messages: [
                  { id: `wamid.${crypto.randomUUID()}`, timestamp: '1757592000', ...message },
                ],
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5516000000000', phone_number_id: phoneNumberId },
              },
            },
          ],
          id: 'waba-t015',
        },
      ],
      object: 'whatsapp_business_account',
    })
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
    const response = await post?.execute({
      correlationId: 'corr-t015',
      pathParameters: {},
      request: new Request('https://api.local/public/whatsapp/webhook', {
        body,
        headers: { 'x-hub-signature-256': signature },
        method: 'POST',
      }),
    })
    expect(response?.status).toBe(200)
  }

  const sentMessages = (): readonly GraphRequest[] =>
    graphRequests.filter((request) => request.path === `/${API_VERSION}/${phoneNumberId}/messages`)

  return { logged, receive, sentMessages }
}

function randomPhone(): string {
  return `55169${randomDigits(8)}`
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('')
}

function requireDatabase(): Database {
  if (shared === undefined) throw new Error('A PostgreSQL test URL is required')
  return shared.database.db
}
