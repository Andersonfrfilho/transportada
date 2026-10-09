/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.2 (ADR-0100 §6): o leitor reaproveitável do aviso. Com executor de mentira, sem banco: o
 * custo é fixo — as quatro leituras do calendário, em série, uma vez só para todas as cidades — ou zero,
 * quando o calendário já foi carregado (o prazo da 236 o carrega); calendário recusado não derruba o
 * resto; e o módulo nunca importa o prazo de entrega.
 */
import { describe, expect, test } from 'bun:test'

import { buildBusinessCalendar } from '../../src/business-calendar/domain/business-calendar.policy.js'
import type { BusinessCalendar } from '../../src/business-calendar/domain/business-calendar.types.js'
import type { BusinessCalendarRulesExecutor } from '../../src/business-calendar/infrastructure/business-calendar-rules.query.js'
import { readHolidayWarnings } from '../../src/business-calendar/infrastructure/holiday-warning.reader.js'
import { municipalHolidays } from '../../src/database/delivery-client.schema.js'
import { createRecordingSelectExecutor } from '../fixtures/recording-select-executor.fixture.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const CAMPINAS = '3509502'
const SANTOS = '3548500'
/** Sete dígitos no padrão do município, mas a UF `34` não existe. */
const UNKNOWN_STATE_CITY = '3400000'
const IMPORTED_ROW = {
  cityIbgeCode: CAMPINAS,
  holidayOn: '2026-07-14',
  kind: 'city_anniversary',
  name: 'Aniversário de Campinas',
  providerEntryId: '22222222-2222-4222-8222-222222222222',
  sourceRuleId: null,
}

function recorder(rows: readonly unknown[] = []) {
  return createRecordingSelectExecutor({ rowsByTable: new Map([[municipalHolidays, rows]]) })
}

function item(city: string, date: string, key = `${city}:${date}`) {
  return { cityIbgeCode: city, date, key }
}

function calendarOf(city: string, coverage: { fromYear: number; toYear: number }) {
  return buildBusinessCalendar({
    cityIbgeCode: city,
    coverage,
    municipalRules: [
      {
        cityIbgeCode: city,
        kind: 'holiday',
        name: 'Do calendário já carregado',
        occurrence: { date: '2026-10-20', recurrence: 'once' },
        origin: 'typed',
      },
    ],
    saturdayIsBusinessDay: false,
    stateRules: [],
  })
}

describe('spec 252 T4.2 — o custo do aviso é fixo e em série', () => {
  test('sem item não há consulta', async () => {
    const { executor, stats } = recorder()

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [],
    })

    expect(stats.queryCount).toBe(0)
    expect(result.warnings.size).toBe(0)
  })

  test('as quatro leituras do calendário, uma de cada vez, com 1 ou 50 itens e 1 ou 20 cidades', async () => {
    const small = recorder()
    const large = recorder()
    const cities = Array.from({ length: 20 }, (_unused, index) => String(3500000 + index))

    await readHolidayWarnings(small.executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [item(CAMPINAS, '2026-07-14')],
    })
    await readHolidayWarnings(large.executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: cities.flatMap((city) =>
        ['2026-07-14', '2026-07-15', '2026-08-03'].map((date) => item(city, date)),
      ),
    })

    expect(small.stats.queryCount).toBe(4)
    expect(large.stats.queryCount).toBe(4)
    expect(small.stats.maxInFlight).toBe(1)
    expect(large.stats.maxInFlight).toBe(1)
  })

  test('o feriado importado do dia vira o aviso, com a origem; o outro dia da mesma cidade não', async () => {
    const { executor } = recorder([IMPORTED_ROW])

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [
        { ...item(CAMPINAS, '2026-07-14'), cityName: 'Campinas' },
        item(CAMPINAS, '2026-07-15'),
      ],
    })

    expect([...result.warnings.keys()]).toEqual([`${CAMPINAS}:2026-07-14`])
    expect(result.warnings.get(`${CAMPINAS}:2026-07-14`)).toEqual({
      cityIbgeCode: 3509502,
      cityName: 'Campinas',
      date: '2026-07-14',
      reasons: [{ name: 'Aniversário de Campinas', origin: 'imported', scope: 'municipal' }],
    })
    expect(result.refusals.size).toBe(0)
  })
})

