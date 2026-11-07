/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.3 contra o Postgres, pelo caminho real de entrada do grupo (evento do Evolution → entrada do grupo →
 * sessão do pedido → roteador → registro): o lembrete entregue abre o pedido no passo `reminder.stage`; "1" registra a
 * chegada pelo mesmo "cheguei" e o lembrete fecha; "4" adia sem consumir tentativa e, esgotados os 3, conta como sem
 * resposta; "cancelar" fecha o passo e o lembrete segue o relógio.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../src/database/company-driver-reminder-settings.schema.js'
import { runAllDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { driverStopReminders } from '../../src/database/driver-stop-reminder.schema.js'
import { fleetDriverWhatsappGroups } from '../../src/database/fleet.schema.js'
import { whatsappGroupRequests } from '../../src/database/whatsapp-group-request.schema.js'
import { createDeliverDriverStopReminderUseCase } from '../../src/driver-stop-reminders/application/deliver-driver-stop-reminder.use-case.js'
import { createPostponeDriverStopReminderUseCase } from '../../src/driver-stop-reminders/application/postpone-driver-stop-reminder.use-case.js'
import { createDriverNumberReader } from '../../src/driver-stop-reminders/infrastructure/current-trip-driver.query.js'
import { createDriverStopReminderRuntime } from '../../src/driver-stop-reminders/infrastructure/driver-stop-reminder.runtime.js'
import { DrizzleDriverStopReminderDeliveryRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-delivery.repository.js'
import { DrizzleDriverStopReminderPostponementRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-postponement.repository.js'
import { createGroupReminderPromptOpener } from '../../src/driver-stop-reminders/infrastructure/group-reminder-prompt-opener.js'
import { createStopNoteNumberReader } from '../../src/driver-stop-reminders/infrastructure/stop-note-number.query.js'
import type { ApiLogger } from '../../src/shared/api.types.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import { createWhatsAppTurnReplies } from '../../src/whatsapp-commands/application/whatsapp-turn-replies.service.js'
import { createEvolutionGroupIdentity } from '../../src/whatsapp/application/evolution-group-identity.service.js'
import {
  createEvolutionGroupInbound,
  type EvolutionMessageEvent,
} from '../../src/whatsapp/application/evolution-group-inbound.service.js'
import { createGroupDriverFlow } from '../../src/whatsapp/application/whatsapp-group-driver-flow.service.js'
import { createGroupReminderFlow } from '../../src/whatsapp/application/whatsapp-group-reminder-flow.service.js'
import { createWhatsAppGroupRequestSessions } from '../../src/whatsapp/application/whatsapp-group-request.service.js'
import { createGroupStopFlow } from '../../src/whatsapp/application/whatsapp-group-stop-flow.service.js'
import { createDrizzleWhatsAppGroupRequestRepository } from '../../src/whatsapp/infrastructure/drizzle-whatsapp-group-request.repository.js'
import { createEvolutionGroupReplySender } from '../../src/whatsapp/infrastructure/evolution-group-reply.gateway.js'
import { createGroupStopPorts } from '../../src/whatsapp/infrastructure/whatsapp-group-stop.adapter.js'
import { withDisposableDatabase } from '../fixtures/disposable-database.fixture.js'
import {
  readJourneyEvents,
  seedJourneyTrip,
  type JourneyDatabase,
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
const CLOSED_QUESTIONS = {
  hasOpenCollection: false,
  hasOpenGroupRequest: false,
  hasOpenStopChoice: false,
  hasPendingAudio: false,
  hasPendingPrompt: false,
}

async function build(db: JourneyDatabase, world: JourneyWorld) {
  await db
    .insert(companyDriverReminderSettings)
    .values({ companyId: world.companyId, enabled: true })
  await db
    .insert(fleetDriverWhatsappGroups)
    .values({ companyId: world.companyId, driverId: world.driverId, groupJid: GROUP })
  const runtime = createDriverStopReminderRuntime({
    database: db,
    readDepot: async () => ({ reason: 'not_configured', status: 'absent' }),
  })
  const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(db, 'test-bucket', undefined, runtime)
  const first = world.stops[0]
  await reportStopDeparture({
    actorUserId: world.userId,
    channel: TRIP_FIELD_CHANNELS.whatsapp,
    companyId: world.companyId,
    driverId: world.driverId,
    idempotencyKey: crypto.randomUUID(),
    location: null,
    now: new Date(),
    stopId: first.stopId,
    tappedAt: new Date(),
    unitOfWork,
  })
  await runtime.idle()

  const requests = createDrizzleWhatsAppGroupRequestRepository(db)
  const reminderSent: string[] = []
  const deliver = createDeliverDriverStopReminderUseCase({
    driverOpenQuestions: { read: async () => CLOSED_QUESTIONS },
    isEnabled: true,
    promptOpener: createGroupReminderPromptOpener({
      clock: () => new Date(),
      readDriverNumber: createDriverNumberReader(db),
      repository: requests,
    }),
    repository: new DrizzleDriverStopReminderDeliveryRepository(db),
    sender: {
      send: async ({ body }) => {
        reminderSent.push(body)
        return { providerMessageId: `reminder-${reminderSent.length}` }
      },
    },
    speech: CATALOG_BOT_SPEECH,
  })
  const postpone = createPostponeDriverStopReminderUseCase({
    repository: new DrizzleDriverStopReminderPostponementRepository(db),
  })

  const trips = new DrizzleCurrentDriverTripRepository(db)
  const crew = async () => ({ kind: 'crew' as const })
  const flow = createGroupDriverFlow({
    occurrence: {
      answer: async () => ({ kind: 'done', replies: ['(ocorrência)'] }),
      initialStep: 'document',
      start: async (turn) => ({ kind: 'done', replies: [`(ocorrência da NF ${turn.text})`] }),
    },
    reminder: createGroupReminderFlow({
      postpone: (input) => postpone.execute(input),
      readNoteNumber: createStopNoteNumberReader(db),
      speech: CATALOG_BOT_SPEECH,
    }),
    stop: createGroupStopFlow(
      createGroupStopPorts({
        consumeLocation: () => null,
        database: db,
        hasLocation: () => true,
        listActiveTrips: (input) => trips.listActiveTrips(input),
        logger,
        ports: {
          reportArrival: (input) =>
            reportStopArrival({
              ...input,
              channel: TRIP_FIELD_CHANNELS.whatsapp,
              now: new Date(),
              unitOfWork,
            }),
          reportDeparture: (input) =>
            reportStopDeparture({
              ...input,
              channel: TRIP_FIELD_CHANNELS.whatsapp,
              now: new Date(),
              unitOfWork,
            }),
        },
        resolveSenderRole: crew,
      }),
    ),
  })
  const sent: string[] = []
  const turns = createWhatsAppTurnReplies()
  const replies = createEvolutionGroupReplySender({
    logger,
    sendText: async ({ body }) => void sent.push(body),
    turnReplies: turns,
  })
  const sessions = createWhatsAppGroupRequestSessions({
    clock: () => new Date(),
    flow,
    logger,
    replies,
    repository: requests,
  })
  const inbound = createEvolutionGroupInbound({
    findGroupDriver: async () => ({ driverId: world.driverId }),
    findOpenRequestOwner: (lookup) => sessions.findOpenOwner(lookup),
    handle: (message) => sessions.handle(message),
    identity: createEvolutionGroupIdentity({
      gateway: { getOwnerNumber: async () => BOT, listGroupParticipants: async () => [] },
    }),
    isGroupDriver: async () => true,
    turnReplies: turns,
  })
  let counter = 0
  async function receive(text: string): Promise<readonly string[]> {
    counter += 1
    const before = sent.length
    const event: EvolutionMessageEvent = {
      chat: 'group',
      externalMessageId: `reminder-step-${world.companyId}-${counter}`,
      from: '',
      fromMe: false,
      groupJid: GROUP,
      mentionedJids: [],
      participant: DRIVER_PHONE,
      pushName: 'Motorista Jornada',
      replyToExternalMessageId: null,
      text,
      timestamp: Math.floor(Date.now() / 1000),
      type: 'message',
    }
    await inbound.receive({
      audio: null,
      companyId: world.companyId,
      connection: async () => CONNECTION,
      event,
      media: null,
      senderLid: null,
    })
    await replies.idle()
    return sent.slice(before)
  }
  const reminder = async () => {
    const [row] = await db
      .select()
      .from(driverStopReminders)
      .where(eq(driverStopReminders.tripId, world.tripId))
    if (row === undefined) throw new Error('EXPECTED_REMINDER')
    return row
  }
  const request = async () => {
    const rows = await db
      .select()
      .from(whatsappGroupRequests)
      .where(eq(whatsappGroupRequests.companyId, world.companyId))
    return rows.at(-1)
  }
  const deliverNow = async () =>
    deliver.execute({ companyId: world.companyId, reminderId: (await reminder()).id })
  return { deliverNow, receive, reminder, reminderSent, request }
}

async function inDatabase(operation: (db: JourneyDatabase) => Promise<void>): Promise<void> {
  if (databaseUrl === undefined) return
  await withDisposableDatabase({
    adminUrl: databaseUrl,
    migrate: (connection) => runAllDatabaseMigrations({ connectionString: connection }),
    namePrefix: 'transportada_reminder_group_step',
    open: (connection) => createDrizzleProvider({ connection }),
    operation: async (database) => operation(database.db),
  })
}

describe('passo reminder.stage pelo caminho real do grupo (spec 299 T2.3, Postgres)', () => {
  testWithPostgres(
    'lembrete entregue abre o pedido; "1" registra a chegada e fecha o lembrete',
    async () => {
      await inDatabase(async (db) => {
        const world = await seedJourneyTrip(db, { driverPhone: '16988887777' })
        const harness = await build(db, world)
        expect(await harness.deliverNow()).toMatchObject({ outcome: 'sent' })

        expect(await harness.request()).toMatchObject({
          ownerNumber: DRIVER_PHONE,
          state: {
            reminderId: (await harness.reminder()).id,
            stage: 'arrival',
            tripStopId: world.stops[0].stopId,
          },
          status: 'open',
          step: 'reminder.stage',
        })

        const answered = await harness.receive('1')

        expect(answered.join('\n')).toContain('Chegada registrada')
        expect(await readJourneyEvents(db, world)).toContain('parada 1: arrived')
        expect(await harness.reminder()).toMatchObject({
          closedReason: 'arrived',
          status: 'closed',
        })
        expect(await harness.request()).toMatchObject({ status: 'completed' })
      })
    },
    120_000,
  )

  testWithPostgres(
    '"4" adia sem consumir tentativa, três vezes; a quarta conta como sem resposta',
    async () => {
      await inDatabase(async (db) => {
        const world = await seedJourneyTrip(db, { driverPhone: '16988887777' })
        const harness = await build(db, world)

        for (const postponements of [1, 2, 3]) {
          await harness.deliverNow()
          expect(await harness.reminder()).toMatchObject({ attempts: 1 })
          const before = (await harness.reminder()).dueAt
          const answered = await harness.receive('4')
          expect(answered).toEqual([
            `@${DRIVER_PHONE} ${await CATALOG_BOT_SPEECH.text({ companyId: world.companyId, key: 'lembreteAdiado' })}`,
          ])
          const row = await harness.reminder()
          expect(row).toMatchObject({ attempts: 0, postponements, status: 'pending' })
          expect(row.dueAt.getTime()).toBeGreaterThan(before.getTime())
          expect(await harness.request()).toMatchObject({ status: 'completed' })
        }

        await harness.deliverNow()
        const answered = await harness.receive('4')
        expect(answered.join('\n')).toContain(
          await CATALOG_BOT_SPEECH.text({
            companyId: world.companyId,
            key: 'lembreteAdiamentoEsgotado',
          }),
        )
        expect(await harness.reminder()).toMatchObject({
          attempts: 1,
          postponements: 3,
          status: 'pending',
        })
        expect(await readJourneyEvents(db, world)).not.toContain('parada 1: arrived')
      })
    },
    120_000,
  )

  testWithPostgres(
    '"cancelar" fecha o passo sem registrar nada e o lembrete segue pendente',
    async () => {
      await inDatabase(async (db) => {
        const world = await seedJourneyTrip(db, { driverPhone: '16988887777' })
        const harness = await build(db, world)
        await harness.deliverNow()
        const before = await harness.reminder()

        const answered = await harness.receive('cancelar')

        expect(answered.join('\n')).toContain('Pedido cancelado')
        expect(await harness.request()).toMatchObject({ status: 'cancelled' })
        const after = await harness.reminder()
        expect(after).toMatchObject({ attempts: 1, postponements: 0, status: 'pending' })
        expect(after.dueAt.getTime()).toBe(before.dueAt.getTime())
        expect(await readJourneyEvents(db, world)).not.toContain('parada 1: arrived')
      })
    },
    120_000,
  )

  testWithPostgres(
    'outro pedido aberto no grupo no meio: a entrega não envia e devolve a reserva',
    async () => {
      await inDatabase(async (db) => {
        const world = await seedJourneyTrip(db, { driverPhone: '16988887777' })
        const harness = await build(db, world)
        await createDrizzleWhatsAppGroupRequestRepository(db).open({
          companyId: world.companyId,
          driverId: world.driverId,
          groupJid: GROUP,
          now: new Date(),
          ownerNumber: DRIVER_PHONE,
          step: 'menu',
        })

        expect(await harness.deliverNow()).toMatchObject({ outcome: 'deferred' })

        expect(harness.reminderSent).toEqual([])
        expect(await harness.reminder()).toMatchObject({
          attempts: 0,
          dispatchingUntil: null,
          lastSentAt: null,
          status: 'pending',
        })
      })
    },
    120_000,
  )
})
