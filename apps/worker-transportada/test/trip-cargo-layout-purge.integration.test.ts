/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O expurgo da prévia contra Postgres de verdade. `trip_cargo_layouts` e a outbox são tabelas que o
 * worker **copia**, e a FK da outbox é `ON DELETE RESTRICT`: a ordem errada só aparece aqui, com o
 * banco recusando o `DELETE` — nunca no contrato com dublê.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createTripCargoLayoutPurgeRoutine } from '../src/trip-cargo-layout-purge/application/trip-cargo-layout-purge.routine.js'
import { createDrizzlePurgeStaleCargoLayoutPreviews } from '../src/trip-cargo-layout-purge/infrastructure/drizzle-trip-cargo-layout-purge.repository.js'
import type { JobRoutineContext } from '../src/job-run/application/job-routine.port.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

const CONTEXT: JobRoutineContext = {
  correlationId: 'cargo-layout-purge-integration',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.cargo-layout.purge',
  origin: 'schedule',
}

describeDatabase('expurgo da prévia da planta (integration)', () => {
  const companyId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stalePreviewId = crypto.randomUUID()
  const freshPreviewId = crypto.randomUUID()
  const staleTripLayoutId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const db = provider.db

  async function insertLayout(input: {
    readonly hoursAgo: number
    readonly id: string
    readonly tripId: string | null
  }): Promise<void> {
    await db.execute(sql`
      insert into trip_cargo_layouts
        (id, company_id, trip_id, status, input_hash, policy_version, input, created_at, updated_at)
      values (
        ${input.id}, ${companyId}, ${input.tripId}, 'queued', ${input.id}, 'v1',
        '{"stops":[{"clientName":"Cliente de teste"}]}'::jsonb,
        now() - make_interval(hours => ${input.hoursAgo}),
        now() - make_interval(hours => ${input.hoursAgo})
      )
    `)
    await db.execute(sql`
      insert into trip_cargo_layout_outbox
        (company_id, layout_id, event_type, correlation_id, payload)
      values (
        ${companyId}, ${input.id}, 'transportada.trip.cargo-layout.requested',
        'cargo-layout-purge-integration', '{}'::jsonb
      )
    `)
  }

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E48', 'traction', 'tractor_unit', 'SP')
    `)
    await db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status)
      values (${tripId}, ${companyId}, ${vehicleId}, 'draft')
    `)

    // Prévia de 25 h que não virou viagem: é exatamente o que a D19 manda apagar
    await insertLayout({ hoursAgo: 25, id: stalePreviewId, tripId: null })
    // Prévia de 1 h: o operador ainda pode estar olhando para ela
    await insertLayout({ hoursAgo: 1, id: freshPreviewId, tripId: null })
    // Planta velha, mas de viagem: ganhou o `trip_id` e fica
    await insertLayout({ hoursAgo: 25, id: staleTripLayoutId, tripId })
  })

  afterAll(async () => {
    await db.execute(sql`delete from trip_cargo_layout_outbox where company_id = ${companyId}`)
    await db.execute(sql`delete from trip_cargo_layouts where company_id = ${companyId}`)
    await db.execute(sql`delete from trips where company_id = ${companyId}`)
    await db.execute(sql`delete from fleet_vehicles where company_id = ${companyId}`)
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await provider.close()
  })

  function buildRoutine() {
    return createTripCargoLayoutPurgeRoutine({
      logger: SILENT_LOGGER as never,
      now: () => new Date(),
      purge: createDrizzlePurgeStaleCargoLayoutPreviews(db),
    })
  }

  test('apaga a prévia velha e a outbox dela, e deixa a nova e a da viagem', async () => {
    const result = await buildRoutine().run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters.deleted).toBeGreaterThanOrEqual(1)
    expect(result.counters.deletedOutbox).toBeGreaterThanOrEqual(1)

    const layouts = await db.execute(sql`
      select id from trip_cargo_layouts where company_id = ${companyId} order by id
    `)
    expect(layouts.map((row) => String(row.id)).sort()).toEqual(
      [freshPreviewId, staleTripLayoutId].sort(),
    )

    const outbox = await db.execute(sql`
      select layout_id from trip_cargo_layout_outbox where company_id = ${companyId}
    `)
    expect(outbox.map((row) => String(row.layout_id)).sort()).toEqual(
      [freshPreviewId, staleTripLayoutId].sort(),
    )
  })

  test('o segundo ciclo não encontra mais nada desta empresa para apagar', async () => {
    await buildRoutine().run(CONTEXT)

    const layouts = await db.execute(sql`
      select count(*)::int as total from trip_cargo_layouts where company_id = ${companyId}
    `)
    expect(Number(layouts[0]?.total)).toBe(2)
  })
})
