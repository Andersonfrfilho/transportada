/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T016 — o operador separa, carrega e despacha pela conversa (D7/D8). Webhook assinado,
 * Graph API fake, grafo publicado (T008) e as mesmas funções compostas
 * (`transitionTripDocument`/`dispatchTrip`) que as rotas `/trips/:id/documents/:documentId/{separate,
 * load}` e `/trips/:id/dispatch` do painel usam — a prova de que não existe caminho paralelo.
 */
import { createHmac } from 'node:crypto'
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { FlowGraphRepository } from '@adatechnology/meta-whatsapp-module'
import { asc, eq, like } from 'drizzle-orm'

import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyOccurrenceTypes,
  fleetVehicles,
  identityUsers,
  membershipRoles,
  nfeAddresses,
  nfeDocuments,
  nfeImports,
  nfeParticipants,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  tripDocumentEvents,
  tripDocumentOccurrenceAttachments,
  tripDocuments,
  tripStatusEvents,
  tripStops,
  trips,
} from '../../src/database/trip.schema.js'
import { createRateLimiter } from '../../src/http/rate-limiter.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import { TenantContextService } from '../../src/identity/application/tenant-context.service.js'
import { DrizzleMembershipRepository } from '../../src/identity/infrastructure/drizzle-membership.repository.js'
import { dispatchTrip } from '../../src/trips/application/dispatch-trip.use-case.js'
import { attachOccurrencePhoto } from '../../src/trips/application/attach-occurrence-photo.use-case.js'
import { persistSeparationOccurrenceWithAttachment } from '../../src/trips/application/persist-separation-occurrence-attachment.service.js'
import { DrizzleSeparationOccurrenceUnitOfWork } from '../../src/trips/infrastructure/drizzle-separation-occurrence.repository.js'
import { DrizzleAttachOccurrencePhotoUnitOfWork } from '../../src/trips/infrastructure/drizzle-attach-occurrence-photo.repository.js'
import { DrizzleOccurrenceAttachmentRepository } from '../../src/trips/infrastructure/drizzle-occurrence-attachment.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import type { DriverFieldReportTransactionPort } from '../../src/trips/application/driver-field-report.port.js'
import { withFieldReport } from '../../src/trips/application/trip-field-report.port.js'
import {
  buildOccurrenceAttachmentAppendFingerprint,
  buildOccurrenceAttachmentCreateFingerprint,
  OCCURRENCE_ATTACHMENT_APPEND_OPERATION,
  OCCURRENCE_ATTACHMENT_CREATE_OPERATION,
  sha256Hex,
} from '../../src/trips/domain/occurrence-attachment.policy.js'
import { OFFICE_PROOF_MAX_BYTES } from '../../src/trips/domain/delivery-proof.policy.js'
import { listWarehouseTrips } from '../../src/trips/application/list-warehouse-trips.use-case.js'
import { registerTripOccurrence } from '../../src/trips/application/register-trip-occurrence.use-case.js'
import { transitionTripDocument } from '../../src/trips/application/transition-trip-document.use-case.js'
import { transitionTripDocumentsBatch } from '../../src/trips/application/transition-trip-documents-batch.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import {
  findOccurrenceForAttachment,
  findOccurrenceType,
  findTripOccurrenceById,
  listDocumentProducts,
  listOccurrenceTypes,
  listTripOccurrences,
  readOccurrenceTemplateValues,
} from '../../src/trips/infrastructure/delivery-proof-read.support.js'
import { DrizzleTripDocumentBatchRepository } from '../../src/trips/infrastructure/drizzle-trip-document-batch.repository.js'
import { DrizzleTripDocumentRepository } from '../../src/trips/infrastructure/drizzle-trip-document.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import { DrizzleWarehouseTripRepository } from '../../src/trips/infrastructure/drizzle-warehouse-trip.repository.js'
import { createResolveWhatsAppActorUseCase } from '../../src/whatsapp-commands/application/resolve-whatsapp-actor.use-case.js'
import {
  fakeAttachmentStorage,
  JPEG_BYTES,
} from '../fixtures/trip-field-office-database.fixture.js'
import { createOperatorWhatsAppFlowActions } from '../../src/whatsapp-commands/application/register-operator-trip-flow-actions.js'
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

