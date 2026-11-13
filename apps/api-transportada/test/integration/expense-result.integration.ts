/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.5: o resultado do mês e a configuração do rateio contra um Postgres de verdade. O que só o banco prova: a
 * data de conclusão da viagem é a do pagamento (`trip_status_events`, sem `closed_at`), o recorte por empresa, a soma
 * das viagens incluídas no pagamento, a configuração por `ON CONFLICT` e a auditoria da troca de critério.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  createGetExpenseAllocationSettingsUseCase,
  createGetExpenseResultUseCase,
  createGetExpenseUnitCostsUseCase,
  createUpdateExpenseAllocationSettingsUseCase,
} from '../../src/expenses/application/expense-result.use-case.js'
import {
  createCreateExpenseUseCase,
  createListExpenseCategoriesUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import { createDrizzleExpensesPorts } from '../../src/expenses/infrastructure/drizzle-expenses.repository.js'
import { createDrizzleExpenseResultPorts } from '../../src/expenses/infrastructure/drizzle-expense-result.repository.js'
import { NO_VEHICLE_ID } from '../../src/expenses/infrastructure/allocation-trip.query.js'
import { DrizzleApplicableFreightRuleQuery } from '../../src/freight/infrastructure/drizzle-freight.repository.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const describeDatabase = databaseUrl === undefined ? describe.skip : describe

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const silentLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
} as never

