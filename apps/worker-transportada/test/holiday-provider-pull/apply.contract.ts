/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import type { HolidayApplyStore } from '../../src/holiday-provider-pull/application/holiday-apply.port.js'
import { createApplyHolidayProviderUseCase } from '../../src/holiday-provider-pull/application/apply-holiday-provider.use-case.js'
import { countNationalMismatch } from '../../src/holiday-provider-pull/domain/national-holiday-parity.policy.js'
import { listNationalHolidayDates } from '../../src/holiday-provider-pull/domain/national-holiday.policy.js'
import { buildBusinessCalendarLockId } from '../../src/holiday-provider-pull/infrastructure/business-calendar-lock.support.js'
import {
  buildPoolWindowKey,
  resolveStopWindows,
} from '../../src/routing/domain/pool-window.policy.js'

const COMPANY_A = '11111111-1111-4111-8111-111111111111'
const COMPANY_B = '22222222-2222-4222-8222-222222222222'

type FakeApplyStore = HolidayApplyStore & {
  readonly applied: Array<{ readonly companyId: string; readonly today: string }>
  readonly nationalReads: Array<readonly number[]>
}

function buildStore(input: {
  readonly companies?: readonly string[]
  readonly failFor?: string
  readonly national?: ReadonlyMap<number, readonly string[]>
}): FakeApplyStore {
  const applied: FakeApplyStore['applied'] = []
  const nationalReads: FakeApplyStore['nationalReads'] = []

  return {
    applied,
    async applyCompany({ companyId, today }) {
      applied.push({ companyId, today })
      if (companyId === input.failFor) throw new Error('deadlock detected for 11222333000181')
      return { municipalInserted: 2, stateInserted: 1 }
    },
    async listCompanies() {
      return input.companies ?? [COMPANY_A, COMPANY_B]
    },
    nationalReads,
    async readNationalDates({ years }) {
      nationalReads.push(years)
      return input.national ?? new Map()
    },
  }
}

function buildUseCase(input: {
  readonly now?: Date
  readonly store: HolidayApplyStore
  readonly logged?: unknown[][]
}) {
  const record = (...args: unknown[]) => {
    input.logged?.push(args)
  }
  return createApplyHolidayProviderUseCase({
    logger: { debug: record, error: record, info: record, warn: record } as never,
    now: () => input.now ?? new Date('2026-10-09T12:00:00.000Z'),
    store: input.store,
  })
}

describe('o calendário nacional da paridade (spec 252 T3.4, D4)', () => {
  test('é o mesmo da API, ano a ano, de 2000 a 2100', async () => {
    const api = (await import(
      new URL(
        '../../../api-transportada/src/business-calendar/domain/national-holiday.policy.ts',
        import.meta.url,
      ).href
    )) as { listNationalHolidays: (year: number) => ReadonlyArray<{ date: string }> }

    for (let year = 2000; year <= 2100; year += 1) {
      expect(listNationalHolidayDates(year)).toEqual(
        api.listNationalHolidays(year).map((holiday) => holiday.date),
      )
    }
  })

  test('2026 confere com a lista conhecida: 9 fixos, Carnaval em dois dias, Sexta-feira Santa e Corpus Christi', () => {
    expect(listNationalHolidayDates(2026)).toEqual([
      '2026-01-01',
      '2026-02-16',
      '2026-02-17',
      '2026-04-03',
      '2026-04-21',
      '2026-05-01',
      '2026-06-04',
      '2026-09-07',
      '2026-10-12',
      '2026-11-02',
      '2026-11-15',
      '2026-11-20',
      '2026-12-25',
    ])
  })

  test('a divergência é a diferença simétrica entre o fornecedor e o código', () => {
    const code = listNationalHolidayDates(2026)

    expect(countNationalMismatch({ code, provider: code })).toBe(0)
    expect(countNationalMismatch({ code, provider: code.slice(1) })).toBe(1)
    expect(countNationalMismatch({ code, provider: [...code, '2026-04-05'] })).toBe(1)
    expect(
      countNationalMismatch({ code, provider: [...code.slice(2), '2026-04-05', '2026-04-05'] }),
    ).toBe(3)
  })
})

