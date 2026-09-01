/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O expurgo contra Postgres de verdade. `trip_stop_events` é tabela que o worker apenas **copia** —
 * coluna renomeada na API passa pelo typecheck deste lado e só falharia no ciclo, em produção,
 * calada. E a promessa que esta rotina cumpre é de LGPD: se ela não apagar, o `docs/SECURITY.md`
 * está mentindo, e mentir sobre retenção é pior do que não ter prazo nenhum.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createTripLocationPurgeRoutine } from '../src/trip-location-purge/application/trip-location-purge.routine.js'
import { createDrizzleRedactTripLocations } from '../src/trip-location-purge/infrastructure/drizzle-trip-location.repository.js'
import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

/** Relógio injetado: o corte é relativo a este instante, e nada aqui depende da data em que roda. */
const NOW = new Date('2026-08-26T09:00:00.000Z')

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const CONTEXT: JobRoutineContext = {
  correlationId: 'purge-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge',
  origin: 'schedule',
}

describeDatabase('expurgo da coordenada de entrega (integration)', () => {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopId = crypto.randomUUID()
  const expiredEventId = crypto.randomUUID()
  const freshEventId = crypto.randomUUID()
  const withoutLocationEventId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertEvent(input: {
    readonly createdAt: string
    readonly id: string
    readonly located: boolean
  }): Promise<void> {
    await db.execute(sql`
      insert into trip_stop_events
        (id, company_id, stop_id, kind, latitude, longitude, accuracy_meters, captured_at,
         actor_user_id, created_at)
      values (
        ${input.id}, ${companyId}, ${stopId}, 'delivered',
        ${input.located ? '-23.5505199' : null}, ${input.located ? '-46.6333094' : null},
        ${input.located ? '12.50' : null}, ${input.located ? input.createdAt : null},
        ${userId}, ${input.createdAt}
      )
    `)
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${membershipId}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E47', 'traction', 'tractor_unit', 'SP')
    `)
    await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'completed')
    `)
    await db.execute(sql`
      insert into trip_stops (id, company_id, trip_id, sequence, address_key, label)
      values (${stopId}, ${companyId}, ${tripId}, 1, '3550308|01001000|100', 'Centro, 100')
    `)

    // Noventa e um dias: passou do prazo por um dia, que é exatamente onde o corte tem de morder
    await insertEvent({ createdAt: '2026-05-27T09:00:00.000Z', id: expiredEventId, located: true })
    // Um dia: dentro do prazo, e a prova de que a rotina não varre o que ainda é comprovante
    await insertEvent({ createdAt: '2026-08-25T09:00:00.000Z', id: freshEventId, located: true })
    // Entrega confirmada sem GPS — o caso que a §3.1 protege, e que o expurgo não pode tocar
    await insertEvent({
      createdAt: '2026-05-27T09:00:00.000Z',
      id: withoutLocationEventId,
      located: false,
    })
  })

  afterAll(async () => {
    await db.execute(sql`delete from trip_stop_events where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_stops where company_id = ${companyId}`)
    await db.execute(sql`delete from trips where company_id = ${companyId}`)
    await db.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
    await db.execute(sql`delete from user_company_memberships where id = ${membershipId}`)
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  test('apaga a coordenada vencida e preserva o evento inteiro', async () => {
    const routine = createTripLocationPurgeRoutine({
      logger: SILENT_LOGGER as never,
      now: () => NOW,
      redact: createDrizzleRedactTripLocations(db),
    })

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters.redacted).toBe(1)

    const rows = await db.execute(sql`
      select "id", "latitude", "longitude", "accuracy_meters", "captured_at", "kind"
      from trip_stop_events where company_id = ${companyId} order by "created_at", "id"
    `)
    const byId = new Map(rows.map((row) => [String(row.id), row]))

    // O evento continua lá: a viagem continua auditável, e o que some é onde a pessoa estava
    expect(byId.size).toBe(3)
    expect(byId.get(expiredEventId)).toMatchObject({
      accuracy_meters: null,
      captured_at: null,
      kind: 'delivered',
      latitude: null,
      longitude: null,
    })
    expect(byId.get(freshEventId)?.latitude).not.toBeNull()
    expect(byId.get(withoutLocationEventId)?.latitude).toBeNull()
  })

  /** Correr de novo não tem o que apagar — e é assim que a batida diária se comporta todo dia. */
  test('o segundo ciclo não encontra mais nada para apagar', async () => {
    const routine = createTripLocationPurgeRoutine({
      logger: SILENT_LOGGER as never,
      now: () => NOW,
      redact: createDrizzleRedactTripLocations(db),
    })

    expect((await routine.run(CONTEXT)).counters).toEqual({ batches: 0, redacted: 0 })
  })
})
