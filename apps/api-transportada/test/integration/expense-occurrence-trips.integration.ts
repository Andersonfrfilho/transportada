/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4b: as viagens do pagamento contra um Postgres de verdade, com a valoração real da viagem (a mesma da
 * lista de viagens). O que só o banco prova: a conclusão lida de `trip_status_events` no dia de São Paulo, a linha da
 * pessoa copiada da parcela `driver` (diária × dias), `unique(trip_id, parcel_kind, driver_id)` sob concorrência, o
 * previsto recalculado pela soma na mesma transação e o isolamento por empresa.
 */
import { SQL } from 'bun'
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { tripDrivers } from '../../src/database/trip.schema.js'
import {
  createIncludeExpenseOccurrenceTripUseCase,
  createListAvailableExpenseTripsUseCase,
  createRemoveExpenseOccurrenceTripUseCase,
} from '../../src/expenses/application/expense-occurrence-trip.use-case.js'
import { createSettleExpenseOccurrenceUseCase } from '../../src/expenses/application/expense-occurrence.use-case.js'
import {
  createCreateExpenseUseCase,
  createListExpenseCategoriesUseCase,
} from '../../src/expenses/application/expense.use-case.js'
import {
  ExpenseOccurrenceAlreadyPaidError,
  ExpenseOccurrenceNotFoundError,
  ExpenseTripAlreadyIncludedError,
  ExpenseTripNotFoundError,
} from '../../src/expenses/domain/expense.error.js'
import { createDrizzleExpensesPorts } from '../../src/expenses/infrastructure/drizzle-expenses.repository.js'
import { createDrizzleExpenseOccurrenceTripPorts } from '../../src/expenses/infrastructure/drizzle-expense-occurrence-trips.repository.js'
import { createTripPersonParcelReader } from '../../src/expenses/infrastructure/trip-person-parcel.gateway.js'
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

