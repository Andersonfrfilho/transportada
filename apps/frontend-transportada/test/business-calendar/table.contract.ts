/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (`web.md` §7): as linhas da tabela (a regra "todo ano" é UMA linha, a data gerada por ela não é
 * linha), a ordenação asc → desc → neutro, o filtro de seleção MÚLTIPLA, a página, e tudo isso na URL.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildMunicipalRows,
  buildStateRows,
  describeHolidayDate,
} from '@/modules/company-settings/shared/businessCalendarRows.service'
import {
  applyHolidayTable,
  EMPTY_HOLIDAY_TABLE_STATE,
  HOLIDAY_PAGE_SIZE,
  hasHolidayTableCriteria,
  parseHolidayTableState,
  serializeHolidayTableState,
  toggleHolidaySort,
  type HolidayTableState,
} from '@/modules/company-settings/shared/businessCalendarTable.service'

import {
  buildHoliday,
  buildOnceStateHoliday,
  buildRule,
  buildYearlyStateHoliday,
  CAMPINAS_CODE,
  CURITIBA_CODE,
  OTHER_RULE_ID,
  RULE_ID,
} from '../fixtures/businessCalendar.fixture'

const LABELS: Readonly<Record<string, string>> = {
  [CAMPINAS_CODE]: 'Campinas',
  [CURITIBA_CODE]: 'Curitiba',
  '3304557': 'Rio de Janeiro',
}

function labelOf(code: string): string {
  return LABELS[code] ?? code
}

function municipalRows() {
  return buildMunicipalRows({
    holidays: [
      buildHoliday(),
      ...Array.from({ length: 11 }, (_, index) =>
        buildHoliday({
          generatedByRuleId: RULE_ID,
          holidayOn: `${String(2026 + index)}-07-14`,
          id: `generated-${String(index)}`,
          kind: 'city_anniversary',
          name: 'Aniversário de Campinas',
          cityIbgeCode: CAMPINAS_CODE,
        }),
      ),
    ],
    labelOf,
    rules: [
      buildRule(),
      buildRule({
        cityIbgeCode: '3304557',
        day: 20,
        id: OTHER_RULE_ID,
        kind: 'holiday',
        month: 1,
        name: 'São Sebastião',
      }),
    ],
  })
}

describe('linhas do município', () => {
  test('a regra é uma linha; as onze datas geradas por ela não são linhas', () => {
    const rows = municipalRows()

    expect(rows).toHaveLength(3)
    expect(rows.filter((row) => row.origin === 'rule')).toHaveLength(2)
    expect(rows.filter((row) => row.origin === 'date')).toHaveLength(1)
  })

  test('a regra mostra mês e dia, quanto foi gerado e a cidade pelo nome', () => {
    const rule = municipalRows().find((row) => row.id === RULE_ID)

    expect(rule).toMatchObject({
      day: 14,
      kind: 'city_anniversary',
      materializedThroughYear: 2036,
      month: 7,
      name: 'Aniversário de Campinas',
      placeLabel: 'Campinas',
      recurrence: 'yearly',
      stateIbgeCode: '35',
    })
  })

  test('a data digitada é "só esta data", e a cidade sem nome conhecido mostra o código', () => {
    const rows = buildMunicipalRows({
      holidays: [buildHoliday({ cityIbgeCode: '1100015' })],
      labelOf,
      rules: [],
    })

    expect(rows[0]).toMatchObject({
      holidayOn: '2026-09-08',
      origin: 'date',
      placeLabel: '1100015',
      recurrence: 'once',
      stateIbgeCode: '11',
    })
  })

  test('a contagem de datas digitadas no dia da regra vai na linha', () => {
    const rows = buildMunicipalRows({
      holidays: [],
      labelOf,
      rules: [buildRule({ typedHolidaysKept: 2 })],
    })

    expect(rows[0]?.typedHolidaysKept).toBe(2)
  })
})

describe('linhas do estado', () => {
  test('cada feriado estadual é uma linha, com a UF como lugar', () => {
    const rows = buildStateRows({
      holidays: [buildYearlyStateHoliday(), buildOnceStateHoliday()],
      labelOf: (code) => (code === '35' ? 'SP' : 'PR'),
    })

    expect(rows.map((row) => [row.origin, row.placeLabel, row.recurrence, row.kind])).toEqual([
      ['state', 'SP', 'yearly', 'holiday'],
      ['state', 'PR', 'once', 'holiday'],
    ])
  })
})

