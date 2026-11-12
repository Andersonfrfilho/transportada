/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.7 contra o Postgres: a etapa `idle` ("sem evento"). A varredura ancora o lembrete no despacho da viagem
 * (nenhum evento) ou na baixa que fechou a parada anterior, fecha com qualquer evento da viagem, e a entrega renderiza
 * as duas variantes exatamente, com a menção e o bloco da parada.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../src/database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../src/database/driver-stop-reminder.schema.js'
import { fleetDriverWhatsappGroups, fleetDrivers } from '../../src/database/fleet.schema.js'
import { tripDispatchSnapshots, tripStops } from '../../src/database/trip.schema.js'
import { createDeliverDriverStopReminderUseCase } from '../../src/driver-stop-reminders/application/deliver-driver-stop-reminder.use-case.js'
import { createReconcileIdleDriverStopRemindersUseCase } from '../../src/driver-stop-reminders/application/reconcile-idle-driver-stop-reminders.use-case.js'
import { createCurrentDriverNumberReader } from '../../src/driver-stop-reminders/infrastructure/current-trip-driver.query.js'
import { DrizzleDriverStopReminderDeliveryRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-delivery.repository.js'
import { DrizzleDriverStopReminderIdleReconciliationRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-idle-reconciliation.repository.js'
import { DrizzleDriverStopReminderRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder.repository.js'
import { createGroupStopReminderSender } from '../../src/driver-stop-reminders/infrastructure/group-stop-reminder-sender.gateway.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import { CATALOG_BOT_SPEECH } from '../../src/whatsapp-commands/application/whatsapp-bot-speech.service.js'
import type { DriverOpenQuestions } from '../../src/whatsapp-commands/domain/driver-open-question.policy.js'
import { createWhatsAppStopCardReader } from '../../src/whatsapp-commands/infrastructure/whatsapp-stop-card.reader.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const GROUP = '120363000000000001@g.us'
const DRIVER_WHATSAPP = '5516999990001'
const FREE: DriverOpenQuestions = {
  hasOpenCollection: false,
  hasOpenGroupRequest: false,
  hasOpenStopChoice: false,
  hasPendingAudio: false,
  hasPendingPrompt: false,
}
// Sábado 2026-11-07, 14:00 em São Paulo; o despacho foi às 12:00 e a baixa anterior às 12:30 locais.
const NOW = new Date('2026-11-07T17:00:00.000Z')
const DISPATCHED_AT = new Date('2026-11-07T15:00:00.000Z')
const BAIXA_AT = new Date('2026-11-07T15:30:00.000Z')
const MINUTE = 60_000

type World = Readonly<{ company: Company; database: TestDatabase; trip: SeededTrip }>

async function seedWorld(
  database: TestDatabase,
  status: Parameters<typeof seedTrip>[2] = 'on_delivery_route',
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, status)
  await database.db
    .update(fleetDrivers)
    .set({ phone: '16999990001' })
    .where(eq(fleetDrivers.id, company.firstDriverId))
  await database.db.insert(fleetDriverWhatsappGroups).values({
    companyId: company.companyId,
    driverId: company.firstDriverId,
    groupJid: GROUP,
  })
  await database.db
    .insert(companyDriverReminderSettings)
    .values({ companyId: company.companyId, enabled: true })
  await database.db.insert(tripDispatchSnapshots).values({
    actorUserId: company.userId,
    companyId: company.companyId,
    dispatchedAt: DISPATCHED_AT,
    snapshot: { stops: [] },
    snapshotSha256: 'a'.repeat(64),
    tripId: trip.tripId,
  })
  return { company, database, trip }
}

function reconcile(world: World) {
  return createReconcileIdleDriverStopRemindersUseCase({
    isEnabled: true,
    reconciliation: new DrizzleDriverStopReminderIdleReconciliationRepository(world.database.db),
    reminders: new DrizzleDriverStopReminderRepository(world.database.db),
  }).execute({ companyId: world.company.companyId })
}

const readReminders = (world: World) =>
  world.database.db
    .select()
    .from(driverStopReminders)
    .where(eq(driverStopReminders.companyId, world.company.companyId))

async function addCompletedStop(world: World, sequence: bigint) {
  const stopId = crypto.randomUUID()
  await world.database.db.insert(tripStops).values({
    addressKey: `3550308|01001000|${stopId}`,
    arrivedAt: BAIXA_AT,
    companyId: world.company.companyId,
    completedAt: BAIXA_AT,
    id: stopId,
    label: 'Baixada, 1',
    sequence,
    tripId: world.trip.tripId,
  })
  return stopId
}

function buildDelivery(world: World) {
  const sent: { body: string; mentionNumber?: string | undefined; number: string }[] = []
  const opened: { readonly idleVariant?: string | undefined; readonly stage: string }[] = []
  const useCase = createDeliverDriverStopReminderUseCase({
    clock: () => NOW,
    driverOpenQuestions: { read: async () => FREE },
    isEnabled: true,
    promptOpener: {
      discard: async () => undefined,
      hasOwnOpen: async () => false,
      open: async (params) => void opened.push(params),
    },
    repository: new DrizzleDriverStopReminderDeliveryRepository(world.database.db),
    sender: createGroupStopReminderSender({
      readCurrentDriverNumber: createCurrentDriverNumberReader(world.database.db),
      sendText: async (input) => {
        sent.push(input)
        return { providerMessageId: `provider-${sent.length}` }
      },
    }),
    speech: CATALOG_BOT_SPEECH,
    stopCards: createWhatsAppStopCardReader({
      database: world.database.db,
      listActiveTrips: (input) =>
        new DrizzleCurrentDriverTripRepository(world.database.db).listActiveTrips(input),
    }),
  })
  return { opened, sent, useCase }
}

async function deliverIdle(world: World) {
  const [reminder] = await readReminders(world)
  if (reminder === undefined) throw new Error('EXPECTED_REMINDER')
  const delivery = buildDelivery(world)
  const result = await delivery.useCase.execute({
    companyId: world.company.companyId,
    reminderId: reminder.id,
  })
  return { ...delivery, result }
}

describe('a varredura da etapa idle contra o Postgres (spec 299 T2.7)', () => {
  testWithPostgres(
    'viagem na rua sem nenhum evento: idle na primeira parada, ancorado no despacho',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        expect(await reconcile(world)).toEqual({ openedCount: 1 })
        const rows = await readReminders(world)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          anchorAt: DISPATCHED_AT,
          driverId: world.company.firstDriverId,
          stage: 'idle',
          status: 'pending',
          tripStopId: world.trip.stopId,
        })
        expect(rows[0]?.dueAt).toEqual(new Date(DISPATCHED_AT.getTime() + 30 * MINUTE))
        expect(await reconcile(world)).toEqual({ openedCount: 0 })
      })
    },
  )

  testWithPostgres(
    'viagem despachada sem "Iniciar rota" (emenda 2026-11-10): idle na primeira parada, ancorado no despacho',
    async () => {
      await withDisposableDatabase(async (database) => {
        for (const status of ['dispatched', 'in_transit'] as const) {
          const world = await seedWorld(database, status)

          expect(await reconcile(world)).toEqual({ openedCount: 1 })
          const rows = await readReminders(world)
          expect(rows).toHaveLength(1)
          expect(rows[0]).toMatchObject({
            anchorAt: DISPATCHED_AT,
            driverId: world.company.firstDriverId,
            stage: 'idle',
            status: 'pending',
            tripStopId: world.trip.stopId,
          })
          expect(rows[0]?.dueAt).toEqual(new Date(DISPATCHED_AT.getTime() + 30 * MINUTE))
          expect(await reconcile(world)).toEqual({ openedCount: 0 })
        }
      })
    },
  )

  testWithPostgres(
    'viagem que ainda não saiu do barracão ou já terminou: nenhum idle',
    async () => {
      await withDisposableDatabase(async (database) => {
        for (const status of ['loading', 'completed', 'cancelled'] as const) {
          const world = await seedWorld(database, status)
          expect(await reconcile(world)).toEqual({ openedCount: 0 })
          expect(await readReminders(world)).toEqual([])
        }
      })
    },
  )

  testWithPostgres('depois da baixa da parada 1, o idle da parada 2 ancora na baixa', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await database.db
        .update(tripStops)
        .set({ arrivedAt: BAIXA_AT, completedAt: BAIXA_AT })
        .where(eq(tripStops.id, world.trip.stopId))
      const secondStopId = crypto.randomUUID()
      await database.db.insert(tripStops).values({
        addressKey: `3550308|01001000|${secondStopId}`,
        companyId: world.company.companyId,
        id: secondStopId,
        label: 'Segunda, 2',
        sequence: 2n,
        tripId: world.trip.tripId,
      })

      expect(await reconcile(world)).toEqual({ openedCount: 1 })
      expect((await readReminders(world))[0]).toMatchObject({
        anchorAt: BAIXA_AT,
        stage: 'idle',
        tripStopId: secondStopId,
      })
    })
  })

  testWithPostgres(
    'parada a caminho, parada com chegada ou todas fechadas: nenhum idle',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        await database.db
          .update(tripStops)
          .set({ enRouteSince: NOW })
          .where(eq(tripStops.id, world.trip.stopId))
        expect(await reconcile(world)).toEqual({ openedCount: 0 })

        await database.db
          .update(tripStops)
          .set({ arrivedAt: NOW, enRouteSince: null })
          .where(eq(tripStops.id, world.trip.stopId))
        expect(await reconcile(world)).toEqual({ openedCount: 0 })

        await database.db
          .update(tripStops)
          .set({ completedAt: NOW })
          .where(eq(tripStops.id, world.trip.stopId))
        expect(await reconcile(world)).toEqual({ openedCount: 0 })
        expect(await readReminders(world)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'idle fechado ou escalado do mesmo ciclo não reabre; empresa desligada não abre',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        await reconcile(world)
        await database.db
          .update(driverStopReminders)
          .set({ closedAt: NOW, closedReason: 'superseded', status: 'cancelled' })
          .where(eq(driverStopReminders.companyId, world.company.companyId))
        expect(await reconcile(world)).toEqual({ openedCount: 0 })

        const off = await seedWorld(database)
        await database.db
          .update(companyDriverReminderSettings)
          .set({ enabled: false })
          .where(eq(companyDriverReminderSettings.companyId, off.company.companyId))
        expect(await reconcile(off)).toEqual({ openedCount: 0 })
      })
    },
  )
})