describeDatabase('viagens do pagamento no banco (spec 325 T1.4b)', () => {
  const companyA = crypto.randomUUID()
  const companyB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const otherDriverId = crypto.randomUUID()
  const driverBId = crypto.randomUUID()
  const tripEarly = crypto.randomUUID()
  const tripMidnight = crypto.randomUUID()
  const tripLate = crypto.randomUUID()
  const tripOpen = crypto.randomUUID()
  const tripOther = crypto.randomUUID()
  const tripCompanyB = crypto.randomUUID()
  const databaseName = `transportada_325b_${crypto.randomUUID().replaceAll('-', '')}`
  let admin: SQL | undefined
  let database: TestDatabase | undefined
  let firstFortnight = ''
  let secondFortnight = ''

  function ports() {
    if (database === undefined) throw new Error('A disposable database is required')
    const valuation = new DrizzleTripValuationQuery(database.db, silentLogger)
    const rules = new DrizzleApplicableFreightRuleQuery(database.db)
    return createDrizzleExpenseOccurrenceTripPorts(database.db, {
      readPersonParcels: createTripPersonParcelReader({
        findApplicableRule: (query) => rules.findApplicableRule(query),
        readValuationContexts: (query) => valuation.readValuationContexts(query),
      }),
    })
  }

  async function insertTrip(input: {
    readonly companyId: string
    readonly completedAt: string | null
    readonly days: number
    readonly driverId: string
    readonly status: string
    readonly tripId: string
  }): Promise<void> {
    if (database === undefined) throw new Error('A disposable database is required')
    await database.db.execute(sql`
      insert into trips (id, company_id, status, daily_allowance_days)
      values (${input.tripId}, ${input.companyId}, ${input.status}, ${input.days})
    `)
    await database.db.insert(tripDrivers).values({
      companyId: input.companyId,
      driverId: input.driverId,
      driverName: 'Condutor',
      driverTaxId: '12345678901',
      position: 1n,
      tripId: input.tripId,
    })
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
      insert into fleet_drivers (id, company_id, name, tax_id, payment_model, daily_allowance_amount)
      values (${driverId}, ${companyA}, 'Agregado Um', '12345678901', 'route_table', '250.0000'),
             (${otherDriverId}, ${companyA}, 'Outro', '12345678902', 'route_table', null),
             (${driverBId}, ${companyB}, 'Da B', '12345678903', 'route_table', null)
    `)

    // 02/11 10h em SP; 15/11 23h30 em SP é 16/11 02h30 UTC e tem de cair na 1ª quinzena; 20/11 é da 2ª.
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-11-02T13:00:00Z',
      days: 3,
      driverId,
      status: 'completed',
      tripId: tripEarly,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-11-16T02:30:00Z',
      days: 2,
      driverId,
      status: 'completed',
      tripId: tripMidnight,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-11-20T15:00:00Z',
      days: 1,
      driverId,
      status: 'completed',
      tripId: tripLate,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: null,
      days: 1,
      driverId,
      status: 'in_transit',
      tripId: tripOpen,
    })
    await insertTrip({
      companyId: companyA,
      completedAt: '2026-11-03T15:00:00Z',
      days: 1,
      driverId: otherDriverId,
      status: 'completed',
      tripId: tripOther,
    })
    await insertTrip({
      companyId: companyB,
      completedAt: '2026-11-03T15:00:00Z',
      days: 1,
      driverId: driverBId,
      status: 'completed',
      tripId: tripCompanyB,
    })

    const expensePorts = createDrizzleExpensesPorts(database.db)
    const categories = await createListExpenseCategoriesUseCase(expensePorts).execute({
      companyId: companyA,
    })
    const driverCategory = categories.find((category) => category.requiresDriver)
    if (driverCategory === undefined) throw new Error('driver category is required')
    await createCreateExpenseUseCase(expensePorts).execute({
      categoryId: driverCategory.id,
      companyId: companyA,
      createdBy: userId,
      expectedAmount: '2000.00',
      kind: 'fixed',
      name: 'Quinzena do agregado',
      payeeDriverId: driverId,
      recurrence: 'fortnightly',
      today: '2026-11-13',
    })
    const occurrences = await expensePorts.occurrences.list({
      companyId: companyA,
      filters: { competence: '2026-11' },
    })
    firstFortnight = occurrences.find((row) => row.slot === 1)?.id ?? ''
    secondFortnight = occurrences.find((row) => row.slot === 2)?.id ?? ''
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

  test('a quinzena lista as concluídas do favorecido pelo dia de São Paulo, com a diária × dias da valoração', async () => {
    const result = await createListAvailableExpenseTripsUseCase(ports()).execute({
      companyId: companyA,
      occurrenceId: firstFortnight,
    })

    expect(result.period).toEqual({ from: '2026-11-01', to: '2026-11-15' })
    expect(result.available).toEqual([
      {
        amount: '750.00',
        completedOn: '2026-11-02',
        dailyAmount: '250.0000',
        days: 3,
        parcelKind: 'driver',
        tripId: tripEarly,
      },
      {
        amount: '500.00',
        completedOn: '2026-11-15',
        dailyAmount: '250.0000',
        days: 2,
        parcelKind: 'driver',
        tripId: tripMidnight,
      },
    ])
    expect(result.pending).toEqual([])
  })

  test('incluir copia a linha e o previsto vira a soma; a mesma viagem não entra em outro pagamento', async () => {
    const include = createIncludeExpenseOccurrenceTripUseCase(ports())
    await include.execute({
      companyId: companyA,
      includedBy: userId,
      occurrenceId: firstFortnight,
      tripId: tripEarly,
    })
    const result = await include.execute({
      companyId: companyA,
      includedBy: userId,
      occurrenceId: firstFortnight,
      tripId: tripMidnight,
    })

    expect(result.tripsTotal).toBe('1250.00')
    expect(result.occurrence.expectedAmount).toBe('1250.00')
    await expect(
      include.execute({
        companyId: companyA,
        includedBy: userId,
        occurrenceId: secondFortnight,
        tripId: tripEarly,
      }),
    ).rejects.toBeInstanceOf(ExpenseTripAlreadyIncludedError)
  })

  test('duas inclusões simultâneas da mesma viagem em pagamentos diferentes: o unique deixa só uma', async () => {
    const lockedPorts = ports()
    // Corrida pela porta, sem a conferência prévia do caso de uso: só o unique decide.
    const attempt = (occurrenceId: string) =>
      lockedPorts.occurrenceTrips.include({
        companyId: companyA,
        createdBy: userId,
        trip: {
          amount: '250.00',
          completedOn: '2026-11-20',
          dailyAmount: '250.0000',
          days: 1,
          driverId,
          occurrenceId,
          parcelKind: 'driver',
          tripId: tripLate,
        },
      })
    const outcomes = await Promise.all([attempt(firstFortnight), attempt(secondFortnight)])

    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(['included', 'taken'])
    if (database === undefined) throw new Error('A disposable database is required')
    const rows = (await database.db.execute(sql`
      select count(*)::int as total from company_expense_occurrence_trips where trip_id = ${tripLate}
    `)) as unknown as { total: number }[]
    expect(rows[0]?.total).toBe(1)
  })

  test('remover devolve a viagem e recalcula; sem viagem nenhuma, o previsto volta ao valor da conta', async () => {
    const holder = (
      await ports().occurrenceTrips.listHeld({
        companyId: companyA,
        driverId,
        parcelKind: 'driver',
        tripIds: [tripLate],
      })
    ).get(tripLate)
    if (holder === undefined) throw new Error('the race left no row')

    const result = await createRemoveExpenseOccurrenceTripUseCase(ports()).execute({
      companyId: companyA,
      occurrenceId: holder,
      removedBy: userId,
      tripId: tripLate,
    })

    // Na 1ª quinzena sobram as duas de antes (1250,00); na 2ª não sobra nada e volta o valor da conta.
    expect(result.occurrence.expectedAmount).toBe(holder === firstFortnight ? '1250.00' : '2000.00')
    const available = await createListAvailableExpenseTripsUseCase(ports()).execute({
      companyId: companyA,
      occurrenceId: secondFortnight,
    })
    expect(available.available.map((trip) => [trip.tripId, trip.amount])).toEqual([
      [tripLate, '250.00'],
    ])
  })

  test('ocorrência paga é imutável e a outra empresa não enxerga nada', async () => {
    await createSettleExpenseOccurrenceUseCase(
      createDrizzleExpensesPorts(database?.db ?? (undefined as never)),
    ).execute({
      companyId: companyA,
      occurrenceId: firstFortnight,
      paidAmount: '1250.00',
      paidAt: '2026-11-15',
      settledBy: userId,
      settlementNote: null,
    })
    await expect(
      createRemoveExpenseOccurrenceTripUseCase(ports()).execute({
        companyId: companyA,
        occurrenceId: firstFortnight,
        removedBy: userId,
        tripId: tripEarly,
      }),
    ).rejects.toBeInstanceOf(ExpenseOccurrenceAlreadyPaidError)

    await expect(
      createIncludeExpenseOccurrenceTripUseCase(ports()).execute({
        companyId: companyA,
        includedBy: userId,
        occurrenceId: secondFortnight,
        tripId: tripCompanyB,
      }),
    ).rejects.toBeInstanceOf(ExpenseTripNotFoundError)
    await expect(
      createListAvailableExpenseTripsUseCase(ports()).execute({
        companyId: companyB,
        occurrenceId: secondFortnight,
      }),
    ).rejects.toBeInstanceOf(ExpenseOccurrenceNotFoundError)
    const held = await ports().occurrenceTrips.listHeld({
      companyId: companyB,
      driverId,
      parcelKind: 'driver',
      tripIds: [tripEarly],
    })
    expect(held.size).toBe(0)
  })

  test('a auditoria grava inclusão e remoção com expenses.manage', async () => {
    if (database === undefined) throw new Error('A disposable database is required')
    const rows = (await database.db.execute(sql`
      select action, permission from audit_logs
      where company_id = ${companyA} and action like 'expense.occurrence.trip.%'
      order by created_at
    `)) as unknown as { action: string; permission: string }[]

    expect(new Set(rows.map((row) => row.action))).toEqual(
      new Set(['expense.occurrence.trip.included', 'expense.occurrence.trip.removed']),
    )
    expect(new Set(rows.map((row) => row.permission))).toEqual(new Set(['expenses.manage']))
  })
})
