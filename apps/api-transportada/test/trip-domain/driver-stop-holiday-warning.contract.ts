/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.3 (ADR-0100 D12): o aviso de feriado nas paradas de `GET /me/trips/current`. O caso de uso
 * chama o módulo do aviso DEPOIS de ler as viagens do motorista: só parada não concluída, com ETA; a data
 * é o dia civil de São Paulo da ETA, ou HOJE com a parada em andamento; o nome da cidade só quando o
 * endereço da nota é o da cidade da parada; e nada do aviso derruba a leitura.
 */
import { describe, expect, test } from 'bun:test'

import type {
  HolidayWarningItem,
  HolidayWarningPort,
  HolidayWarningsResult,
} from '../../src/business-calendar/application/holiday-warning.port.js'
import type { HolidayWarning } from '../../src/business-calendar/domain/holiday-warning.policy.js'
import { attachDriverStopHolidayWarnings } from '../../src/trips/application/attach-driver-stop-holiday-warnings.service.js'
import type {
  DriverHolidayWarningsDependency,
  DriverStopHolidayContext,
} from '../../src/trips/application/driver-stop-holiday-warning.port.js'
import {
  findCurrentDriverTrip,
  type CurrentDriverTripPort,
  type DriverTrip,
  type DriverTripStop,
} from '../../src/trips/application/find-current-driver-trip.use-case.js'
import type { ApiLogger } from '../../src/shared/api.types.js'

const COMPANY_ID = '5d1c6b5e-8f0a-4a52-9b8e-1f0f2d6f6a01'
const TRIP_ID = '0b6a4d7e-2d5c-4f43-8a54-6d3f9d1a7b02'
const CAMPINAS = '3509502'
const SAO_CARLOS = '3548906'
const WEDNESDAY_21 = new Date('2026-10-21T15:00:00.000Z')
/** 22/10 às 22h30 em São Paulo: já é dia 23 em UTC. */
const NIGHT_OF_22_IN_SAO_PAULO = new Date('2026-10-23T01:30:00.000Z')
const NOW = new Date('2026-10-21T13:00:00.000Z')

function buildStop(overrides: Partial<DriverTripStop> & { readonly id: string }): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    enRouteSince: null,
    enRouteTappedAt: null,
    label: 'Rua A, 1, Campinas, SP',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

function buildTrip(stops: readonly DriverTripStop[], id = TRIP_ID): DriverTrip {
  return {
    createdAt: '2026-10-20T10:00:00.000Z',
    crewRole: 'driver',
    id,
    manifest: null,
    status: 'in_transit',
    stops,
    vehiclePlate: 'ABC1D23',
  }
}

function buildContext(
  stopId: string,
  overrides: Partial<DriverStopHolidayContext> = {},
): DriverStopHolidayContext {
  return {
    address: { city: 'Campinas', cityCode: CAMPINAS },
    addressKey: `${CAMPINAS}|13010000|10`,
    estimatedArrivalAt: WEDNESDAY_21,
    stopId,
    ...overrides,
  }
}

function buildWarning(date: string, cityIbgeCode = Number(CAMPINAS)): HolidayWarning {
  return {
    cityIbgeCode,
    cityName: 'Campinas',
    date,
    reasons: [{ name: 'Aniversário', origin: 'imported', scope: 'municipal' }],
  }
}

type Harness = {
  readonly calendarCalls: { readonly items: readonly HolidayWarningItem[] }[]
  readonly contextCalls: { readonly companyId: string; readonly stopIds: readonly string[] }[]
  readonly dependency: DriverHolidayWarningsDependency
  readonly warnings: { readonly metadata: unknown; readonly message: string }[]
}

type HarnessParams = {
  readonly calendar?: HolidayWarningPort['read']
  readonly contexts: readonly DriverStopHolidayContext[]
  readonly contextsFailure?: Error
}

function buildHarness(params: HarnessParams): Harness {
  const calendarCalls: { readonly items: readonly HolidayWarningItem[] }[] = []
  const contextCalls: { readonly companyId: string; readonly stopIds: readonly string[] }[] = []
  const warnings: { readonly metadata: unknown; readonly message: string }[] = []
  const logger: ApiLogger = {
    error: () => undefined,
    info: () => undefined,
    warn: (message, metadata) => {
      warnings.push({ message, metadata })
    },
  }
  const defaultCalendar = (): Promise<HolidayWarningsResult> =>
    Promise.resolve({ refusals: new Map(), warnings: new Map() })
  return {
    calendarCalls,
    contextCalls,
    dependency: {
      calendar: {
        read: (readParams) => {
          calendarCalls.push({ items: readParams.items })
          return (params.calendar ?? defaultCalendar)(readParams)
        },
      },
      contexts: {
        list: (input) => {
          contextCalls.push(input)
          if (params.contextsFailure !== undefined) return Promise.reject(params.contextsFailure)
          return Promise.resolve(params.contexts)
        },
      },
      logger,
    },
    warnings,
  }
}