describe('a entrega da etapa idle contra o Postgres (spec 299 T2.7)', () => {
  testWithPostgres('variante A: viagem sem nenhum evento', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await reconcile(world)
      await database.db
        .update(driverStopReminders)
        .set({ dueAt: new Date(NOW.getTime() - MINUTE) })
        .where(eq(driverStopReminders.companyId, world.company.companyId))

      const { opened, result, sent } = await deliverIdle(world)

      expect(result.outcome).toBe('sent')
      expect(opened).toMatchObject([{ idleVariant: 'start', stage: 'idle' }])
      expect(sent[0]).toMatchObject({ mentionNumber: DRIVER_WHATSAPP, number: GROUP })
      const body = sent[0]?.body ?? ''
      const noteNumber = /\*NF (\d+)\*/u.exec(body)?.[1]
      expect(body).toBe(
        [
          `@${DRIVER_WHATSAPP} 👋 E aí, Motorista Um, como estamos? Vamos iniciar a rota?`,
          'Pelo roteiro, a primeira é esta parada:',
          '',
          '*Parada 1 de 1*',
          `*NF ${noteNumber}* · R$ 10.000,00`,
          '📍 Centro, 100',
          '',
          '*1* - Iniciar a rota por esta parada',
          '*2* - Vou começar por outra parada',
          '*3* - Ainda não vou sair',
        ].join('\n'),
      )
    })
  })

  testWithPostgres('variante A também na viagem só despachada (emenda 2026-11-10)', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, 'dispatched')
      await reconcile(world)
      await database.db
        .update(driverStopReminders)
        .set({ dueAt: new Date(NOW.getTime() - MINUTE) })
        .where(eq(driverStopReminders.companyId, world.company.companyId))

      const { opened, result, sent } = await deliverIdle(world)

      expect(result.outcome).toBe('sent')
      expect(opened).toMatchObject([{ idleVariant: 'start', stage: 'idle' }])
      expect(sent[0]).toMatchObject({ mentionNumber: DRIVER_WHATSAPP, number: GROUP })
      expect(sent[0]?.body).toContain('Vamos iniciar a rota?')
      expect(sent[0]?.body).toContain('*1* - Iniciar a rota por esta parada')
    })
  })

  testWithPostgres('variante B: rota em andamento, já houve baixa', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await addCompletedStop(world, 2n)
      await reconcile(world)
      await database.db
        .update(driverStopReminders)
        .set({ dueAt: new Date(NOW.getTime() - MINUTE) })
        .where(eq(driverStopReminders.companyId, world.company.companyId))

      const { opened, result, sent } = await deliverIdle(world)

      expect(result.outcome).toBe('sent')
      expect(opened).toMatchObject([{ idleVariant: 'route', stage: 'idle' }])
      const body = sent[0]?.body ?? ''
      const noteNumber = /\*NF (\d+)\*/u.exec(body)?.[1]
      expect(body).toBe(
        [
          `@${DRIVER_WHATSAPP} 👋 E aí, Motorista Um, como estamos?`,
          'Pelo roteiro, a próxima é esta parada:',
          '',
          '*Parada 1 de 2*',
          `*NF ${noteNumber}* · R$ 10.000,00`,
          '📍 Centro, 100',
          '',
          'Quer registrar um evento?',
          '*1* - Saí para esta parada',
          '*2* - Já cheguei',
          '*3* - Já entreguei (mande a foto do canhoto)',
          '*4* - Tive um problema (abrir ocorrência)',
          '*5* - Ainda não saí',
        ].join('\n'),
      )
    })
  })

  testWithPostgres('idle cuja parada já saiu fecha sem enviar; pergunta aberta adia', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await reconcile(world)
      const [reminder] = await readReminders(world)
      const open = buildDelivery(world)
      const gated = createDeliverDriverStopReminderUseCase({
        clock: () => NOW,
        driverOpenQuestions: { read: async () => ({ ...FREE, hasPendingPrompt: true }) },
        isEnabled: true,
        promptOpener: {
          discard: async () => undefined,
          hasOwnOpen: async () => false,
          open: async () => undefined,
        },
        repository: new DrizzleDriverStopReminderDeliveryRepository(world.database.db),
        sender: { send: async () => ({ providerMessageId: 'x' }) },
        speech: CATALOG_BOT_SPEECH,
      })
      await database.db
        .update(driverStopReminders)
        .set({ dueAt: new Date(NOW.getTime() - MINUTE) })
        .where(eq(driverStopReminders.companyId, world.company.companyId))
      const deferred = await gated.execute({
        companyId: world.company.companyId,
        reminderId: reminder?.id ?? '',
      })
      expect(deferred.outcome).toBe('deferred')

      await database.db
        .update(tripStops)
        .set({ enRouteSince: NOW })
        .where(eq(tripStops.id, world.trip.stopId))
      const closed = await open.useCase.execute({
        companyId: world.company.companyId,
        reminderId: reminder?.id ?? '',
      })
      expect(closed.outcome).toBe('closed')
      expect(open.sent).toEqual([])
    })
  })
})