describe('a data de cada linha', () => {
  test('"todo ano" mostra dia/mês; "só esta data" mostra dia/mês/ano', () => {
    const [rule, date] = [
      municipalRows().find((row) => row.id === RULE_ID),
      municipalRows().find((row) => row.origin === 'date'),
    ]

    expect(rule && describeHolidayDate(rule)).toBe('14/07')
    expect(date && describeHolidayDate(date)).toBe('08/09/2026')
  })
})

describe('ordenação', () => {
  test('asc → desc → neutro no mesmo cabeçalho; outro cabeçalho recomeça em asc', () => {
    const first = toggleHolidaySort({ column: 'name', current: null })
    const second = toggleHolidaySort({ column: 'name', current: first })
    const third = toggleHolidaySort({ column: 'name', current: second })

    expect(first).toEqual({ column: 'name', direction: 'asc' })
    expect(second).toEqual({ column: 'name', direction: 'desc' })
    expect(third).toBeNull()
    expect(toggleHolidaySort({ column: 'date', current: second })).toEqual({
      column: 'date',
      direction: 'asc',
    })
  })

  test('por nome, por lugar e por data, nos dois sentidos', () => {
    const rows = municipalRows()
    const byName = applyHolidayTable({
      rows,
      state: { ...EMPTY_HOLIDAY_TABLE_STATE, sort: { column: 'name', direction: 'asc' } },
    }).rows.map((row) => row.name)
    const byPlaceDesc = applyHolidayTable({
      rows,
      state: { ...EMPTY_HOLIDAY_TABLE_STATE, sort: { column: 'place', direction: 'desc' } },
    }).rows.map((row) => row.placeLabel)
    const byDate = applyHolidayTable({
      rows,
      state: { ...EMPTY_HOLIDAY_TABLE_STATE, sort: { column: 'date', direction: 'asc' } },
    }).rows.map((row) => row.name)

    expect(byName).toEqual(['Aniversário de Campinas', 'Nossa Senhora da Luz', 'São Sebastião'])
    expect(byPlaceDesc).toEqual(['Rio de Janeiro', 'Curitiba', 'Campinas'])
    expect(byDate).toEqual(['São Sebastião', 'Aniversário de Campinas', 'Nossa Senhora da Luz'])
  })

  test('sem ordenação a lista fica como veio', () => {
    expect(
      applyHolidayTable({ rows: municipalRows(), state: EMPTY_HOLIDAY_TABLE_STATE }).rows,
    ).toEqual(municipalRows())
  })
})

describe('filtros de seleção múltipla', () => {
  test('dois tipos de uma vez deixam passar os dois', () => {
    const state: HolidayTableState = {
      ...EMPTY_HOLIDAY_TABLE_STATE,
      kinds: ['holiday', 'city_anniversary'],
    }

    expect(applyHolidayTable({ rows: municipalRows(), state }).total).toBe(3)
    expect(
      applyHolidayTable({
        rows: municipalRows(),
        state: { ...state, kinds: ['city_anniversary'] },
      }).total,
    ).toBe(1)
  })

  test('duas UFs de uma vez e as duas recorrências', () => {
    const rows = municipalRows()

    expect(
      applyHolidayTable({ rows, state: { ...EMPTY_HOLIDAY_TABLE_STATE, states: ['35', '41'] } })
        .total,
    ).toBe(2)
    expect(
      applyHolidayTable({
        rows,
        state: { ...EMPTY_HOLIDAY_TABLE_STATE, recurrences: ['once'] },
      }).total,
    ).toBe(1)
    expect(
      applyHolidayTable({
        rows,
        state: { ...EMPTY_HOLIDAY_TABLE_STATE, recurrences: ['once', 'yearly'] },
      }).total,
    ).toBe(3)
  })

  test('"limpar filtros" só existe com filtro ou ordenação; a página não conta', () => {
    expect(hasHolidayTableCriteria(EMPTY_HOLIDAY_TABLE_STATE)).toBe(false)
    expect(hasHolidayTableCriteria({ ...EMPTY_HOLIDAY_TABLE_STATE, page: 3 })).toBe(false)
    expect(hasHolidayTableCriteria({ ...EMPTY_HOLIDAY_TABLE_STATE, states: ['35'] })).toBe(true)
    expect(
      hasHolidayTableCriteria({
        ...EMPTY_HOLIDAY_TABLE_STATE,
        sort: { column: 'name', direction: 'asc' },
      }),
    ).toBe(true)
  })
})

