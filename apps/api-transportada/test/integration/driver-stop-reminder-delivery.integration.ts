/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.2 contra o Postgres: a entrega do lembrete vencido lê a parada de verdade, reserva a tentativa por
 * `version` (duas entregas, um envio), respeita horário, pergunta aberta e vaga, fecha se a parada andou e nunca
 * entrega lembrete de outra empresa.
 */
import { describe, expect } from 'bun:test'
import { and, eq, sql } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../src/database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../src/database/driver-stop-reminder.schema.js'
import { fleetDriverWhatsappGroups, fleetDrivers } from '../../src/database/fleet.schema.js'
import { tripStops } from '../../src/database/trip.schema.js'
import { whatsappEvolutionSettings } from '../../src/database/whatsapp-evolution.schema.js'
import { createDeliverDriverStopReminderUseCase } from '../../src/driver-stop-reminders/application/deliver-driver-stop-reminder.use-case.js'
import { DriverStopReminderNotFoundError } from '../../src/driver-stop-reminders/domain/driver-stop-reminder.error.js'
import { createCurrentDriverNumberReader } from '../../src/driver-stop-reminders/infrastructure/current-trip-driver.query.js'
import { DrizzleDriverStopReminderDeliveryRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-delivery.repository.js'
import { createGroupStopReminderSender } from '../../src/driver-stop-reminders/infrastructure/group-stop-reminder-sender.gateway.js'
import { createDriverStopReminderRuntime } from '../../src/driver-stop-reminders/infrastructure/driver-stop-reminder.runtime.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import type { DriverOpenQuestions } from '../../src/whatsapp-commands/domain/driver-open-question.policy.js'
import {
  FAKE_ENVELOPE,
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const GROUP = '120363000000000001@g.us'
const DRIVER_PHONE = '16999990001'
const DRIVER_WHATSAPP = '5516999990001'
const FREE: DriverOpenQuestions = {
  hasOpenCollection: false,
  hasOpenGroupRequest: false,
  hasOpenStopChoice: false,
  hasPendingAudio: false,
  hasPendingPrompt: false,
}
// Sábado 2026-11-07, 14:00 em São Paulo.
const NOW = new Date('2026-11-07T17:00:00.000Z')

type World = Readonly<{
  company: Company
  database: TestDatabase
  trip: SeededTrip
}>

type Sent = { body: string; mentionNumber?: string | undefined; number: string }

async function seedWorld(database: TestDatabase): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, 'dispatched')
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  await database.db
    .update(fleetDrivers)
    .set({ phone: DRIVER_PHONE })
    .where(eq(fleetDrivers.id, company.firstDriverId))
  await database.db.insert(fleetDriverWhatsappGroups).values({
    companyId: company.companyId,
    driverId: company.firstDriverId,
    groupJid: GROUP,
  })
  await database.db
    .insert(companyDriverReminderSettings)
    .values({ companyId: company.companyId, enabled: true })
  const runtime = createDriverStopReminderRuntime({
    database: database.db,
    readDepot: async () => ({ reason: 'not_configured', status: 'absent' }),
  })
  await reportStopDeparture({
    actorUserId: driverUserId,
    companyId: company.companyId,
    driverId: company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    location: null,
    now: new Date('2026-11-07T15:00:00.000Z'),
    stopId: trip.stopId,
    tappedAt: new Date('2026-11-07T15:00:00.000Z'),
    unitOfWork: new DrizzleDriverFieldReportUnitOfWork(
      database.db,
      'test-bucket',
      undefined,
      runtime,
    ),
  })
  await runtime.idle()
  return { company, database, trip }
}

async function readReminder(world: World) {
  const [row] = await world.database.db
    .select()
    .from(driverStopReminders)
    .where(eq(driverStopReminders.tripId, world.trip.tripId))
  if (row === undefined) throw new Error('EXPECTED_REMINDER')
  return row
}