const APP_SECRET = 'app-secret-t016'
const VERIFY_TOKEN = 'verify-token-t016'
const ACCESS_TOKEN = 'access-token-t016'
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
  const name = `transportada_144_t016_${crypto.randomUUID().replaceAll('-', '')}`
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

describe('o operador separa, carrega e despacha pelo WhatsApp (spec 144 T016)', () => {
  testWithPostgres(
    'menu → viagens do armazém → escolhe a viagem → separar → carregar → despachar, tudo pelo fluxo real',
    async () => {
      const db = requireDatabase()
      const world = await seedRoutePlannedTripWithOneDocument(db)
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

      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'viagens_armazem', title: '🏭 Viagens do armazém' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      /** O nó `entrada_choice` manda o nudge de texto em seguida (2ª mensagem do turno), como T015. */
      const tripList = scenario.sentMessages().at(-2)
      expect(tripList?.body).toMatchObject({
        interactive: { action: { sections: [{ rows: [{ id: world.tripId }] }] }, type: 'list' },
      })

      await scenario.receive({
        from: world.phone,
        interactive: {
          list_reply: { id: world.tripId, title: 'ABC1D23 · 1 notas' },
          type: 'list_reply',
        },
        type: 'interactive',
      })
      /**
       * O menu de ações é dinâmico (`sendDynamicChoice`, mesma ressalva do ramo do motorista): sai
       * sempre como lista, mesmo com ≤3 opções — a instalação não tem `sendInteractiveButtons`.
       */
      const actionMenu = scenario.sentMessages().at(-2)
      expect(actionMenu?.body).toMatchObject({
        interactive: {
          action: {
            sections: [
              {
                rows: [{ id: 'separate' }, { id: 'load' }, { id: 'occurrence' }],
              },
            ],
          },
          type: 'list',
        },
      })

      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'separate', title: '📦 Separar' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      await scenario.receive({
        from: world.phone,
        interactive: { list_reply: { id: world.documentId, title: '1' }, type: 'list_reply' },
        type: 'interactive',
      })
      /**
       * `documentRouter` confirma e volta para `tripActionMenu`, que é `action` e por isso a
       * própria interpretação encadeia a lista de ações de novo — 3 mensagens neste turno: a
       * confirmação, a lista de ações e o nudge do `entrada_choice` que a sucede.
       */
      expect(scenario.sentMessages().at(-3)?.body).toMatchObject({
        text: { body: 'Separação registrado. ✅' },
      })

      const [separated] = await db
        .select()
        .from(tripDocuments)
        .where(eq(tripDocuments.id, world.documentId))
      expect(separated?.separationStatus).toBe('separated')

      /**
       * Spec 158 T4, aceite 4: o operador pelo WhatsApp grava `channel: 'whatsapp'` em
       * `trip_document_events` — nunca `driver_app`, o default da coluna.
       */
      const [separateEvent] = await db
        .select({ channel: tripDocumentEvents.channel })
        .from(tripDocumentEvents)
        .where(eq(tripDocumentEvents.tripDocumentId, world.documentId))
      expect(separateEvent).toEqual({ channel: 'whatsapp' })

      await scenario.receive({
        from: world.phone,
        interactive: { button_reply: { id: 'load', title: '📥 Carregar' }, type: 'button_reply' },
        type: 'interactive',
      })
      await scenario.receive({
        from: world.phone,
        interactive: { list_reply: { id: world.documentId, title: '1' }, type: 'list_reply' },
        type: 'interactive',
      })
      expect(scenario.sentMessages().at(-3)?.body).toMatchObject({
        text: { body: 'Carregamento registrado. ✅' },
      })

      const [loaded] = await db
        .select()
        .from(tripDocuments)
        .where(eq(tripDocuments.id, world.documentId))
      expect(loaded?.separationStatus).toBe('loaded')

      const loadEvents = await db
        .select({ channel: tripDocumentEvents.channel })
        .from(tripDocumentEvents)
        .where(eq(tripDocumentEvents.tripDocumentId, world.documentId))
      expect(loadEvents).toEqual([{ channel: 'whatsapp' }, { channel: 'whatsapp' }])

      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'dispatch', title: '🚚 Despachar' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      const confirmMenu = scenario.sentMessages().at(-1)
      expect(confirmMenu?.body).toMatchObject({
        interactive: {
          action: {
            buttons: [{ reply: { id: 'confirm_dispatch' } }, { reply: { id: 'cancel_dispatch' } }],
          },
        },
      })

      await scenario.receive({
        from: world.phone,
        interactive: {
          button_reply: { id: 'confirm_dispatch', title: '✅ Confirmar' },
          type: 'button_reply',
        },
        type: 'interactive',
      })
      expect(scenario.sentMessages().at(-3)?.body).toMatchObject({
        text: { body: 'Viagem despachada. 🚚' },
      })

      const [dispatchedTrip] = await db.select().from(trips).where(eq(trips.id, world.tripId))
      expect(dispatchedTrip?.status).toBe('dispatched')

      /**
       * Spec 158 T4: todas as transições de status pelo WhatsApp do operador — a separação e o
       * carregamento (via `recalculateTripStatus`) e o despacho (via `DrizzleTripRouteRepository`)
       * — gravam `whatsapp` em `trip_status_events`, nunca `driver_app`.
       */
      const statusEvents = await db
        .select({ channel: tripStatusEvents.channel, toStatus: tripStatusEvents.toStatus })
        .from(tripStatusEvents)
        .where(eq(tripStatusEvents.tripId, world.tripId))
        .orderBy(asc(tripStatusEvents.occurredAt))
      expect(statusEvents).toEqual([
        { channel: 'whatsapp', toStatus: 'separating' },
        { channel: 'whatsapp', toStatus: 'loading' },
        { channel: 'whatsapp', toStatus: 'dispatched' },
      ])

      /** Viagem despachada não é mais "do armazém" — some da próxima listagem. */
      const remaining = await listWarehouseTrips({
        companyId: world.companyId,
        repository: new DrizzleWarehouseTripRepository(db),
      })
      expect(remaining).toHaveLength(0)
    },
  )
})

