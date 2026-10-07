/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (`web.md` §7, §10): a tabela dos feriados municipais — cabeçalho clicável asc → desc → neutro,
 * filtro de seleção MÚLTIPLA, "limpar filtros" só com critério, tudo na URL, página, e cartão abaixo de 40 rem
 * (`data-label` em cada célula). Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  buildHoliday,
  buildRule,
  CAMPINAS_CODE,
  CURITIBA_CODE,
} from '../fixtures/businessCalendar.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  click,
  endScenario,
  hasButtonIn,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  waitForText,
} from './businessCalendarHarness.helper'
import { MUNICIPAL_HEADING, seedMunicipalities } from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

function seedRows(): void {
  seedMunicipalities()
  businessCalendarDouble.rules = [buildRule()]
  businessCalendarDouble.holidays = [
    buildHoliday({ holidayOn: '2026-09-08', id: 'h-1', name: 'Nossa Senhora da Luz' }),
    buildHoliday({
      cityIbgeCode: '3550308',
      holidayOn: '2026-01-25',
      id: 'h-2',
      name: 'Aniversário de São Paulo',
      kind: 'city_anniversary',
    }),
    buildHoliday({
      cityIbgeCode: CAMPINAS_CODE,
      holidayOn: '2026-12-08',
      id: 'h-3',
      name: 'Imaculada',
    }),
  ]
}

function names(): readonly string[] {
  return rowsOf(sectionOf(MUNICIPAL_HEADING)).map((row) => row.children[3]?.textContent ?? '')
}

function parameters(): URLSearchParams {
  return new URLSearchParams(window.location.search)
}

async function chooseMany(trigger: string, options: readonly string[]): Promise<void> {
  const button = sectionOf(MUNICIPAL_HEADING).querySelector<HTMLElement>(
    `button[aria-label="${trigger}"]`,
  )
  if (button === null) throw new Error(`TRIGGER_NOT_FOUND:${trigger}`)
  await click(button)
  for (const label of options) {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => (candidate.textContent ?? '').trim().startsWith(label),
    )
    if (option === undefined) throw new Error(`OPTION_NOT_FOUND:${label}`)
    await click(option)
  }
  await click(button)
}

