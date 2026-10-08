/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (ADR-0096 §6): editar regra e data fixa. A cidade da regra não se edita; a data fixa só muda nome e
 * tipo; a data GERADA por uma regra não é linha (nem editável): o caminho é a regra. Editar o dia da regra avisa
 * quantas datas digitadas no dia antigo continuam valendo. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { buildHoliday, buildRule, RULE_ID } from '../fixtures/businessCalendar.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  click,
  endScenario,
  hasButtonIn,
  inputIn,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  text,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import {
  fillMunicipalForm,
  MUNICIPAL_HEADING,
  seedMunicipalities,
  submit,
} from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

function seedRuleWithGeneratedDates(): void {
  businessCalendarDouble.rules = [buildRule()]
  businessCalendarDouble.holidays = Array.from({ length: 11 }, (_, index) =>
    buildHoliday({
      cityIbgeCode: '3509502',
      generatedByRuleId: RULE_ID,
      holidayOn: `${String(2026 + index)}-07-14`,
      id: `generated-${String(index)}`,
      kind: 'city_anniversary',
      name: 'Aniversário de Campinas',
    }),
  )
}

describe('edição de regra e de data fixa (spec 238 ADR-0096 §6)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('as onze datas geradas pela regra NÃO são linhas, e a regra é uma só', async () => {
    seedRuleWithGeneratedDates()
    await mountPanel()

    await waitForText('Todo ano, 14/07 — gerado até 2036')

    const rows = rowsOf(sectionOf(MUNICIPAL_HEADING))
    expect(rows).toHaveLength(1)
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('DELETE'))).toBe(false)
    expect(text()).not.toContain('14/07/2027')
  })

  it('editar a regra trava a cidade e a recorrência e manda só o que mudou', async () => {
    seedRuleWithGeneratedDates()
    seedMunicipalities()
    await mountPanel()
    await waitForText('Todo ano, 14/07')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Aniversário de Campinas'))

    const section = sectionOf(MUNICIPAL_HEADING)
    expect(
      section.querySelector('button[aria-label="UF do município"]')?.hasAttribute('disabled'),
    ).toBe(true)
    expect(section.querySelector('button[aria-label="Município"]')?.hasAttribute('disabled')).toBe(
      true,
    )
    expect(
      section.querySelector('button[aria-label="Recorrência"]')?.hasAttribute('disabled'),
    ).toBe(true)
    expect(inputIn(section, 'Nome').value).toBe('Aniversário de Campinas')
    expect(hasButtonIn(section, 'Cancelar edição')).toBe(true)

    await typeInto(inputIn(section, 'Dia'), '15')
    await submit({ heading: MUNICIPAL_HEADING, label: 'Salvar alterações' })

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `PATCH /municipal-holiday-rules/${RULE_ID} {"day":15,"month":7}`,
      ),
    )
    await waitForText('Todo ano, 15/07')
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Cadastrar feriado')).toBe(true)
  })

  it('sem mudança o "Salvar alterações" não manda nada', async () => {
    seedRuleWithGeneratedDates()
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Aniversário de Campinas'))

    expect(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Salvar alterações').disabled).toBe(true)
  })

  it('cancelar a edição devolve o formulário de cadastro, vazio', async () => {
    seedRuleWithGeneratedDates()
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Aniversário de Campinas'))

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Cancelar edição'))

    expect(inputIn(sectionOf(MUNICIPAL_HEADING), 'Nome').value).toBe('')
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Cadastrar feriado')).toBe(true)
  })

  it('o dia da regra que não cabe no mês é recusado na edição também', async () => {
    seedRuleWithGeneratedDates()
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Aniversário de Campinas'))
    await fillMunicipalForm({ month: 'Abril' })
    await typeInto(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia'), '31')

    await submit({ heading: MUNICIPAL_HEADING, label: 'Salvar alterações' })

    await waitForText('Este dia não existe nesse mês')
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('PATCH'))).toBe(false)
  })

  it('datas digitadas no dia antigo continuam valendo: a edição avisa quantas', async () => {
    seedRuleWithGeneratedDates()
    businessCalendarDouble.holidays.push(
      buildHoliday({
        cityIbgeCode: '3509502',
        holidayOn: '2027-07-14',
        id: 'typed-1',
        name: 'Digitada',
      }),
      buildHoliday({
        cityIbgeCode: '3509502',
        holidayOn: '2028-07-14',
        id: 'typed-2',
        name: 'Digitada',
      }),
    )
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Aniversário de Campinas'))
    await typeInto(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia'), '15')

    await submit({ heading: MUNICIPAL_HEADING, label: 'Salvar alterações' })

    await waitForText('2 datas digitadas no dia antigo continuam valendo')
  })

  it('sem datas digitadas no dia antigo não há aviso', async () => {
    seedRuleWithGeneratedDates()
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Aniversário de Campinas'))
    await typeInto(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia'), '15')

    await submit({ heading: MUNICIPAL_HEADING, label: 'Salvar alterações' })

    await waitForText('Todo ano, 15/07')
    expect(text()).not.toContain('continuam valendo')
  })

  it('a data fixa digitada só muda nome e tipo: cidade e data ficam travadas', async () => {
    businessCalendarDouble.holidays = [buildHoliday()]
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Nossa Senhora da Luz'))

    const section = sectionOf(MUNICIPAL_HEADING)
    expect(section.querySelector('button[aria-label="Município"]')?.hasAttribute('disabled')).toBe(
      true,
    )
    expect(section.querySelectorAll('input[aria-label="Data"]').length).toBe(0)
    expect(section.querySelector('[data-field="holidayOn"]')?.textContent).toContain('08/09/2026')

    await typeInto(inputIn(section, 'Nome'), 'Padroeira de Curitiba')
    await submit({ heading: MUNICIPAL_HEADING, label: 'Salvar alterações' })

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        'PATCH /municipal-holidays/7d1e4a52-9c3b-4c60-a1f4-2b8d6e5f0c11 {"name":"Padroeira de Curitiba"}',
      ),
    )
    await waitForText('Padroeira de Curitiba')
  })

  it('o 409 de data gerada (corrida com outra aba) é dito, e aponta o caminho: a regra', async () => {
    businessCalendarDouble.holidays = [buildHoliday()]
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Editar Nossa Senhora da Luz'))
    businessCalendarDouble.holidays = [
      buildHoliday({ generatedByRuleId: RULE_ID, kind: 'holiday' }),
    ]
    await typeInto(inputIn(sectionOf(MUNICIPAL_HEADING), 'Nome'), 'Outro nome')

    await submit({ heading: MUNICIPAL_HEADING, label: 'Salvar alterações' })

    await waitForText('Esta data foi gerada por uma regra')
  })
})
