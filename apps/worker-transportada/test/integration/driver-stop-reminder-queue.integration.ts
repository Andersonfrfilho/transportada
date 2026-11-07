/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T2.4: a fila dos lembretes vencidos contra Postgres de verdade — só empresa com a configuração
 * ligada entra, a reserva em curso da API fica de fora e o lote respeita o limite e a ordem de vencimento.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzleDriverStopReminderQueue } from '../../src/driver-stop-reminders/infrastructure/drizzle-driver-stop-reminder-queue.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-11-09T12:00:00.000Z')
const minutesFromNow = (minutes: number): string =>
  new Date(NOW.getTime() + minutes * 60_000).toISOString()

const randomTaxId = (): string => String(Math.floor(Math.random() * 1e11)).padStart(11, '0')

type Tenant = Readonly<{ companyId: string; driverId: string; stopId: string; tripId: string }>

describeDatabase('fila dos lembretes ao motorista (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db
  const queue = createDrizzleDriverStopReminderQueue(db)
  const tenants: Tenant[] = []

  async function createTenant(settingsEnabled: boolean | undefined): Promise<Tenant> {
    const tenant = {
      companyId: crypto.randomUUID(),
      driverId: crypto.randomUUID(),
      stopId: crypto.randomUUID(),
      tripId: crypto.randomUUID(),
    }
    const vehicleId = crypto.randomUUID()
    await db.execute(sql`insert into companies (id, status) values (${tenant.companyId}, 'active')`)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${tenant.companyId}, 'GCQ8E47', 'traction', 'tractor_unit', 'SP')
    `)
    await db.execute(sql`
      insert into fleet_drivers (id, company_id, name, tax_id)
      values (${tenant.driverId}, ${tenant.companyId}, 'Motorista', ${randomTaxId()})
    `)
    await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tenant.tripId}, ${tenant.companyId}, ${vehicleId}, 'on_delivery_route')
    `)
    await db.execute(sql`
      insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
      values (${tenant.stopId}, ${tenant.companyId}, ${tenant.tripId}, 1, '3550308|01001000|100', 'Centro, 100')
    `)
    if (settingsEnabled !== undefined) {
      await db.execute(sql`
        insert into company_driver_reminder_settings (company_id, enabled)
        values (${tenant.companyId}, ${settingsEnabled})
      `)
    }
    tenants.push(tenant)
    return tenant
  }

  async function seedReminder(
    tenant: Tenant,
    input: { dueAt: string; dispatchingUntil?: string; status?: string; stage?: string },
  ): Promise<string> {
    const id = crypto.randomUUID()
    await db.execute(sql`
      insert into driver_stop_reminders
        (id, company_id, trip_id, trip_stop_id, driver_id, stage, status, anchor_at, origin_kind,
         due_at, dispatching_until)
      values (${id}, ${tenant.companyId}, ${tenant.tripId}, ${tenant.stopId}, ${tenant.driverId},
        ${input.stage ?? 'arrival'}, ${input.status ?? 'pending'}, ${minutesFromNow(-60)}::timestamptz,
        'fallback', ${input.dueAt}::timestamptz, ${input.dispatchingUntil ?? null}::timestamptz)
    `)
    return id
  }

  async function dueIds(tenant: Tenant, limit = 100): Promise<string[]> {
    const rows = await queue.listDue({ excludeReminderIds: [], limit, now: NOW })
    return rows.filter((row) => row.companyId === tenant.companyId).map((row) => row.reminderId)
  }

  afterAll(async () => {
    for (const { companyId } of tenants) {
      await db.execute(sql`delete from driver_stop_reminders where company_id = ${companyId}`)
      await db.execute(
        sql`delete from company_driver_reminder_settings where company_id = ${companyId}`,
      )
      await db.execute(sql`delete from fleet_drivers where company_id = ${companyId}`)
      await db.execute(sql`delete from trip_stops where company_id = ${companyId}`)
      await db.execute(sql`delete from trips where company_id = ${companyId}`)
      await db.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await provider.close()
  })

  test('lists only pending reminders already due, oldest first', async () => {
    const tenant = await createTenant(true)
    const later = await seedReminder(tenant, { dueAt: minutesFromNow(-5) })
    const earlier = await seedReminder(tenant, { dueAt: minutesFromNow(-30), stage: 'settlement' })
    const future = await createTenant(true)
    await seedReminder(future, { dueAt: minutesFromNow(10) })

    expect(await dueIds(tenant)).toEqual([earlier, later])
    expect(await dueIds(future)).toEqual([])
  })

  test('skips closed reminders', async () => {
    const tenant = await createTenant(true)
    await seedReminder(tenant, { dueAt: minutesFromNow(-5), status: 'closed' })

    expect(await dueIds(tenant)).toEqual([])
  })

  test('skips companies with the setting off or without a settings row', async () => {
    const disabled = await createTenant(false)
    const missing = await createTenant(undefined)
    await seedReminder(disabled, { dueAt: minutesFromNow(-5) })
    await seedReminder(missing, { dueAt: minutesFromNow(-5) })

    expect(await dueIds(disabled)).toEqual([])
    expect(await dueIds(missing)).toEqual([])
  })

  test('skips a reminder reserved by the API and takes it back once the reservation expires', async () => {
    const tenant = await createTenant(true)
    await seedReminder(tenant, { dispatchingUntil: minutesFromNow(1), dueAt: minutesFromNow(-5) })
    const expired = await seedReminder(tenant, {
      dispatchingUntil: minutesFromNow(-1),
      dueAt: minutesFromNow(-4),
      stage: 'settlement',
    })

    expect(await dueIds(tenant)).toEqual([expired])
  })

  test('does not write the reservation: that column belongs to the API delivery', async () => {
    const tenant = await createTenant(true)
    const id = await seedReminder(tenant, { dueAt: minutesFromNow(-5) })

    await dueIds(tenant)

    const rows = (await db.execute(
      sql`select dispatching_until, version from driver_stop_reminders where id = ${id}`,
    )) as unknown as readonly { dispatching_until: string | null; version: string }[]
    expect(rows[0]?.dispatching_until).toBeNull()
    expect(Number(rows[0]?.version)).toBe(1)
  })

  test('honours the limit and the exclusion list', async () => {
    const tenant = await createTenant(true)
    const first = await seedReminder(tenant, { dueAt: minutesFromNow(-30) })
    const second = await seedReminder(tenant, { dueAt: minutesFromNow(-20), stage: 'settlement' })

    const limited = await queue.listDue({ excludeReminderIds: [], limit: 1000, now: NOW })
    expect(limited.filter((row) => row.companyId === tenant.companyId)).toHaveLength(2)

    const excluded = await queue.listDue({ excludeReminderIds: [first], limit: 1000, now: NOW })
    expect(
      excluded.filter((row) => row.companyId === tenant.companyId).map((row) => row.reminderId),
    ).toEqual([second])
  })
})