describeDatabase('resultado do mês e rateio no banco (spec 325 T4.5)', () => {
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripWithVehicle = crypto.randomUUID()
  const tripNoVehicle = crypto.randomUUID()
  const tripOctober = crypto.randomUUID()
  const tripOpen = crypto.randomUUID()
  const tripCompanyB = crypto.randomUUID()
  const databaseName = `transportada_325c_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined

  function ports() {
    if (database === undefined) throw new Error('A disposable database is required')
    const valuation = new DrizzleTripValuationQuery(database.db, silentLogger)
    const rules = new DrizzleApplicableFreightRuleQuery(database.db)
    return createDrizzleExpenseResultPorts(database.db, {
      findApplicableRule: (query) => rules.findApplicableRule(query),
      readValuationContexts: (query) => valuation.readValuationContexts(query),
    })
  }

  async function insertTrip(input: {
    readonly companyId: string
    readonly completedAt: string | null
    readonly status: string
    readonly tripId: string
    readonly vehicleId: string | null
  }): Promise<void> {
    if (database === undefined) throw new Error('A disposable database is required')
    await database.db.execute(sql`
      insert into trips (id, company_id, vehicle_id, status, daily_allowance_days, planned_route, planned_route_frozen_at,
        planned_distance_meters, planned_return_distance_meters, planned_duration_seconds)
      values (${input.tripId}, ${input.companyId}, ${input.vehicleId}, ${input.status}, 2, '{}'::jsonb, now(),
        100000, 0, 3600)
    `)
    // A conclusão pelo relatório do motorista não grava `closed_at`: só o evento de status existe.
    if (input.completedAt !== null) {
      await database.db.execute(sql`
        insert into trip_status_events (id, company_id, trip_id, from_status, to_status, actor_user_id, occurred_at)
        values (${crypto.randomUUID()}, ${input.companyId}, ${input.tripId}, 'on_delivery_route', 'completed',
          ${userId}, ${input.completedAt})
      `)
    }
  }

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
    admin = new SQL(databaseUrl, { max: 1 })
    const disposableUrl = new URL(databaseUrl)
    disposableUrl.pathname = `/${databaseName}`
    disposableUrl.search = ''
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })

    await database.db.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    for (const companyId of [companyA, companyB]) {
      await database.db.execute(
        sql`insert into companies (id, status) values (${companyId}, 'active')`,
      )
      await database.db.execute(sql`
        insert into user_company_memberships (id, user_id, company_id, status)
        values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')
      `)
    }
    await database.db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyA}, 'ABC1D23', 'traction', 'tractor_unit', 'SP')
    `)
    // 16/11 02h30 UTC é 15/11 23h30 em São Paulo: cai em novembro, e sem `closed_at`.
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-11-16T02:30:00Z',
      status: 'completed',
      tripId: tripWithVehicle,
      vehicleId,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-11-20T15:00:00Z',
      status: 'completed',
      tripId: tripNoVehicle,
      vehicleId: null,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-10-05T15:00:00Z',
      status: 'completed',
      tripId: tripOctober,
      vehicleId,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: null,
      status: 'in_transit',
      tripId: tripOpen,
      vehicleId,
    })
    await insertTrip({
      companyId: companyB,
      completedAt: '2026-11-03T15:00:00Z',
      status: 'completed',
      tripId: tripCompanyB,
      vehicleId: null,
    })

    const expensePorts = createDrizzleExpensesPorts(database.db)
    const categories = await createListExpenseCategoriesUseCase(expensePorts).execute({
      companyId: companyA,
    })
    const rent = categories.find((category) => category.name === 'Aluguel')
    const insurance = categories.find((category) => category.name === 'Seguro')
    if (rent === undefined || insurance === undefined) throw new Error('seed categories')
    const create = createCreateExpenseUseCase(expensePorts)
    await create.execute({
      categoryId: rent.id,
      companyId: companyA,
      createdBy: userId,
      dueDate: '2026-11-10',
      expectedAmount: '1000.01',
      kind: 'variable',
      name: 'Aluguel do galpão',
      today: '2026-11-13',
    })
    await create.execute({
      categoryId: insurance.id,
      companyId: companyA,
      createdBy: userId,
      dueDate: '2026-11-12',
      expectedAmount: '400.00',
      kind: 'variable',
      name: 'Seguro do cavalo',
      today: '2026-11-13',
      vehicleId,
    })
  }, 120_000)

  afterAll(async () => {
    try {
      await database?.close()
    } finally {
      try {
        await admin?.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin?.close({ timeout: 0 })
      }
    }
  }, 60_000)

  test('as viagens do mês são as concluídas pelo dia de São Paulo, mesmo sem closed_at, só da empresa', async () => {
    const trips = await ports().trips.listCompleted({
      companyId: companyA,
      from: '2026-11-01',
      to: '2026-11-30',
    })

    expect(trips.map((trip) => [trip.tripId, trip.completedOn, trip.vehicleId]).sort()).toEqual(
      [
        [tripWithVehicle, '2026-11-15', vehicleId],
        [tripNoVehicle, '2026-11-20', NO_VEHICLE_ID],
      ].sort(),
    )
    expect(trips.find((trip) => trip.tripId === tripWithVehicle)).toMatchObject({
      daysCount: 2,
      distanceMeters: 100_000,
    })
  })

  test('o período corta pela data de conclusão (outubro fica fora de novembro e dentro de outubro)', async () => {
    const october = await ports().trips.listCompleted({
      companyId: companyA,
      from: '2026-10-01',
      to: '2026-10-31',
    })

    expect(october.map((trip) => trip.tripId)).toEqual([tripOctober])
  })

  test('as contas do período trazem o grupo da categoria, o veículo e só as da empresa', async () => {
    const occurrences = await ports().occurrences.listForPeriod({
      companyId: companyA,
      from: '2026-11-01',
      to: '2026-11-30',
    })

    expect(
      occurrences
        .map((o) => [o.name, o.costGroup, o.vehicleId, o.expectedAmount, o.includedTripsAmount])
        .sort(),
    ).toEqual(
      [
        ['Aluguel do galpão', 'administrative', null, '1000.01', '0.00'],
        ['Seguro do cavalo', 'vehicle_fixed', vehicleId, '400.00', '0.00'],
      ].sort(),
    )
    expect(
      await ports().occurrences.listForPeriod({
        companyId: companyB,
        from: '2026-11-01',
        to: '2026-11-30',
      }),
    ).toEqual([])
  })

  test('o resultado de novembro fecha: lucro = faturamento − custo − contas, e as margens somam o mesmo', async () => {
    const result = await createGetExpenseResultUseCase(ports()).execute({
      companyId: companyA,
      from: '2026-11-01',
      to: '2026-11-30',
    })

    expect(result.totals.expensesTotal).toBe('1400.01')
    expect(result.byTrip.map((line) => line.id).sort()).toEqual(
      [tripWithVehicle, tripNoVehicle].sort(),
    )
    const cents = (value: string): bigint => BigInt(value.replace('.', ''))
    const sum = (values: readonly string[]): bigint =>
      values.reduce((total, value) => total + cents(value), 0n)
    expect(sum(result.byTrip.map((line) => line.margin)) - cents(result.unallocatedTotal)).toBe(
      cents(result.totals.profit),
    )
    expect(sum(result.byVehicle.map((line) => line.margin)) - cents(result.unallocatedTotal)).toBe(
      cents(result.totals.profit),
    )
    // Seguro do cavalo só entra na viagem do veículo; o aluguel (sem veículo) divide entre as duas.
    const withVehicle = result.byTrip.find((line) => line.id === tripWithVehicle)
    expect(withVehicle?.vehicleShare).toBe('400.00')
    const unit = await createGetExpenseUnitCostsUseCase(ports()).execute({
      companyId: companyA,
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(unit.general.kilometers).toBe('200.000')
    expect(unit.perVehicle.map((line) => line.vehicleId).sort()).toEqual(
      [vehicleId, NO_VEHICLE_ID].sort(),
    )
  })

  test('outra empresa não vê viagem nem conta', async () => {
    const result = await createGetExpenseResultUseCase(ports()).execute({
      companyId: companyB,
      from: '2026-11-01',
      to: '2026-11-30',
    })

    expect(result.totals.expensesTotal).toBe('0.00')
    expect(result.byTrip.map((line) => line.id)).toEqual([tripCompanyB])
  })

  test('o critério padrão vale sem linha, a troca grava, audita e é só da empresa', async () => {
    const get = createGetExpenseAllocationSettingsUseCase(ports())
    const update = createUpdateExpenseAllocationSettingsUseCase(ports())

    expect(await get.execute({ companyId: companyA })).toEqual({
      administrative: 'per_revenue',
      per_km: 'per_km',
      vehicle_fixed: 'per_km',
    })
    await update.execute({
      companyId: companyA,
      settings: { administrative: 'equal' },
      updatedBy: userId,
    })
    const second = await update.execute({
      companyId: companyA,
      settings: { administrative: 'per_trip_day', per_km: 'equal' },
      updatedBy: userId,
    })

    expect(second).toEqual({
      administrative: 'per_trip_day',
      per_km: 'equal',
      vehicle_fixed: 'per_km',
    })
    expect((await get.execute({ companyId: companyB })).administrative).toBe('per_revenue')
    if (database === undefined) throw new Error('database')
    const audits = await database.db.execute(sql`
      select count(*)::int as total from audit_logs
      where company_id = ${companyA} and action = 'expense_allocation_settings.update'
    `)
    expect(Number((audits as unknown as { total: number }[])[0]?.total)).toBe(2)
  })
})