function warnEveryStop(date: (item: HolidayWarningItem) => string) {
  return (readParams: { readonly items: readonly HolidayWarningItem[] }) =>
    Promise.resolve<HolidayWarningsResult>({
      refusals: new Map(),
      warnings: new Map(readParams.items.map((item) => [item.key, buildWarning(date(item))])),
    })
}

describe('o aviso de feriado nas paradas do motorista — quais paradas e que dia (spec 252 T4.3)', () => {
  test('só a parada não concluída pergunta ao calendário, no dia civil de São Paulo da ETA', async () => {
    const open = buildStop({ id: 'stop-open' })
    const night = buildStop({ id: 'stop-night' })
    const done = buildStop({ completedAt: '2026-10-21T12:00:00.000Z', id: 'stop-done' })
    const harness = buildHarness({
      calendar: warnEveryStop((item) => item.date),
      contexts: [
        buildContext('stop-open'),
        buildContext('stop-night', { estimatedArrivalAt: NIGHT_OF_22_IN_SAO_PAULO }),
      ],
    })

    const [trip] = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [buildTrip([open, night, done])],
    })

    expect(harness.contextCalls).toEqual([
      { companyId: COMPANY_ID, stopIds: ['stop-open', 'stop-night'] },
    ])
    expect(harness.calendarCalls[0]?.items.map(({ date, key }) => ({ date, key }))).toEqual([
      { date: '2026-10-21', key: 'stop-open' },
      { date: '2026-10-22', key: 'stop-night' },
    ])
    expect(trip?.stops.map((stop) => stop.holidayWarnings?.[0]?.date)).toEqual([
      '2026-10-21',
      '2026-10-22',
      undefined,
    ])
    expect('holidayWarnings' in (trip?.stops[2] ?? {})).toBe(false)
  })

  test('com a parada em andamento (chegou ou a caminho) o dia é HOJE em São Paulo, não o da ETA', async () => {
    const arrived = buildStop({ arrivedAt: '2026-10-23T01:00:00.000Z', id: 'stop-arrived' })
    const enRoute = buildStop({ enRouteSince: '2026-10-23T01:00:00.000Z', id: 'stop-en-route' })
    const harness = buildHarness({
      calendar: warnEveryStop((item) => item.date),
      contexts: [buildContext('stop-arrived'), buildContext('stop-en-route')],
    })

    await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NIGHT_OF_22_IN_SAO_PAULO,
      trips: [buildTrip([arrived, enRoute])],
    })

    expect(harness.calendarCalls[0]?.items.map((item) => item.date)).toEqual([
      '2026-10-22',
      '2026-10-22',
    ])
  })

  test('sem ETA: a parada em andamento avisa para hoje; a que ainda não começou não pergunta ao calendário', async () => {
    const arrived = buildStop({ arrivedAt: '2026-10-23T01:00:00.000Z', id: 'stop-arrived-no-eta' })
    const notStarted = buildStop({ id: 'stop-not-started-no-eta' })
    const harness = buildHarness({
      calendar: warnEveryStop((item) => item.date),
      contexts: [
        buildContext('stop-arrived-no-eta', { estimatedArrivalAt: null }),
        buildContext('stop-not-started-no-eta', { estimatedArrivalAt: null }),
      ],
    })

    const [trip] = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NIGHT_OF_22_IN_SAO_PAULO,
      trips: [buildTrip([arrived, notStarted])],
    })

    expect(harness.calendarCalls[0]?.items.map(({ date, key }) => ({ date, key }))).toEqual([
      { date: '2026-10-22', key: 'stop-arrived-no-eta' },
    ])
    expect(trip?.stops[0]?.holidayWarnings).toHaveLength(1)
    expect('holidayWarnings' in (trip?.stops[1] ?? {})).toBe(false)
  })

  test('parada sem contexto (sem ETA) e cidade que não é código IBGE não perguntam ao calendário', async () => {
    const harness = buildHarness({
      contexts: [
        buildContext('stop-bad-key', { addressKey: 'SEM-ENDERECO|0|0' }),
        buildContext('stop-empty-key', { addressKey: '|13010000|10' }),
      ],
    })

    const trips = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [
        buildTrip([
          buildStop({ id: 'stop-no-eta' }),
          buildStop({ id: 'stop-bad-key' }),
          buildStop({ id: 'stop-empty-key' }),
        ]),
      ],
    })

    expect(harness.calendarCalls).toEqual([])
    expect(trips[0]?.stops.every((stop) => !('holidayWarnings' in stop))).toBe(true)
  })

  test('uma consulta de contexto e uma de calendário para todas as viagens e paradas', async () => {
    const stopsA = ['a1', 'a2', 'a3'].map((id) => buildStop({ id }))
    const stopsB = ['b1', 'b2'].map((id) => buildStop({ id }))
    const harness = buildHarness({
      contexts: [...stopsA, ...stopsB].map((stop, index) =>
        buildContext(stop.id, { addressKey: `${3500000 + index}|13010000|1` }),
      ),
    })

    await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [buildTrip(stopsA, 'trip-a'), buildTrip(stopsB, 'trip-b')],
    })

    expect(harness.contextCalls).toHaveLength(1)
    expect(harness.calendarCalls).toHaveLength(1)
    expect(harness.calendarCalls[0]?.items).toHaveLength(5)
  })

  test('sem parada aberta nada é consultado; sem ETA em nenhuma só o contexto é', async () => {
    const harness = buildHarness({ contexts: [] })
    const done = buildStop({ completedAt: '2026-10-21T12:00:00.000Z', id: 'done' })

    await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [buildTrip([done])],
    })
    expect(harness.contextCalls).toEqual([])
    expect(harness.calendarCalls).toEqual([])

    await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [buildTrip([buildStop({ id: 'open' })])],
    })
    expect(harness.contextCalls).toHaveLength(1)
    expect(harness.calendarCalls).toEqual([])
  })
})