describe('tabela dos feriados municipais (spec 238 T2.1, web.md §7)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('cada célula leva o rótulo da coluna: abaixo de 40 rem a linha vira cartão', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    const headers = [...sectionOf(MUNICIPAL_HEADING).querySelectorAll('thead th')].map((th) =>
      (th.textContent ?? '').replace(/(Ordenar|Ordenação).*$/u, '').trim(),
    )
    const cells = [...(rowsOf(sectionOf(MUNICIPAL_HEADING))[0]?.children ?? [])].map((cell) =>
      cell.getAttribute('data-label'),
    )

    expect(headers).toEqual(['Lugar', 'Tipo', 'Quando', 'Nome', 'Ações'])
    expect(cells).toEqual(headers)
  })

  it('cabeçalho de nome: crescente, decrescente e neutro, com `aria-sort` e na URL', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')
    const header = () =>
      [...sectionOf(MUNICIPAL_HEADING).querySelectorAll('thead th')].find((th) =>
        (th.textContent ?? '').startsWith('Nome'),
      )
    expect(header()?.getAttribute('aria-sort')).toBe('none')

    await click(buttonIn(header() ?? document.body, 'Nome'))
    expect(header()?.getAttribute('aria-sort')).toBe('ascending')
    expect(names()).toEqual([
      'Aniversário de Campinas',
      'Aniversário de São Paulo',
      'Imaculada',
      'Nossa Senhora da Luz',
    ])
    expect(parameters().get('municipalSort')).toBe('name')
    expect(parameters().get('municipalDir')).toBe('asc')

    await click(buttonIn(header() ?? document.body, 'Nome'))
    expect(header()?.getAttribute('aria-sort')).toBe('descending')
    expect(names()[0]).toBe('Nossa Senhora da Luz')
    expect(parameters().get('municipalDir')).toBe('desc')

    await click(buttonIn(header() ?? document.body, 'Nome'))
    expect(header()?.getAttribute('aria-sort')).toBe('none')
    expect(parameters().has('municipalSort')).toBe(false)
  })

  it('filtro de tipo aceita mais de um valor; a URL guarda os dois', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    await chooseMany('Filtrar por tipo', ['Aniversário da cidade'])
    await waitFor(() => expect(names()).toHaveLength(2))
    await chooseMany('Filtrar por tipo', ['Feriado'])

    await waitFor(() => expect(names()).toHaveLength(4))
    expect(parameters().get('municipalKind')).toBe('city_anniversary,holiday')
  })

  it('filtro de UF aceita mais de uma UF: Paraná e São Paulo juntos', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    await chooseMany('Filtrar por UF', ['PR', 'SP'])

    await waitFor(() => expect(names()).toHaveLength(4))
    expect(parameters().get('municipalState')).toBe('41,35')
    await chooseMany('Filtrar por UF', ['SP'])
    await waitFor(() => expect(names()).toEqual(['Nossa Senhora da Luz']))
  })

  it('"Limpar filtros" só existe com filtro ou ordenação, e zera a URL', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Limpar filtros')).toBe(false)

    await chooseMany('Filtrar por tipo', ['Feriado'])
    await waitFor(() =>
      expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Limpar filtros')).toBe(true),
    )
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Limpar filtros'))

    await waitFor(() => expect(names()).toHaveLength(4))
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Limpar filtros')).toBe(false)
    expect(window.location.search).toBe('')
  })

  it('a ordenação sozinha também liga o "Limpar filtros"', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    const nameHeader = [...sectionOf(MUNICIPAL_HEADING).querySelectorAll('thead th')].find((th) =>
      (th.textContent ?? '').startsWith('Nome'),
    )
    await click(buttonIn(nameHeader ?? document.body, 'Nome'))

    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Limpar filtros')).toBe(true)
  })

  it('a tela abre já filtrada pela URL (recarregar ou mandar o link)', async () => {
    seedRows()
    window.history.replaceState({}, '', `/company-settings?tab=businessCalendar&municipalState=41`)
    await mountPanel()

    await waitForText('Nossa Senhora da Luz')
    expect(names()).toEqual(['Nossa Senhora da Luz'])
    expect(parameters().get('tab')).toBe('businessCalendar')
  })

  it('filtro sem resultado diz isso e oferece limpar; lista vazia diz outra coisa', async () => {
    seedRows()
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')
    await chooseMany('Filtrar por UF', ['PR'])
    await chooseMany('Filtrar por tipo', ['Aniversário da cidade'])

    await waitForText('Nenhum feriado com esses filtros')
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Limpar filtros')).toBe(true)
  })

  it('mais de dez linhas viram páginas, e a página vai para a URL', async () => {
    seedMunicipalities()
    businessCalendarDouble.holidays = Array.from({ length: 25 }, (_, index) =>
      buildHoliday({
        cityIbgeCode: CURITIBA_CODE,
        holidayOn: `2026-03-${String(index + 1).padStart(2, '0')}`,
        id: `h-${String(index)}`,
        name: `Feriado ${String(index + 1).padStart(2, '0')}`,
      }),
    )
    await mountPanel()
    await waitForText('Feriado 01')

    expect(names()).toHaveLength(10)
    await waitForText('Página 1 de 3')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Próxima página'))

    await waitForText('Página 2 de 3')
    expect(names()[0]).toBe('Feriado 11')
    expect(parameters().get('municipalPage')).toBe('2')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Próxima página'))
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Próxima página'))
    expect(names()).toHaveLength(5)
    expect(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Próxima página').disabled).toBe(true)
  })

  it('o nome da cidade vem do código IBGE; sem lista, o código é mostrado', async () => {
    seedRows()
    businessCalendarDouble.municipalities = {
      PR: 'failure',
      SP: [{ code: CAMPINAS_CODE, name: 'Campinas' }],
    }
    await mountPanel()

    await waitFor(() =>
      expect(
        rowsOf(sectionOf(MUNICIPAL_HEADING)).map((row) => row.children[0]?.textContent),
      ).toContain('Campinas'),
    )
    expect(
      rowsOf(sectionOf(MUNICIPAL_HEADING)).map((row) => row.children[0]?.textContent),
    ).toContain(CURITIBA_CODE)
  })
})