/**
 * Spec 158 T4, aceite 4: o `batchTransition` que o menu de ações do WhatsApp usa para separar/
 * carregar várias notas de uma vez grava `channel: 'whatsapp'` nos dois eventos, mesmo canal do
 * caminho de uma nota só acima.
 */
describe('batch-status pelo WhatsApp do operador grava channel whatsapp (spec 158 T4)', () => {
  testWithPostgres('separar duas notas em lote grava whatsapp nos dois eventos', async () => {
    const db = requireDatabase()
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const vehicleId = crypto.randomUUID()
    const tripId = crypto.randomUUID()
    const stopId = crypto.randomUUID()

    await db.insert(companies).values({ id: companyId, status: 'active' })
    await db.insert(identityUsers).values({ id: userId, status: 'active' })
    await db
      .insert(userCompanyMemberships)
      .values({ companyId, id: crypto.randomUUID(), status: 'active', userId })
    await db.insert(fleetVehicles).values({
      companyId,
      id: vehicleId,
      plate: 'ABC1D25',
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    })
    await db.insert(trips).values({ companyId, id: tripId, status: 'route_planned', vehicleId })
    await db.insert(tripStops).values({
      addressKey: '3550308|01001000|batch',
      companyId,
      id: stopId,
      label: 'Centro, 100',
      sequence: 1n,
      tripId,
    })
    const documentAId = crypto.randomUUID()
    const documentBId = crypto.randomUUID()
    await db.insert(tripDocuments).values([
      {
        companyId,
        id: documentAId,
        nfeDocumentId: await seedNfeDocument(db, { companyId, suffix: 'batch-a', userId }),
        separationStatus: 'pending',
        stopId,
        tripId,
      },
      {
        companyId,
        id: documentBId,
        nfeDocumentId: await seedNfeDocument(db, { companyId, suffix: 'batch-b', userId }),
        separationStatus: 'pending',
        stopId,
        tripId,
      },
    ])

    const batchRepository = new DrizzleTripDocumentBatchRepository(db)
    const result = await transitionTripDocumentsBatch({
      action: 'separate',
      actorUserId: userId,
      channel: TRIP_FIELD_CHANNELS.whatsapp,
      companyId,
      documentIds: [documentAId, documentBId],
      repository: batchRepository,
      tripId,
    })
    expect(result.tripStatus).toBe('separating')

    const documentEvents = await db
      .select({ channel: tripDocumentEvents.channel })
      .from(tripDocumentEvents)
      .where(eq(tripDocumentEvents.companyId, companyId))
    expect(documentEvents).toEqual([{ channel: 'whatsapp' }, { channel: 'whatsapp' }])

    const [statusEvent] = await db
      .select()
      .from(tripStatusEvents)
      .where(eq(tripStatusEvents.tripId, tripId))
    expect(statusEvent).toMatchObject({
      channel: 'whatsapp',
      fromStatus: 'route_planned',
      onBehalfOfDriverId: null,
      toStatus: 'separating',
    })
  })
})