describe('o aviso de feriado nas paradas do motorista — o nome da cidade (spec 252 T4.3)', () => {
  async function itemOf(
    context: DriverStopHolidayContext,
  ): Promise<HolidayWarningItem | undefined> {
    const harness = buildHarness({ contexts: [context] })
    await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [buildTrip([buildStop({ id: context.stopId })])],
    })
    return harness.calendarCalls[0]?.items[0]
  }

  test('sai quando o endereço da nota é o da cidade da parada', async () => {
    expect(await itemOf(buildContext('s1'))).toMatchObject({
      cityIbgeCode: CAMPINAS,
      cityName: 'Campinas',
    })
  })

  test('some (a chave fica ausente, nunca nula) com desvio, sem endereço ou com nome vazio', async () => {
    const diverted = await itemOf(
      buildContext('s2', { address: { city: 'São Carlos', cityCode: SAO_CARLOS } }),
    )
    const withoutAddress = await itemOf(buildContext('s3', { address: undefined }))
    const blank = await itemOf(buildContext('s4', { address: { city: '', cityCode: CAMPINAS } }))

    for (const item of [diverted, withoutAddress, blank]) {
      expect(item).toMatchObject({ cityIbgeCode: CAMPINAS })
      expect(item !== undefined && 'cityName' in item).toBe(false)
    }
  })
})

describe('o aviso de feriado nas paradas do motorista — o que sai (spec 252 T4.3)', () => {
  test('a parada ganha só holidayWarnings; o resto da viagem e o contexto interno não aparecem', async () => {
    const stop = buildStop({ id: 'stop-1' })
    const trip = buildTrip([stop])
    const harness = buildHarness({
      calendar: warnEveryStop((item) => item.date),
      contexts: [buildContext('stop-1')],
    })

    const [result] = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips: [trip],
    })

    expect(result?.stops[0]).toEqual({ ...stop, holidayWarnings: [buildWarning('2026-10-21')] })
    expect(JSON.stringify(result)).not.toContain('addressKey')
    expect(JSON.stringify(result)).not.toContain('estimatedArrivalAt')
    expect(trip.stops[0]).toBe(stop)
    expect('holidayWarnings' in stop).toBe(false)
  })

  test('sem a dependência a viagem volta como veio, sem consulta nenhuma', async () => {
    const trips = [buildTrip([buildStop({ id: 'stop-1' })])]

    const result = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      now: NOW,
      trips,
    })

    expect(result).toBe(trips)
  })
})

