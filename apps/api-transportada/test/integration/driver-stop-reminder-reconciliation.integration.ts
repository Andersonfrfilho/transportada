/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 (dono, 2026-11-07) contra o Postgres: o lembrete segue a viagem ativa. Parada a caminho ou com chegada
 * aberta, sem lembrete, ganha o da etapa atual ancorado no evento; etapa que já teve lembrete para a mesma âncora
 * (de qualquer status) não reabre; chave da empresa desligada e viagem que não está na rua não geram nada.
 */
import { describe, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { companyDriverReminderSettings } from '../../src/database/company-driver-reminder-settings.schema.js'
import { driverStopReminders } from '../../src/database/driver-stop-reminder.schema.js'
import { tripStopEvents, tripStops } from '../../src/database/trip.schema.js'
import { createReconcileDriverStopRemindersUseCase } from '../../src/driver-stop-reminders/application/reconcile-driver-stop-reminders.use-case.js'
import { DrizzleDriverStopReminderReconciliationRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-reconciliation.repository.js'
import { DrizzleDriverStopReminderRepository } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder.repository.js'
import {
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const DEPARTURE = new Date('2026-11-06T22:01:00.000Z')
const DEVICE_TAP = new Date('2026-11-06T22:00:30.000Z')
const ARRIVAL = new Date('2026-11-07T10:00:00.000Z')

async function seedWorld(
  database: TestDatabase,
  options: { enabled?: boolean; tripStatus?: 'dispatched' | 'on_delivery_route' } = {},
): Promise<{ company: Company; trip: SeededTrip }> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, options.tripStatus ?? 'on_delivery_route')
  if (options.enabled !== false) {
    await database.db
      .insert(companyDriverReminderSettings)
      .values({ companyId: company.companyId, enabled: true })
  }
  return { company, trip }
}

const setStop = (
  database: TestDatabase,
  stopId: string,
  values: Partial<typeof tripStops.$inferInsert>,
) => database.db.update(tripStops).set(values).where(eq(tripStops.id, stopId))

function reconcile(database: TestDatabase, companyId: string) {
  return createReconcileDriverStopRemindersUseCase({
    isEnabled: true,
    reconciliation: new DrizzleDriverStopReminderReconciliationRepository(database.db),
    reminders: new DrizzleDriverStopReminderRepository(database.db),
  }).execute({ companyId })
}

async function seedClosedReminder(
  database: TestDatabase,
  params: { company: Company; trip: SeededTrip; stage: 'arrival' | 'settlement'; anchorAt: Date },
) {
  await database.db.insert(driverStopReminders).values({
    anchorAt: params.anchorAt,
    closedAt: new Date(),
    companyId: params.company.companyId,
    driverId: params.company.firstDriverId,
    dueAt: params.anchorAt,
    originKind: 'fallback',
    stage: params.stage,
    status: 'closed',
    tripId: params.trip.tripId,
    tripStopId: params.trip.stopId,
  })
}

const seedStopEvent = (
  database: TestDatabase,
  params: { company: Company; trip: SeededTrip; kind: 'arrived' | 'departed'; createdAt: Date },
) =>
  database.db.insert(tripStopEvents).values({
    actorUserId: params.company.userId,
    companyId: params.company.companyId,
    recordedAt: params.createdAt,
    kind: params.kind,
    occurredAt: new Date(params.createdAt.getTime() - 3 * 3_600_000),
    stopId: params.trip.stopId,
  })

const readReminders = (database: TestDatabase, companyId: string) =>
  database.db.select().from(driverStopReminders).where(eq(driverStopReminders.companyId, companyId))

describe('reconciliação do lembrete com a viagem ativa (spec 299, dono 2026-11-07)', () => {
  testWithPostgres(
    'parada a caminho sem lembrete ganha o `arrival` ancorado na saída',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        await setStop(database, trip.stopId, {
          enRouteSince: DEPARTURE,
          enRouteTappedAt: DEVICE_TAP,
        })

        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 1 })
        const rows = await readReminders(database, company.companyId)
        expect(rows).toHaveLength(1)
        expect(rows[0]).toMatchObject({
          anchorAt: DEVICE_TAP,
          driverId: company.firstDriverId,
          stage: 'arrival',
          status: 'pending',
          tripId: trip.tripId,
          tripStopId: trip.stopId,
        })
        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })
        expect(await readReminders(database, company.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres('sem toque do aparelho, a âncora é a hora da saída no servidor', async () => {
    await withDisposableDatabase(async (database) => {
      const { company, trip } = await seedWorld(database)
      await setStop(database, trip.stopId, { enRouteSince: DEPARTURE })
      await reconcile(database, company.companyId)
      expect((await readReminders(database, company.companyId))[0]?.anchorAt).toEqual(DEPARTURE)
    })
  })

  testWithPostgres(
    'parada com chegada e sem baixa ganha o `settlement` ancorado na chegada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        await setStop(database, trip.stopId, { arrivedAt: ARRIVAL })

        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 1 })
        expect((await readReminders(database, company.companyId))[0]).toMatchObject({
          anchorAt: ARRIVAL,
          stage: 'settlement',
          status: 'pending',
        })
      })
    },
  )

  testWithPostgres('parada baixada, ou ainda sem saída, não gera lembrete', async () => {
    await withDisposableDatabase(async (database) => {
      const { company, trip } = await seedWorld(database)
      expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })
      await setStop(database, trip.stopId, { arrivedAt: ARRIVAL, completedAt: ARRIVAL })
      expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })
      expect(await readReminders(database, company.companyId)).toEqual([])
    })
  })

  testWithPostgres(
    'etapa com lembrete escalado ou fechado para a mesma âncora não reabre',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        await setStop(database, trip.stopId, {
          enRouteSince: DEPARTURE,
          enRouteTappedAt: DEVICE_TAP,
        })
        await reconcile(database, company.companyId)
        await database.db
          .update(driverStopReminders)
          .set({ closedAt: new Date(), status: 'escalated' })
          .where(eq(driverStopReminders.companyId, company.companyId))

        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })
        const rows = await readReminders(database, company.companyId)
        expect(rows.map((row) => row.status)).toEqual(['escalated'])

        await setStop(database, trip.stopId, {
          enRouteTappedAt: new Date('2026-11-07T01:00:00.000Z'),
        })
        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 1 })
      })
    },
  )

  testWithPostgres('chave da empresa desligada, ou viagem fora da rua, não gera nada', async () => {
    await withDisposableDatabase(async (database) => {
      const off = await seedWorld(database, { enabled: false })
      await setStop(database, off.trip.stopId, { enRouteSince: DEPARTURE })
      expect(await reconcile(database, off.company.companyId)).toEqual({ openedCount: 0 })

      const dispatched = await seedWorld(database, { tripStatus: 'dispatched' })
      await setStop(database, dispatched.trip.stopId, { arrivedAt: ARRIVAL })
      expect(await reconcile(database, dispatched.company.companyId)).toEqual({ openedCount: 0 })
      expect(await readReminders(database, off.company.companyId)).toEqual([])
    })
  })

  testWithPostgres('uma empresa nunca recebe lembrete da parada de outra', async () => {
    await withDisposableDatabase(async (database) => {
      const first = await seedWorld(database)
      const second = await seedWorld(database)
      await setStop(database, first.trip.stopId, { enRouteSince: DEPARTURE })
      await setStop(database, second.trip.stopId, { enRouteSince: DEPARTURE })

      expect(await reconcile(database, first.company.companyId)).toEqual({ openedCount: 1 })
      expect(await readReminders(database, second.company.companyId)).toEqual([])
    })
  })

  testWithPostgres(
    'chegada offline (âncora do evento != arrived_at): lembrete fechado não reabre `settlement`',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        const eventAnchor = new Date(ARRIVAL.getTime() - 3 * 3_600_000)
        await setStop(database, trip.stopId, { arrivedAt: ARRIVAL })
        await seedStopEvent(database, {
          company,
          createdAt: new Date(Date.now() - 60_000),
          kind: 'arrived',
          trip,
        })
        await seedClosedReminder(database, {
          anchorAt: eventAnchor,
          company,
          stage: 'settlement',
          trip,
        })

        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })
        expect(await readReminders(database, company.companyId)).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'saída offline: lembrete fechado não reabre `arrival`; nova saída (evento mais novo) abre',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        await setStop(database, trip.stopId, {
          enRouteSince: DEPARTURE,
          enRouteTappedAt: DEVICE_TAP,
        })
        await seedStopEvent(database, {
          company,
          createdAt: new Date(Date.now() - 60_000),
          kind: 'departed',
          trip,
        })
        await seedClosedReminder(database, {
          anchorAt: new Date(DEPARTURE.getTime() - 3 * 3_600_000),
          company,
          stage: 'arrival',
          trip,
        })
        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })

        await seedStopEvent(database, {
          company,
          createdAt: new Date(Date.now() + 60_000),
          kind: 'departed',
          trip,
        })
        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 1 })
      })
    },
  )

  testWithPostgres(
    'M1: a parada que chegou entre a leitura e a abertura não ganha `arrival` velho',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        await setStop(database, trip.stopId, { enRouteSince: DEPARTURE })
        const repository = new DrizzleDriverStopReminderReconciliationRepository(database.db)
        const [stage] = await repository.listMissingCurrentStages({
          companyId: company.companyId,
          limit: 200,
        })
        expect(stage?.stage).toBe('arrival')

        await setStop(database, trip.stopId, { arrivedAt: ARRIVAL, enRouteSince: null })
        const opened = await repository.openIfStillCurrent({
          companyId: company.companyId,
          dueAt: ARRIVAL,
          expectedAt: ARRIVAL,
          stage: 'arrival',
          stopId: trip.stopId,
        })
        expect(opened).toBeUndefined()
        expect(await readReminders(database, company.companyId)).toEqual([])
      })
    },
  )

  testWithPostgres(
    'L2: um INSERT que falha não aborta nem faminta o lote; os outros itens abrem',
    async () => {
      await withDisposableDatabase(async (database) => {
        const first = await seedWorld(database)
        const company = first.company
        const secondTrip = await seedTrip(database, company, 'on_delivery_route')
        await setStop(database, first.trip.stopId, { enRouteSince: DEPARTURE })
        await setStop(database, secondTrip.stopId, {
          enRouteSince: new Date(DEPARTURE.getTime() + 60_000),
        })

        let calls = 0
        const failing = new Proxy(database.db, {
          get(target, property, receiver) {
            if (property !== 'execute') return Reflect.get(target, property, receiver)
            return (query: Parameters<typeof target.execute>[0]) => {
              calls += 1
              // 1ª chamada lista; 2ª é o INSERT do item mais antigo, que falha com violação de FK.
              if (calls === 2)
                return Promise.reject(Object.assign(new Error('boom'), { errno: '23503' }))
              return target.execute(query)
            }
          },
        })
        const result = await createReconcileDriverStopRemindersUseCase({
          isEnabled: true,
          reconciliation: new DrizzleDriverStopReminderReconciliationRepository(failing),
          reminders: new DrizzleDriverStopReminderRepository(database.db),
        }).execute({ companyId: company.companyId })

        expect(result).toEqual({ openedCount: 1 })
        const rows = await readReminders(database, company.companyId)
        expect(rows.map((row) => row.tripStopId)).toEqual([secondTrip.stopId])
      })
    },
  )

  testWithPostgres(
    'folga de 1 minuto: saída cancelada e refeita 30 s depois NÃO reabre pela varredura (limite documentado); 2 min depois, sim',
    async () => {
      await withDisposableDatabase(async (database) => {
        const { company, trip } = await seedWorld(database)
        await setStop(database, trip.stopId, { enRouteSince: DEPARTURE })
        await seedStopEvent(database, {
          company,
          createdAt: new Date(Date.now() - 120_000),
          kind: 'departed',
          trip,
        })
        await database.db.insert(driverStopReminders).values({
          anchorAt: DEPARTURE,
          closedAt: new Date(),
          closedReason: 'departure_cancelled',
          companyId: company.companyId,
          createdAt: new Date(Date.now() - 100_000),
          driverId: company.firstDriverId,
          dueAt: DEPARTURE,
          originKind: 'fallback',
          stage: 'arrival',
          status: 'cancelled',
          tripId: trip.tripId,
          tripStopId: trip.stopId,
        })
        // Nova saída 30 s depois do lembrete cancelado: dentro da folga, a varredura a lê como o mesmo ciclo
        // (o caminho do evento abre o lembrete novo na hora; a varredura é só a rede de segurança).
        await seedStopEvent(database, {
          company,
          createdAt: new Date(Date.now() - 70_000),
          kind: 'departed',
          trip,
        })
        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 0 })

        await seedStopEvent(database, {
          company,
          createdAt: new Date(Date.now() - 1_000),
          kind: 'departed',
          trip,
        })
        expect(await reconcile(database, company.companyId)).toEqual({ openedCount: 1 })
      })
    },
  )
})