describe('a trava do calendário por empresa é a da API (spec 252 T3.4, ADR-0096)', () => {
  test('a derivação do identificador é idêntica, linha a linha', async () => {
    const [worker, api] = await Promise.all([
      readFile(
        new URL(
          '../../src/holiday-provider-pull/infrastructure/business-calendar-lock.support.ts',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL(
          '../../../api-transportada/src/business-calendar/infrastructure/business-calendar-lock.support.ts',
          import.meta.url,
        ),
        'utf8',
      ),
    ])
    const derivation = (source: string) =>
      source
        .split('\n')
        .filter((line) => /const (encoded|digest|lockId) =/u.test(line))
        .map((line) => line.trim())

    expect(derivation(worker)).toHaveLength(3)
    expect(derivation(worker)).toEqual(derivation(api))
    expect(await buildBusinessCalendarLockId(COMPANY_A)).not.toBe(
      await buildBusinessCalendarLockId(COMPANY_B),
    )
  })
})

describe('a Fase 1 da 252 está no código que esta rotina alimenta (spec 252 T3.4)', () => {
  test('o feriado da cidade B não fecha o cliente da cidade A, e o mesmo CNPJ em duas cidades fecha só em B', () => {
    const sources = {
      exceptions: [],
      holidays: [{ cityIbgeCode: '3550308', holidayOn: '2050-07-14' }],
      windows: [{ closesAt: '17:00', deliveryClientId: 'client', opensAt: '08:00', weekday: 4 }],
    }
    const windows = resolveStopWindows({
      clients: [{ id: 'client', taxId: '11222333000181' }],
      date: '2050-07-14',
      sources,
      stops: [
        { cityCode: '3509502', taxIds: ['11222333000181'] },
        { cityCode: '3550308', taxIds: ['11222333000181'] },
      ],
    })

    const cityA = windows.get(buildPoolWindowKey({ cityCode: '3509502', taxId: '11222333000181' }))
    const cityB = windows.get(buildPoolWindowKey({ cityCode: '3550308', taxId: '11222333000181' }))
    expect(cityA).toEqual([{ closesAt: '17:00', opensAt: '08:00' }])
    expect(cityB).toEqual([])
  })
})

describe('a aplicação dos feriados importados (spec 252 T3.4)', () => {
  test('aplica empresa por empresa, com o dia civil de São Paulo do relógio injetado (D7)', async () => {
    const store = buildStore({})

    const tally = await buildUseCase({ now: new Date('2026-10-10T02:00:00.000Z'), store }).execute({
      isStopRequested: () => false,
    })

    expect(store.applied).toEqual([
      { companyId: COMPANY_A, today: '2026-10-09' },
      { companyId: COMPANY_B, today: '2026-10-09' },
    ])
    expect(tally).toMatchObject({ companies: 2, municipalInserted: 4, stateInserted: 2 })
  })

  test('conta a divergência do calendário nacional sem gravar nada', async () => {
    const complete = listNationalHolidayDates(2026)
    const store = buildStore({
      national: new Map([
        [2026, complete.slice(1)],
        [2027, listNationalHolidayDates(2027)],
      ]),
    })

    const tally = await buildUseCase({ store }).execute({ isStopRequested: () => false })

    expect(tally.nationalMismatch).toBe(1)
    expect(store.nationalReads).toEqual([[2026, 2027]])
  })

  test('uma empresa que falha não derruba as outras, e o log não carrega o texto do erro', async () => {
    const logged: unknown[][] = []
    const store = buildStore({ failFor: COMPANY_A })

    const tally = await buildUseCase({ logged, store }).execute({ isStopRequested: () => false })

    expect(tally.failedCompanies).toBe(1)
    expect(store.applied.map((call) => call.companyId)).toEqual([COMPANY_A, COMPANY_B])
    expect(tally.municipalInserted).toBe(2)
    expect(JSON.stringify(logged)).not.toContain('11222333000181')
  })

  test('a parada pedida é lida entre as empresas', async () => {
    const store = buildStore({})

    const tally = await buildUseCase({ store }).execute({
      isStopRequested: () => store.applied.length >= 1,
    })

    expect(store.applied).toHaveLength(1)
    expect(tally.companies).toBe(1)
  })
})
