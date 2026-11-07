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
import { tripStops } from '../../src/database/trip.schema.js'
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
})