function build(world: World, options: { questions?: Partial<DriverOpenQuestions> } = {}) {
  const sent: Sent[] = []
  const useCase = createDeliverDriverStopReminderUseCase({
    clock: () => NOW,
    driverOpenQuestions: { read: async () => ({ ...FREE, ...options.questions }) },
    isEnabled: true,
    promptOpener: { discard: async () => undefined, open: async () => undefined },
    repository: new DrizzleDriverStopReminderDeliveryRepository(world.database.db),
    sender: createGroupStopReminderSender({
      readCurrentDriverNumber: createCurrentDriverNumberReader(world.database.db),
      sendText: async (input) => {
        sent.push(input)
        return { providerMessageId: `provider-${sent.length}` }
      },
    }),
    speech: CATALOG_BOT_SPEECH,
  })
  return { sent, useCase }
}

async function deliverReminder(world: World, useCase: ReturnType<typeof build>['useCase']) {
  const reminder = await readReminder(world)
  return useCase.execute({ companyId: world.company.companyId, reminderId: reminder.id })
}

async function expectUntouched(world: World, attempts = 0) {
  const row = await readReminder(world)
  expect(row).toMatchObject({ attempts, lastSentAt: null, status: 'pending' })
}

describe('a entrega do lembrete contra o Postgres (spec 299 T2.2)', () => {
  testWithPostgres('envia no grupo marcando o motorista atual e grava a tentativa', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { sent, useCase } = build(world)

      const result = await deliverReminder(world, useCase)

      expect(result).toEqual({
        nextDueAt: new Date(NOW.getTime() + 30 * 60_000),
        outcome: 'sent',
      })
      expect(sent).toHaveLength(1)
      expect(sent[0]).toMatchObject({ mentionNumber: DRIVER_WHATSAPP, number: GROUP })
      const lines = sent[0]?.body.split('\n') ?? []
      expect(lines[0]).toMatch(
        new RegExp(`^@${DRIVER_WHATSAPP} 👋 Oi, Motorista Um! Já chegou na \\*NF \\d+ · \\*\\?$`),
      )
      expect(lines.slice(1)).toEqual([
        'Saída às *12:00*',
        '*1* - Cheguei',
        '*2* - Já entreguei (mande a foto do canhoto)',
        '*3* - Tive um problema (abrir ocorrência)',
        '*4* - Ainda estou a caminho',
      ])
      const row = await readReminder(world)
      expect(row).toMatchObject({
        attempts: 1,
        dispatchingUntil: null,
        lastChannel: 'group',
        lastProviderMessageId: 'provider-1',
        status: 'pending',
      })
      expect(row.lastSentAt?.toISOString()).toBe(NOW.toISOString())
      expect(row.dueAt.toISOString()).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString())
    })
  })

  testWithPostgres('marca o motorista atual depois da troca de tripulação', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await database.db
        .update(fleetDrivers)
        .set({ phone: '16988880002' })
        .where(eq(fleetDrivers.id, world.company.secondDriverId))
      await database.db.insert(fleetDriverWhatsappGroups).values({
        companyId: world.company.companyId,
        driverId: world.company.secondDriverId,
        groupJid: '120363000000000002@g.us',
      })
      await database.db.execute(
        sql`update trip_drivers set position = case driver_id when ${world.company.secondDriverId}::uuid then 3 else 5 end where trip_id = ${world.trip.tripId}::uuid`,
      )
      const { sent, useCase } = build(world)

      await deliverReminder(world, useCase)

      expect(sent[0]).toMatchObject({
        mentionNumber: '5516988880002',
        number: '120363000000000002@g.us',
      })
      expect(sent[0]?.body).toContain('Oi, Motorista Dois!')
    })
  })

  testWithPostgres('fora do horário de funcionamento adia para a próxima abertura', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await database.db
        .update(companyDriverReminderSettings)
        .set({ operatingHours: [{ end: '18:00', start: '08:00', weekday: 1 }] })
        .where(eq(companyDriverReminderSettings.companyId, world.company.companyId))
      const { sent, useCase } = build(world)

      const result = await deliverReminder(world, useCase)

      expect(result).toEqual({
        nextDueAt: new Date('2026-11-09T11:00:00.000Z'),
        outcome: 'deferred',
      })
      expect(sent).toEqual([])
      const row = await readReminder(world)
      expect(row.dueAt.toISOString()).toBe('2026-11-09T11:00:00.000Z')
      expect(row.attempts).toBe(0)
    })
  })

  testWithPostgres('pedido aberto do grupo adia 5 minutos sem consumir tentativa', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { sent, useCase } = build(world, { questions: { hasOpenGroupRequest: true } })

      const result = await deliverReminder(world, useCase)

      expect(result).toEqual({
        nextDueAt: new Date(NOW.getTime() + 5 * 60_000),
        outcome: 'deferred',
      })
      expect(sent).toEqual([])
      expect((await readReminder(world)).attempts).toBe(0)
    })
  })

  testWithPostgres('vaga do Evolution adiante adia para a vaga', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const slot = new Date(NOW.getTime() + 10 * 60_000)
      await database.db.insert(whatsappEvolutionSettings).values({
        baseUrl: 'https://evolution.example.test',
        companyId: world.company.companyId,
        instanceName: 'transportada-test',
        nextSendAt: slot,
        secretEnvelope: FAKE_ENVELOPE,
      })
      const { sent, useCase } = build(world)

      const result = await deliverReminder(world, useCase)

      expect(result).toEqual({ nextDueAt: slot, outcome: 'deferred' })
      expect(sent).toEqual([])
      await expectUntouched(world)
    })
  })

  testWithPostgres('fecha sem enviar quando a parada já andou', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await database.db
        .update(tripStops)
        .set({
          arrivedAt: new Date('2026-11-07T16:00:00.000Z'),
          enRouteSince: null,
          enRouteTappedAt: null,
        })
        .where(eq(tripStops.id, world.trip.stopId))
      const { sent, useCase } = build(world)

      const result = await deliverReminder(world, useCase)

      expect(result).toEqual({ nextDueAt: null, outcome: 'closed' })
      expect(sent).toEqual([])
      expect(await readReminder(world)).toMatchObject({ closedReason: 'arrived', status: 'closed' })
    })
  })

  testWithPostgres('duas entregas ao mesmo tempo enviam uma vez', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { sent, useCase } = build(world)
      const reminder = await readReminder(world)
      const params = { companyId: world.company.companyId, reminderId: reminder.id }

      const results = await Promise.all([useCase.execute(params), useCase.execute(params)])

      expect(sent).toHaveLength(1)
      expect(results.map((result) => result.outcome).sort()).toEqual(['deferred', 'sent'])
      expect((await readReminder(world)).attempts).toBe(1)
    })
  })

  testWithPostgres(
    'depois da última tentativa sem resposta fica escalado, sem enviar',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        await database.db
          .update(driverStopReminders)
          .set({ attempts: 3 })
          .where(eq(driverStopReminders.tripId, world.trip.tripId))
        const { sent, useCase } = build(world)

        const result = await deliverReminder(world, useCase)

        expect(result).toEqual({ nextDueAt: null, outcome: 'escalated' })
        expect(sent).toEqual([])
        const row = await readReminder(world)
        expect(row.status).toBe('escalated')
        expect(row.escalatedAt?.toISOString()).toBe(NOW.toISOString())
      })
    },
  )

  testWithPostgres('lembrete de outra empresa é 404 e nada é enviado nem alterado', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const other = await seedCompany(database)
      const { sent, useCase } = build(world)
      const reminder = await readReminder(world)

      await expect(
        useCase.execute({ companyId: other.companyId, reminderId: reminder.id }),
      ).rejects.toBeInstanceOf(DriverStopReminderNotFoundError)

      expect(sent).toEqual([])
      await expectUntouched(world)
      expect(
        await database.db
          .select({ id: driverStopReminders.id })
          .from(driverStopReminders)
          .where(
            and(eq(driverStopReminders.id, reminder.id), eq(driverStopReminders.status, 'pending')),
          ),
      ).toHaveLength(1)
    })
  })
})