describe('página', () => {
  const manyRows = buildMunicipalRows({
    holidays: Array.from({ length: 25 }, (_, index) =>
      buildHoliday({
        holidayOn: `2026-01-${String(index + 1).padStart(2, '0')}`,
        id: `h${String(index)}`,
      }),
    ),
    labelOf,
    rules: [],
  })

  test('mostra uma página por vez e diz quantas existem', () => {
    const second = applyHolidayTable({
      rows: manyRows,
      state: { ...EMPTY_HOLIDAY_TABLE_STATE, page: 2 },
    })

    expect(HOLIDAY_PAGE_SIZE).toBe(10)
    expect(second.rows).toHaveLength(10)
    expect(second.pageCount).toBe(3)
    expect(second.total).toBe(25)
    expect(
      applyHolidayTable({ rows: manyRows, state: { ...EMPTY_HOLIDAY_TABLE_STATE, page: 3 } }).rows,
    ).toHaveLength(5)
  })

  test('página além do fim volta para a última; sem linha a página é a primeira', () => {
    expect(
      applyHolidayTable({ rows: manyRows, state: { ...EMPTY_HOLIDAY_TABLE_STATE, page: 9 } }).page,
    ).toBe(3)
    const empty = applyHolidayTable({ rows: [], state: { ...EMPTY_HOLIDAY_TABLE_STATE, page: 4 } })
    expect(empty.page).toBe(1)
    expect(empty.pageCount).toBe(1)
  })
})

describe('a URL', () => {
  const STATE: HolidayTableState = {
    kinds: ['holiday', 'city_anniversary'],
    page: 2,
    recurrences: ['yearly'],
    sort: { column: 'name', direction: 'desc' },
    states: ['35', '41'],
  }

  test('escreve e lê de volta a mesma tabela, com prefixo próprio', () => {
    const search = serializeHolidayTableState({ prefix: 'municipal', search: '', state: STATE })

    expect(parseHolidayTableState({ prefix: 'municipal', search })).toEqual(STATE)
  })

  test('duas tabelas na mesma URL não se misturam, e o que é de outro dono fica', () => {
    const municipal = serializeHolidayTableState({
      prefix: 'municipal',
      search: '?tab=businessCalendar',
      state: STATE,
    })
    const both = serializeHolidayTableState({
      prefix: 'state',
      search: municipal,
      state: { ...EMPTY_HOLIDAY_TABLE_STATE, states: ['41'] },
    })

    expect(new URLSearchParams(both).get('tab')).toBe('businessCalendar')
    expect(parseHolidayTableState({ prefix: 'municipal', search: both })).toEqual(STATE)
    expect(parseHolidayTableState({ prefix: 'state', search: both }).states).toEqual(['41'])
  })

  test('tabela limpa não deixa parâmetro nenhum', () => {
    const search = serializeHolidayTableState({
      prefix: 'municipal',
      search: serializeHolidayTableState({ prefix: 'municipal', search: '', state: STATE }),
      state: EMPTY_HOLIDAY_TABLE_STATE,
    })

    expect(search).toBe('')
  })

  test('URL inventada não quebra a tela: valor desconhecido é ignorado', () => {
    const parsed = parseHolidayTableState({
      prefix: 'municipal',
      search:
        '?municipalKind=holiday,banana&municipalSort=ghost&municipalDir=up&municipalPage=-3&municipalState=35,zz',
    })

    expect(parsed).toEqual({
      ...EMPTY_HOLIDAY_TABLE_STATE,
      kinds: ['holiday'],
      states: ['35'],
    })
  })

  test('ordenação sem direção lê como crescente', () => {
    expect(parseHolidayTableState({ prefix: 'state', search: '?stateSort=place' }).sort).toEqual({
      column: 'place',
      direction: 'asc',
    })
  })
})
