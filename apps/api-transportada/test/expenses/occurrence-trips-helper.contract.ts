/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T1.4c (RF1e): o ajudante no pagamento. A conta com favorecido ajudante recebe as viagens em que ele foi o
 * ajudante, cada uma com a linha dele na parcela `helper` (diária do ajudante × dias, 149 D7), copiada. Motorista e
 * ajudante da mesma viagem são duas parcelas, cada uma paga à sua pessoa, e nenhuma soma a outra de novo.
 */
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  createIncludeExpenseOccurrenceTripUseCase,
  createListAvailableExpenseTripsUseCase,
  PAYABLE_TRIP_PARCEL_KINDS,
} from '../../src/expenses/application/expense-occurrence-trip.use-case.js'
import { createListExpenseOccurrencesUseCase } from '../../src/expenses/application/expense-occurrence.use-case.js'
import { createCreateExpenseUseCase } from '../../src/expenses/application/expense.use-case.js'
import { resolveExpensePayeeProfile } from '../../src/expenses/domain/expense-payee.policy.js'
import {
  ExpenseTripAlreadyIncludedError,
  ExpenseTripNotPayeeError,
  ExpenseTripParcelMissingError,
} from '../../src/expenses/domain/expense.error.js'
import {
  buildInMemoryExpenseTrips,
  type InMemoryExpenseTrips,
} from '../fixtures/expense-occurrence-trips-in-memory.fixture.js'
import {
  CATEGORY_DRIVER_ID,
  COMPANY_A,
  DRIVER_A_ID,
  HELPER_A_ID,
  USER_ID,
} from '../fixtures/expenses-in-memory.fixture.js'

const OTHER_DRIVER_ID = '00000000-0000-4000-8000-00000000d003'
/** Motorista: o DRIVER_A; ajudante: o HELPER_A. As duas parcelas da mesma viagem. */
const TRIP_SHARED = '00000000-0000-4000-8000-0000000072a1'
/** Só o HELPER_A ajuda; o motorista é outro. */
const TRIP_HELPED = '00000000-0000-4000-8000-0000000072a2'
/** Ajudante sem diária (nem própria, nem geral): lacuna. */
const TRIP_HELPER_GAP = '00000000-0000-4000-8000-0000000072a3'
/** O DRIVER_A foi ajudante aqui (pode atuar como ajudante). */
const TRIP_DRIVER_HELPED = '00000000-0000-4000-8000-0000000072a4'

async function createPayment(
  ports: InMemoryExpenseTrips,
  input: { readonly name: string; readonly payeeDriverId: string },
): Promise<string> {
  await createCreateExpenseUseCase(ports.base).execute({
    categoryId: CATEGORY_DRIVER_ID,
    companyId: COMPANY_A,
    createdBy: USER_ID,
    expectedAmount: '1000.00',
    kind: 'fixed',
    name: input.name,
    payeeDriverId: input.payeeDriverId,
    recurrence: 'monthly',
    today: '2026-11-13',
    dueDay: 5,
  })
  const expense = ports.base.expenseRows.find((row) => row.name === input.name)
  const occurrence = ports.base.occurrenceRows.find(
    (row) => row.expenseId === expense?.id && row.competence === '2026-11',
  )
  if (occurrence === undefined) throw new Error('monthly occurrence missing')
  return occurrence.id
}