describe('spec 252 T4.2 — o calendário que a 236 já carregou não se carrega de novo', () => {
  test('cobertura suficiente: zero consultas, e o aviso sai do calendário conhecido', async () => {
    const { executor, stats } = recorder()
    const known = new Map<string, BusinessCalendar>([
      [CAMPINAS, calendarOf(CAMPINAS, { fromYear: 2026, toYear: 2027 })],
    ])

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [item(CAMPINAS, '2026-10-20'), item(CAMPINAS, '2027-03-02')],
      knownCalendars: known,
    })

    expect(stats.queryCount).toBe(0)
    expect([...result.warnings.keys()]).toEqual([`${CAMPINAS}:2026-10-20`])
  })

  test('uma cidade que o prazo não carregou pede as quatro leituras, uma vez só', async () => {
    const { executor, stats } = recorder([{ ...IMPORTED_ROW, cityIbgeCode: SANTOS }])
    const known = new Map<string, BusinessCalendar>([
      [CAMPINAS, calendarOf(CAMPINAS, { fromYear: 2026, toYear: 2027 })],
    ])

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [item(CAMPINAS, '2026-10-20'), item(SANTOS, '2026-07-14')],
      knownCalendars: known,
    })

    expect(stats.queryCount).toBe(4)
    expect([...result.warnings.keys()].sort()).toEqual([
      `${CAMPINAS}:2026-10-20`,
      `${SANTOS}:2026-07-14`,
    ])
  })

  test('calendário conhecido que não cobre o ano do item é recarregado (+4), nunca "sem feriado"', async () => {
    const { executor, stats } = recorder([IMPORTED_ROW])
    const known = new Map<string, BusinessCalendar>([
      [CAMPINAS, calendarOf(CAMPINAS, { fromYear: 2025, toYear: 2025 })],
    ])

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [item(CAMPINAS, '2026-07-14')],
      knownCalendars: known,
    })

    expect(stats.queryCount).toBe(4)
    expect(result.warnings.has(`${CAMPINAS}:2026-07-14`)).toBe(true)
  })
})

describe('spec 252 T4.2 — calendário recusado não derruba o resto', () => {
  test('cidade de UF desconhecida sai em `refusals` com o código; as outras seguem avisando', async () => {
    const { executor } = recorder([IMPORTED_ROW])

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [item(UNKNOWN_STATE_CITY, '2026-07-14'), item(CAMPINAS, '2026-07-14')],
    })

    expect(result.refusals.get(UNKNOWN_STATE_CITY)).toBe('BUSINESS_CALENDAR_UNKNOWN_STATE')
    expect([...result.warnings.keys()]).toEqual([`${CAMPINAS}:2026-07-14`])
  })

  test('datas que a cobertura de cinco anos não alcança são recusa tipada, não aviso nem erro solto', async () => {
    const { executor } = recorder()

    const result = await readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
      companyId: COMPANY_ID,
      items: [item(CAMPINAS, '2026-07-14'), item(CAMPINAS, '2040-07-14')],
    })

    expect(result.refusals.get(CAMPINAS)).toBe('BUSINESS_CALENDAR_COVERAGE_TOO_WIDE')
    expect(result.warnings.size).toBe(0)
  })

  test('falha do banco propaga: o chamador decide se derruba a leitura', async () => {
    const { executor } = createRecordingSelectExecutor({ rejectWith: new Error('DB_DOWN') })

    await expect(
      readHolidayWarnings(executor as BusinessCalendarRulesExecutor, {
        companyId: COMPANY_ID,
        items: [item(CAMPINAS, '2026-07-14')],
      }),
    ).rejects.toThrow('DB_DOWN')
  })
})
