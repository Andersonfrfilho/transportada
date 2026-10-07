/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 RF2: o feriado nacional do backend é o mesmo do calendário que o painel já usa
 * (`brazilianHoliday.service.ts`). A paridade compara o CONJUNTO de datas por ano: em 1905, 1916,
 * 2000, 2079 e 2152 a Sexta-feira Santa cai em 21/04, e o painel lista a data duas vezes.
 * O módulo do painel é carregado por URL de arquivo — nenhuma app importa código-fonte de outra em
 * produção; o teste é quem prende as duas cópias juntas.
 */
import { describe, expect, test } from 'bun:test'

import { listNationalHolidays } from '../../src/business-calendar/domain/national-holiday.policy.js'

const PANEL_HOLIDAY_SERVICE = new URL(
  '../../../frontend-transportada/src/components/ui/brazilianHoliday.service.ts',
  import.meta.url,
)

const FIRST_PARITY_YEAR = 1900
const LAST_PARITY_YEAR = 2199

type PanelHolidayModule = {
  readonly listBrazilianHolidays: (year: number) => readonly { readonly date: string }[]
}

async function loadPanelHolidayModule(): Promise<PanelHolidayModule> {
  return (await import(PANEL_HOLIDAY_SERVICE.href)) as PanelHolidayModule
}

function distinctSortedDates(holidays: readonly { readonly date: string }[]): readonly string[] {
  return [...new Set(holidays.map((holiday) => holiday.date))].toSorted()
}

const PARITY_YEARS = Array.from(
  { length: LAST_PARITY_YEAR - FIRST_PARITY_YEAR + 1 },
  (_, index) => FIRST_PARITY_YEAR + index,
)

describe('spec 238 — feriados nacionais', () => {
  test('a lista de 2026 tem as datas e as chaves estáveis', () => {
    expect(listNationalHolidays(2026)).toEqual([
      { date: '2026-01-01', key: 'universal_fraternization' },
      { date: '2026-02-16', key: 'carnival' },
      { date: '2026-02-17', key: 'carnival' },
      { date: '2026-04-03', key: 'good_friday' },
      { date: '2026-04-21', key: 'tiradentes' },
      { date: '2026-05-01', key: 'labour_day' },
      { date: '2026-06-04', key: 'corpus_christi' },
      { date: '2026-09-07', key: 'independence_day' },
      { date: '2026-10-12', key: 'our_lady_of_aparecida' },
      { date: '2026-11-02', key: 'all_souls_day' },
      { date: '2026-11-15', key: 'republic_proclamation' },
      { date: '2026-11-20', key: 'black_consciousness' },
      { date: '2026-12-25', key: 'christmas' },
    ])
  })

  test('Sexta-feira Santa em Tiradentes só nos anos conhecidos, com as duas causas', () => {
    const collisionYears = PARITY_YEARS.filter((year) => {
      const dates = listNationalHolidays(year).map((holiday) => holiday.date)
      return new Set(dates).size !== dates.length
    })

    expect(collisionYears).toEqual([1905, 1916, 2000, 2079, 2152])
    expect(listNationalHolidays(2000).filter((holiday) => holiday.date === '2000-04-21')).toEqual([
      { date: '2000-04-21', key: 'tiradentes' },
      { date: '2000-04-21', key: 'good_friday' },
    ])
  })
})

describe('spec 238 — paridade painel × backend', () => {
  test(`o conjunto de datas é o mesmo de ${String(FIRST_PARITY_YEAR)} a ${String(LAST_PARITY_YEAR)}`, async () => {
    const panel = await loadPanelHolidayModule()

    const divergentYears = PARITY_YEARS.filter((year) => {
      const backendDates = distinctSortedDates(listNationalHolidays(year))
      const panelDates = distinctSortedDates(panel.listBrazilianHolidays(year))
      return backendDates.join() !== panelDates.join()
    })

    expect(divergentYears).toEqual([])
  })

  test('a paridade enxerga uma divergência quando ela existe', async () => {
    const panel = await loadPanelHolidayModule()

    const backendDates = distinctSortedDates(listNationalHolidays(2026))
    const panelDates = distinctSortedDates(panel.listBrazilianHolidays(2027))

    expect(backendDates.join()).not.toBe(panelDates.join())
  })
})