async function setup(): Promise<{
  driverPayment: string
  helperPayment: string
  ports: InMemoryExpenseTrips
}> {
  const ports = buildInMemoryExpenseTrips()
  const helperPayment = await createPayment(ports, {
    name: 'Ajudante Zé',
    payeeDriverId: HELPER_A_ID,
  })
  const driverPayment = await createPayment(ports, {
    name: 'Agregado João',
    payeeDriverId: DRIVER_A_ID,
  })
  const completed = (tripId: string, completedOn: string, crew: InMemoryCrew) => ({
    companyId: COMPANY_A,
    completedOn,
    crew,
    status: 'completed',
    tripId,
  })
  ports.trips.push(
    completed(TRIP_SHARED, '2026-11-04', [
      { driverId: DRIVER_A_ID, role: 'driver' },
      { driverId: HELPER_A_ID, role: 'helper' },
    ]),
    completed(TRIP_HELPED, '2026-11-09', [
      { driverId: OTHER_DRIVER_ID, role: 'driver' },
      { driverId: HELPER_A_ID, role: 'helper' },
    ]),
    completed(TRIP_HELPER_GAP, '2026-11-12', [
      { driverId: OTHER_DRIVER_ID, role: 'driver' },
      { driverId: HELPER_A_ID, role: 'helper' },
    ]),
    completed(TRIP_DRIVER_HELPED, '2026-11-18', [
      { driverId: OTHER_DRIVER_ID, role: 'driver' },
      { driverId: DRIVER_A_ID, role: 'helper' },
    ]),
  )
  const priced = (amount: string, dailyAmount: string, days: number) =>
    ({ amount, dailyAmount, days, status: 'priced' }) as const
  ports.parcels.set(`${TRIP_SHARED}:${DRIVER_A_ID}`, priced('600.0000', '200.0000', 3))
  ports.parcels.set(`${TRIP_SHARED}:${HELPER_A_ID}:helper`, priced('360.0000', '120.0000', 3))
  ports.parcels.set(`${TRIP_HELPED}:${HELPER_A_ID}:helper`, priced('150.0000', '150.0000', 1))
  ports.parcels.set(`${TRIP_HELPER_GAP}:${HELPER_A_ID}:helper`, {
    gap: 'HELPER_DAILY_RATE_MISSING',
    status: 'missing',
  })
  ports.parcels.set(
    `${TRIP_DRIVER_HELPED}:${DRIVER_A_ID}:helper`,
    priced('130.0000', '130.0000', 1),
  )
  return { driverPayment, helperPayment, ports }
}

type InMemoryCrew = InMemoryExpenseTrips['trips'][number]['crew']

const include = (ports: InMemoryExpenseTrips, occurrenceId: string, tripId: string) =>
  createIncludeExpenseOccurrenceTripUseCase(ports).execute({
    companyId: COMPANY_A,
    includedBy: USER_ID,
    occurrenceId,
    tripId,
  })