type SeededWorld = {
  readonly companyId: string
  readonly documentId: string
  readonly membershipId: string
  readonly phone: string
  readonly tripId: string
  readonly userId: string
}

async function seedRoutePlannedTripWithOneDocument(db: Database): Promise<SeededWorld> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const phone = randomPhone()

  await db.insert(companies).values({ id: companyId, status: 'active' })
  await db.insert(identityUsers).values({ id: userId, status: 'active' })
  await db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await db.insert(membershipRoles).values({ membershipId, role: 'separator' })
  await db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'ABC1D23',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await db.insert(trips).values({ companyId, id: tripId, status: 'route_planned', vehicleId })
  const stopId = crypto.randomUUID()
  await db.insert(tripStops).values({
    addressKey: '3550308|01001000|100',
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
    nfeDocumentId,
    separationStatus: 'pending',
    stopId,
    tripId,
  })

  return { companyId, documentId, membershipId, phone, tripId, userId }
}

async function seedNfeDocument(
  db: Database,
  input: { readonly companyId: string; readonly suffix?: string; readonly userId: string },
): Promise<string> {
  const importId = crypto.randomUUID()
  const documentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = '8'.repeat(64)
  /** Chave do objeto e access key têm de ser únicas por empresa — chamadas do mesmo teste passam
   *  `suffix`; sem ele (só um documento por empresa) cai no valor fixo histórico. */
  const suffix = input.suffix ?? 't016'
  const accessKeyDigits = documentId
    .replaceAll('-', '')
    .replace(/[a-z]/g, (letter) => String(letter.charCodeAt(0) % 10))
    .padEnd(43, '0')
    .slice(0, 43)

  await db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-${suffix}`,
    id: importId,
    idempotencyKey: suffix,
    requestFingerprint: `fingerprint-${suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await db.insert(nfeDocuments).values({
    accessKey: `2${accessKeyDigits}`,
    authorizationProtocol: `protocol-${suffix}`,
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
    legalName: 'Cliente T016',
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
    street: 'Rua T016',
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

  const tripDocumentRepository = new DrizzleTripDocumentRepository(db)
  const tripDocumentBatchRepository = new DrizzleTripDocumentBatchRepository(db)
  const tripRouteRepository = new DrizzleTripRouteRepository(db)
  const warehouseTripRepository = new DrizzleWarehouseTripRepository(db)
  const occurrenceUploads: { objectId: string; objectKey: string }[] = []
  /**
   * Spec 161 T16 (RF20b): mesmo molde de `main.ts` — a reserva/liquidação da chave de
   * idempotência sobre `trip_field_reports`, aqui contra o Postgres descartável do teste.
   */
  const occurrenceFieldReports = new DrizzleDriverFieldReportUnitOfWork(db, 'test-bucket')
  const occurrenceFieldReportGuardTransaction = {
    claim: (input: Parameters<DriverFieldReportTransactionPort['claim']>[0]) =>
      occurrenceFieldReports.execute((transaction) => transaction.claim(input)),
    settle: (input: Parameters<DriverFieldReportTransactionPort['settle']>[0]) =>
      occurrenceFieldReports.execute((transaction) => transaction.settle(input)),
  }
  const operatorFlowActionDependencies: Parameters<typeof createOperatorWhatsAppFlowActions>[0] = {
    attachOccurrencePhoto: (input) =>
      withFieldReport({
        guard: {
          actorUserId: input.actorUserId,
          authorship: { channel: TRIP_FIELD_CHANNELS.whatsapp, onBehalfOfDriverId: null },
          companyId: input.companyId,
          idempotencyKey: sha256Hex(input.attachment.bytes),
          operation: `${OCCURRENCE_ATTACHMENT_APPEND_OPERATION}:${buildOccurrenceAttachmentAppendFingerprint(
            {
              attachmentSha256: sha256Hex(input.attachment.bytes),
              occurrenceId: input.occurrenceId,
            },
          )}`,
          transaction: occurrenceFieldReportGuardTransaction,
        },
        perform: () =>
          attachOccurrencePhoto({
            attachment: input.attachment,
            companyId: input.companyId,
            occurrenceId: input.occurrenceId,
            repository: {
              countOccurrenceAttachments: (query) =>
                new DrizzleOccurrenceAttachmentRepository(db).countOccurrenceAttachments(query),
              findOccurrence: (query) => findOccurrenceForAttachment(db, query),
              newObjectId: () => crypto.randomUUID(),
              now: () => new Date(),
              storage: fakeAttachmentStorage(occurrenceUploads),
              unitOfWork: new DrizzleAttachOccurrencePhotoUnitOfWork(db, 'test-bucket'),
            },
          }),
        recall: async (resultId) =>
          new DrizzleOccurrenceAttachmentRepository(db).findAttachmentPosition({
            companyId: input.companyId,
            id: resultId,
          }),
      }),
    batchTransition: (input) =>
      transitionTripDocumentsBatch({
        action: input.action,
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        documentIds: input.documentIds,
        repository: tripDocumentBatchRepository,
        tripId: input.tripId,
      }),
    dispatchTrip: (input) =>
      dispatchTrip({
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        repository: tripRouteRepository,
        tripId: input.tripId,
      }),
    listOccurrenceTypes: (input) => listOccurrenceTypes(db, { companyId: input.companyId }),
    listWarehouseTrips: (input) =>
      listWarehouseTrips({ companyId: input.companyId, repository: warehouseTripRepository }),
    loadDocument: (input) =>
      transitionTripDocument({
        action: 'load',
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        documentId: input.documentId,
        repository: tripDocumentRepository,
        tripId: input.tripId,
      }),
    registerOccurrence: (input) => {
      const perform = () =>
        registerTripOccurrence({
          actorUserId: input.actorUserId,
          ...(input.attachment === undefined ? {} : { attachment: input.attachment }),
          companyId: input.companyId,
          documentId: input.documentId,
          note: input.note,
          occurredOn: new Date().toLocaleDateString('pt-BR'),
          occurrenceTypeId: input.occurrenceTypeId,
          productCode: '',
          repository: {
            findOccurrenceType: (query) => findOccurrenceType(db, query),
            listDocumentProducts: (query) => listDocumentProducts(db, query),
            listOccurrences: (query) => listTripOccurrences(db, query),
            readTemplateValues: (query) => readOccurrenceTemplateValues(db, query),
            saveOccurrence: (query) =>
              persistSeparationOccurrenceWithAttachment({
                attachment: query.attachment,
                input: {
                  actorUserId: query.actorUserId,
                  companyId: query.companyId,
                  documentId: query.documentId,
                  note: query.note,
                  occurrenceTypeId: query.occurrenceTypeId,
                  productCode: query.productCode,
                  stage: query.stage,
                  tripId: query.tripId,
                  typeName: query.typeName,
                },
                maxOriginalBytes: OFFICE_PROOF_MAX_BYTES,
                newObjectId: () => crypto.randomUUID(),
                now: () => new Date(),
                storage: fakeAttachmentStorage(occurrenceUploads),
                unitOfWork: new DrizzleSeparationOccurrenceUnitOfWork(db, 'test-bucket'),
              }),
          },
          tripId: input.tripId,
        })

      if (input.attachment === undefined) return perform()

      const attachmentSha256 = sha256Hex(input.attachment.bytes)
      return withFieldReport({
        guard: {
          actorUserId: input.actorUserId,
          authorship: { channel: TRIP_FIELD_CHANNELS.whatsapp, onBehalfOfDriverId: null },
          companyId: input.companyId,
          idempotencyKey: attachmentSha256,
          operation: `${OCCURRENCE_ATTACHMENT_CREATE_OPERATION}:${buildOccurrenceAttachmentCreateFingerprint(
            {
              attachmentSha256,
              documentId: input.documentId,
              note: input.note,
              occurrenceTypeId: input.occurrenceTypeId,
              productCode: null,
            },
          )}`,
          transaction: occurrenceFieldReportGuardTransaction,
        },
        perform,
        recall: async (resultId) => {
          const occurrence = await findTripOccurrenceById(db, {
            companyId: input.companyId,
            occurrenceId: resultId,
          })
          if (occurrence === null) return null
          const attachments = await new DrizzleOccurrenceAttachmentRepository(
            db,
          ).listOccurrenceAttachments({ companyId: input.companyId, occurrenceId: resultId })
          return {
            ...occurrence,
            attachments: attachments.map((attachment) => ({
              id: attachment.id,
              position: attachment.position,
            })),
            email: null,
          }
        },
      })
    },
    separateDocument: (input) =>
      transitionTripDocument({
        action: 'separate',
        actorUserId: input.context.userId,
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        companyId: input.context.companyId,
        documentId: input.documentId,
        repository: tripDocumentRepository,
        tripId: input.tripId,
      }),
  }
  const operatorFlowActions = createOperatorWhatsAppFlowActions(operatorFlowActionDependencies)

  const resolver = createMetaWhatsAppModuleResolver({
    apiVersion: API_VERSION,
    appSecret: APP_SECRET,
    baseUrl,
    buildMessageHook: createWhatsAppCommandHookFactory({
      apiVersion: API_VERSION,
      authorization: new AuthorizationService(),
      baseUrl,
      clock: () => new Date(),
      flowActions: operatorFlowActions,
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
                contacts: [{ profile: { name: 'Operador' }, wa_id: message.from }],
                messages: [
                  { id: `wamid.${crypto.randomUUID()}`, timestamp: '1757592000', ...message },
                ],
                messaging_product: 'whatsapp',
                metadata: { display_phone_number: '5516000000000', phone_number_id: phoneNumberId },
              },
            },
          ],
          id: 'waba-t016',
        },
      ],
      object: 'whatsapp_business_account',
    })
    const signature = `sha256=${createHmac('sha256', APP_SECRET).update(body).digest('hex')}`
    const response = await post?.execute({
      correlationId: 'corr-t016',
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

  return {
    /**
     * Spec 161 T16: os deps reais de registro/anexo de ocorrência, no mesmo molde exato de
     * `main.ts` (`withFieldReport` com a chave sendo o sha256 do arquivo). Expostos para os
     * testes de idempotência do CA11b/CA11c chamarem sem depender de simular o download de mídia
     * da Graph API — a persistência é o que esta task prova; o download já é T15/unitário.
     */
    deps: operatorFlowActionDependencies,
    logged,
    occurrenceUploads,
    receive,
    sentMessages,
  }
}

async function seedOperatorSeparationOccurrenceType(
  db: Database,
  companyId: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(companyOccurrenceTypes).values({
    active: true,
    companyId,
    id,
    name: 'Caixa violada',
    notifies: false,
    stage: 'separation',
  })
  return id
}

/**
 * Spec 161 T16 (RF20b, CA11b/CA11c/CA12): idempotência por sha256 do arquivo baixado — nunca
 * `media-id` (muda a cada reenvio) nem `occurrenceId` (circular). Chama `scenario.deps`
 * diretamente, no mesmo molde já validado por T13/T15 (unidade) e pela persistência de T6/T8 —
 * o que esta suíte prova é que o WhatsApp de fato converge contra o Postgres de verdade, e que
 * nenhum objeto de origem WhatsApp nasce com purpose diferente de `trip_occurrence_attachment`.
 */
describe('idempotência e integração ponta a ponta do passo de foto (spec 161 T16)', () => {
  testWithPostgres('reenviar a mesma foto com media-id diferente não duplica o anexo', async () => {
    const db = requireDatabase()
    const world = await seedRoutePlannedTripWithOneDocument(db)
    const occurrenceTypeId = await seedOperatorSeparationOccurrenceType(db, world.companyId)
    const scenario = await buildScenario(db, world.companyId)

    const first = await scenario.deps.registerOccurrence({
      actorUserId: world.userId,
      attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
      companyId: world.companyId,
      documentId: world.documentId,
      note: '',
      occurrenceTypeId,
      tripId: world.tripId,
    })

    /** Mesmo conteúdo (mesmo sha256), como se o operador tivesse reenviado a mesma foto — o
     * `media-id` seria outro na Meta, mas isso nunca chega até aqui (T14 já cuidou disso). */
    const second = await scenario.deps.registerOccurrence({
      actorUserId: world.userId,
      attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
      companyId: world.companyId,
      documentId: world.documentId,
      note: '',
      occurrenceTypeId,
      tripId: world.tripId,
    })

    expect(second.id).toBe(first.id)

    const rows = await db
      .select()
      .from(tripDocumentOccurrenceAttachments)
      .where(eq(tripDocumentOccurrenceAttachments.occurrenceId, first.id))
    expect(rows).toHaveLength(1)
  })

  testWithPostgres(
    'segunda foto em diante também converge por sha256 (attachOccurrencePhoto)',
    async () => {
      const db = requireDatabase()
      const world = await seedRoutePlannedTripWithOneDocument(db)
      const occurrenceTypeId = await seedOperatorSeparationOccurrenceType(db, world.companyId)
      const scenario = await buildScenario(db, world.companyId)

      const occurrence = await scenario.deps.registerOccurrence({
        actorUserId: world.userId,
        attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
        companyId: world.companyId,
        documentId: world.documentId,
        note: '',
        occurrenceTypeId,
        tripId: world.tripId,
      })

      const secondPhotoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02, 0x03, 0x04])
      const attachOnce = await scenario.deps.attachOccurrencePhoto({
        actorUserId: world.userId,
        attachment: { bytes: secondPhotoBytes, mimeType: 'image/jpeg' },
        companyId: world.companyId,
        occurrenceId: occurrence.id,
      })
      const attachAgain = await scenario.deps.attachOccurrencePhoto({
        actorUserId: world.userId,
        attachment: { bytes: secondPhotoBytes, mimeType: 'image/jpeg' },
        companyId: world.companyId,
        occurrenceId: occurrence.id,
      })

      expect(attachAgain.id).toBe(attachOnce.id)
      expect(attachAgain.position).toBe(attachOnce.position)

      const rows = await db
        .select()
        .from(tripDocumentOccurrenceAttachments)
        .where(eq(tripDocumentOccurrenceAttachments.occurrenceId, occurrence.id))
      expect(rows).toHaveLength(2)
    },
  )

  testWithPostgres(
    'nenhum stored_objects de origem WhatsApp nasce com purpose diferente de trip_occurrence_attachment',
    async () => {
      const db = requireDatabase()
      const world = await seedRoutePlannedTripWithOneDocument(db)
      const occurrenceTypeId = await seedOperatorSeparationOccurrenceType(db, world.companyId)
      const scenario = await buildScenario(db, world.companyId)

      await scenario.deps.registerOccurrence({
        actorUserId: world.userId,
        attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
        companyId: world.companyId,
        documentId: world.documentId,
        note: '',
        occurrenceTypeId,
        tripId: world.tripId,
      })

      /** `fakeAttachmentStorage` não escreve em `stored_objects` (dublê de bytes) — a prova real é
       * a própria transação de `persistSeparationOccurrenceWithAttachment`, que grava a linha do
       * objeto na mesma transação da ocorrência: qualquer purpose que não seja
       * `trip_occurrence_attachment` aqui seria regressão de T13/T15/T1. */
      /** A empresa também tem o `stored_objects` do XML da NF-e semeado por
       * `seedRoutePlannedTripWithOneDocument` (purpose `nfe_document`) — filtrar por
       * `trip_occurrence%` é o que isola os objetos que ESTA task criou. */
      const purposes = await db
        .select({ purpose: storedObjects.purpose })
        .from(storedObjects)
        .where(like(storedObjects.purpose, 'trip_occurrence%'))
      expect(purposes.length).toBeGreaterThan(0)
      for (const row of purposes) {
        expect(row.purpose).toBe('trip_occurrence_attachment')
      }
    },
  )

  testWithPostgres(
    'a reentrega do mesmo webhook é barrada pelo nonceStore — não processa duas vezes',
    async () => {
      const db = requireDatabase()
      const world = await seedRoutePlannedTripWithOneDocument(db)
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

      const repeatedMessageId = `wamid.repeat-${crypto.randomUUID()}`
      await scenario.receive({
        from: world.phone,
        id: repeatedMessageId,
        text: { body: 'oi' },
        type: 'text',
      })
      const sentAfterFirst = scenario.sentMessages().length

      /** Mesmo `id` de mensagem — a Meta reentrega o mesmo webhook (rede instável, retry). */
      await scenario.receive({
        from: world.phone,
        id: repeatedMessageId,
        text: { body: 'oi' },
        type: 'text',
      })
      const sentAfterSecond = scenario.sentMessages().length

      expect(sentAfterSecond).toBe(sentAfterFirst)
    },
  )

  testWithPostgres('nenhum log carrega mediaId, telefone ou o media-id como chave', async () => {
    const db = requireDatabase()
    const world = await seedRoutePlannedTripWithOneDocument(db)
    const occurrenceTypeId = await seedOperatorSeparationOccurrenceType(db, world.companyId)
    const scenario = await buildScenario(db, world.companyId)

    await scenario.deps.registerOccurrence({
      actorUserId: world.userId,
      attachment: { bytes: JPEG_BYTES, mimeType: 'image/jpeg' },
      companyId: world.companyId,
      documentId: world.documentId,
      note: '',
      occurrenceTypeId,
      tripId: world.tripId,
    })

    const serializedLog = JSON.stringify(scenario.logged)
    expect(serializedLog).not.toContain(world.phone)
    expect(serializedLog.toLowerCase()).not.toContain('mediaid')
  })
})

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