describe('o aviso de feriado nas paradas do motorista — falha não derruba a leitura (spec 252 T4.3)', () => {
  const trips = [buildTrip([buildStop({ id: 'stop-1' })])]

  test('o calendário que cai tira o aviso, deixa rastro só com ids e contagem, e a viagem segue', async () => {
    const harness = buildHarness({
      calendar: () => Promise.reject(new Error('boom: Campinas 12345678901')),
      contexts: [buildContext('stop-1')],
    })

    const result = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips,
    })

    expect(result).toEqual(trips)
    expect(harness.warnings).toEqual([
      {
        message: 'driver_holiday_warning_unavailable',
        metadata: { affectedStopCount: 1, companyId: COMPANY_ID, tripIds: [TRIP_ID] },
      },
    ])
    expect(JSON.stringify(harness.warnings)).not.toContain('boom')
    expect(JSON.stringify(harness.warnings)).not.toContain('Campinas')
  })

  test('a leitura do contexto que cai também só tira o aviso', async () => {
    const harness = buildHarness({ contexts: [], contextsFailure: new Error('boom') })

    const result = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips,
    })

    expect(result).toEqual(trips)
    expect(harness.warnings).toHaveLength(1)
    expect(harness.calendarCalls).toEqual([])
  })

  test('o calendário recusado para uma cidade tira o aviso dela e deixa rastro só com o código', async () => {
    const harness = buildHarness({
      calendar: () =>
        Promise.resolve({
          refusals: new Map([[CAMPINAS, 'BUSINESS_CALENDAR_COVERAGE_TOO_WIDE' as const]]),
          warnings: new Map(),
        }),
      contexts: [buildContext('stop-1')],
    })

    const result = await attachDriverStopHolidayWarnings({
      companyId: COMPANY_ID,
      dependency: harness.dependency,
      now: NOW,
      trips,
    })

    expect(result).toEqual(trips)
    expect(harness.warnings).toEqual([
      {
        message: 'driver_holiday_warning_unavailable',
        metadata: {
          affectedStopCount: 1,
          code: 'BUSINESS_CALENDAR_COVERAGE_TOO_WIDE',
          companyId: COMPANY_ID,
          tripIds: [TRIP_ID],
        },
      },
    ])
  })
})

describe('findCurrentDriverTrip chama o aviso depois de ler as viagens, sem mexer na nota (spec 252 T4.3)', () => {
  const stop = buildStop({ id: 'stop-1' })
  const repository: CurrentDriverTripPort = {
    findDriverIdByMembership: () => Promise.resolve('driver-1'),
    listActiveTrips: () => Promise.resolve([buildTrip([stop])]),
    listPendingProofs: () => Promise.resolve([]),
  }
  const scores = { readScores: () => Promise.resolve(new Map([['driver-1', 85]])) }
  const input = {
    companyId: COMPANY_ID,
    membershipId: 'membership-1',
    now: NOW,
    repository,
    scores,
  }

  test('com a dependência a parada traz o aviso; a nota e as fotos pendentes são as mesmas', async () => {
    const harness = buildHarness({
      calendar: warnEveryStop((item) => item.date),
      contexts: [buildContext('stop-1')],
    })

    const without = await findCurrentDriverTrip(input)
    const withWarnings = await findCurrentDriverTrip({
      ...input,
      holidayWarnings: harness.dependency,
    })

    expect(withWarnings.trips[0]?.stops[0]?.holidayWarnings).toHaveLength(1)
    expect(
      without.trips[0]?.stops[0] !== undefined && 'holidayWarnings' in without.trips[0].stops[0],
    ).toBe(false)
    expect(withWarnings.score).toBe(without.score)
    expect(withWarnings.pendingProofs).toEqual(without.pendingProofs)
    expect(withWarnings.isRegisteredDriver).toBe(without.isRegisteredDriver)
  })

  test('conta sem cadastro de motorista não consulta o aviso', async () => {
    const harness = buildHarness({ contexts: [buildContext('stop-1')] })

    const result = await findCurrentDriverTrip({
      ...input,
      holidayWarnings: harness.dependency,
      repository: { ...repository, findDriverIdByMembership: () => Promise.resolve(null) },
    })

    expect(result.isRegisteredDriver).toBe(false)
    expect(harness.contextCalls).toEqual([])
  })
})