describe('o ajudante no pagamento (spec 325 RF1e, T1.4c)', () => {
  let context: Awaited<ReturnType<typeof setup>>
  beforeEach(async () => {
    context = await setup()
  })

  it('o pagamento cobra as parcelas driver e helper', () => {
    expect(PAYABLE_TRIP_PARCEL_KINDS).toEqual(['driver', 'helper'])
  })

  it('lista as viagens em que ele foi ajudante, com a diária do ajudante × dias; a lacuna vai para pendências', async () => {
    const result = await createListAvailableExpenseTripsUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.helperPayment,
    })

    expect(result.period).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(result.available).toEqual([
      {
        amount: '360.00',
        completedOn: '2026-11-04',
        dailyAmount: '120.0000',
        days: 3,
        parcelKind: 'helper',
        tripId: TRIP_SHARED,
      },
      {
        amount: '150.00',
        completedOn: '2026-11-09',
        dailyAmount: '150.0000',
        days: 1,
        parcelKind: 'helper',
        tripId: TRIP_HELPED,
      },
    ])
    expect(result.pending).toEqual([
      {
        completedOn: '2026-11-12',
        gap: 'HELPER_DAILY_RATE_MISSING',
        parcelKind: 'helper',
        tripId: TRIP_HELPER_GAP,
      },
    ])
  })

  it('quem dirige numa viagem e ajuda noutra aparece com as duas, cada uma pela sua parcela', async () => {
    const result = await createListAvailableExpenseTripsUseCase(context.ports).execute({
      companyId: COMPANY_A,
      occurrenceId: context.driverPayment,
    })

    expect(result.available.map((trip) => [trip.tripId, trip.parcelKind, trip.amount])).toEqual([
      [TRIP_SHARED, 'driver', '600.00'],
      [TRIP_DRIVER_HELPED, 'helper', '130.00'],
    ])
  })

  it('incluir copia a linha do ajudante e o previsto vira a soma; a auditoria diz a parcela', async () => {
    await include(context.ports, context.helperPayment, TRIP_SHARED)
    const result = await include(context.ports, context.helperPayment, TRIP_HELPED)

    expect(result.items.map((trip) => [trip.tripId, trip.parcelKind, trip.amount])).toEqual([
      [TRIP_SHARED, 'helper', '360.00'],
      [TRIP_HELPED, 'helper', '150.00'],
    ])
    expect(result.tripsTotal).toBe('510.00')
    expect(result.occurrence.expectedAmount).toBe('510.00')
    const audit = context.ports.base.auditRows.filter(
      (row) => row.action === 'expense.occurrence.trip.included',
    )
    expect(audit.map((row) => row.metadata?.parcelKind)).toEqual(['helper', 'helper'])
  })

  it('motorista e ajudante da mesma viagem: duas parcelas, cada uma no pagamento da sua pessoa, sem somar a outra', async () => {
    const helper = await include(context.ports, context.helperPayment, TRIP_SHARED)
    const driver = await include(context.ports, context.driverPayment, TRIP_SHARED)

    expect(helper.tripsTotal).toBe('360.00')
    expect(driver.tripsTotal).toBe('600.00')
    expect(
      context.ports.tripLinks.map((link) => [link.tripId, link.parcelKind, link.driverId]),
    ).toEqual([
      [TRIP_SHARED, 'helper', HELPER_A_ID],
      [TRIP_SHARED, 'driver', DRIVER_A_ID],
    ])
  })

  it('a parte do ajudante numa viagem entra em um pagamento só (409); repetir no mesmo é idempotente', async () => {
    const other = await createPayment(context.ports, {
      name: 'Ajudante Zé (extra)',
      payeeDriverId: HELPER_A_ID,
    })
    await include(context.ports, context.helperPayment, TRIP_HELPED)
    const again = await include(context.ports, context.helperPayment, TRIP_HELPED)

    expect(again.items).toHaveLength(1)
    await expect(include(context.ports, other, TRIP_HELPED)).rejects.toBeInstanceOf(
      ExpenseTripAlreadyIncludedError,
    )
  })

  it('ajudante sem diária → 409 com a lacuna; viagem em que ele não estava → 409', async () => {
    const gap = await include(context.ports, context.helperPayment, TRIP_HELPER_GAP).catch(
      (error: unknown) => error,
    )
    expect(gap).toBeInstanceOf(ExpenseTripParcelMissingError)

    await expect(
      include(context.ports, context.helperPayment, TRIP_DRIVER_HELPED),
    ).rejects.toBeInstanceOf(ExpenseTripNotPayeeError)
    expect(context.ports.tripLinks).toEqual([])
  })
})

describe('o rótulo do favorecido (spec 325 RF1e)', () => {
  it('ajudante-puro é helper; quem dirige é agregado (route_table) ou motorista (fixed)', () => {
    expect(resolveExpensePayeeProfile({ canDrive: false, paymentModel: 'fixed' })).toBe('helper')
    expect(resolveExpensePayeeProfile({ canDrive: false, paymentModel: 'route_table' })).toBe(
      'helper',
    )
    expect(resolveExpensePayeeProfile({ canDrive: true, paymentModel: 'route_table' })).toBe(
      'aggregate',
    )
    expect(resolveExpensePayeeProfile({ canDrive: true, paymentModel: 'fixed' })).toBe('driver')
  })

  it('a lista de ocorrências traz o rótulo lido do cadastro', async () => {
    const { ports } = await setup()
    const rows = await createListExpenseOccurrencesUseCase(ports.base).execute({
      companyId: COMPANY_A,
      filters: { competence: '2026-11' },
    })

    expect(
      rows.items
        .map((row) => [row.expenseName, row.payeeProfile])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0]))),
    ).toEqual([
      ['Agregado João', 'aggregate'],
      ['Ajudante Zé', 'helper'],
    ])
  })
})
