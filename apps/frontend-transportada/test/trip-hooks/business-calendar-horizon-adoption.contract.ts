/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (ADR-0096 §6, risco 6): o horizonte de 10 anos acaba e não há rotina agendada — a tela avisa
 * quando alguma regra fica abaixo do ano corrente + 2 e oferece "Gerar próximos anos" (idempotente). E digitar uma
 * data que uma regra gerou é ADOÇÃO: a tela diz que a data passou a ser do operador. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { buildHoliday, buildRule, RULE_ID } from '../fixtures/businessCalendar.fixture'

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
  text,
  waitForText,
} from './businessCalendarHarness.helper'
import {
  fillMunicipalForm,
  MUNICIPAL_HEADING,
  seedMunicipalities,
  submit,
} from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

describe('aviso de horizonte baixo e "Gerar próximos anos" (spec 238)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('horizonte folgado: nenhum aviso e nenhuma ação', async () => {
    businessCalendarDouble.rules = [buildRule({ materializedThroughYear: 2028 })]
    await mountPanel()
    await waitForText('Todo ano, 14/07 — gerado até 2028')

    expect(text()).not.toContain('Gerar próximos anos')
  })

  it('abaixo do ano corrente + 2: avisa até que ano e oferece a ação', async () => {
    businessCalendarDouble.rules = [buildRule({ materializedThroughYear: 2027 })]
    await mountPanel()

    await waitForText('Gerar próximos anos')
    const notice = sectionOf(MUNICIPAL_HEADING).querySelector('[data-horizon-notice]')
    expect(notice?.textContent).toContain('só até 2027')
    expect(notice?.getAttribute('role')).toBe('status')
  })

  it('gerar completa o horizonte, diz quantas datas nasceram e o aviso some', async () => {
    businessCalendarDouble.rules = [buildRule({ materializedThroughYear: 2027 })]
    await mountPanel()
    await waitForText('Gerar próximos anos')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Gerar próximos anos'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        'POST /municipal-holiday-rules/materializations',
      ),
    )
    await waitForText('Datas novas geradas: 11')
    expect(text()).toContain('Regras processadas: 1')
    expect(text()).toContain('gerado até 2036')
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Gerar próximos anos')).toBe(false)
  })

  it('o botão trava enquanto gera: o duplo clique não manda dois pedidos', async () => {
    businessCalendarDouble.rules = [buildRule({ materializedThroughYear: 2027 })]
    await mountPanel()
    await waitForText('Gerar próximos anos')
    businessCalendarDouble.failNext.set('POST /municipal-holiday-rules/materializations', 'hold')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Gerar próximos anos'))
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Gerando…'))

    expect(
      businessCalendarDouble.calls.filter((call) => call.includes('materializations')),
    ).toHaveLength(1)
  })

  it('a falha ao gerar é dita e o aviso continua para tentar de novo', async () => {
    businessCalendarDouble.rules = [buildRule({ materializedThroughYear: 2027 })]
    await mountPanel()
    await waitForText('Gerar próximos anos')
    businessCalendarDouble.failNext.set(
      'POST /municipal-holiday-rules/materializations',
      new BusinessCalendarRequestError({ code: 'TOO_MANY_REQUESTS', status: 429 }),
    )

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Gerar próximos anos'))

    await waitForText('Muitos pedidos em pouco tempo')
    expect(hasButtonIn(sectionOf(MUNICIPAL_HEADING), 'Gerar próximos anos')).toBe(true)
  })

  it('geração sem nada novo também é dita', async () => {
    businessCalendarDouble.rules = [buildRule({ materializedThroughYear: 2027 })]
    businessCalendarDouble.holidays = Array.from({ length: 11 }, (_, index) =>
      buildHoliday({
        cityIbgeCode: '3509502',
        generatedByRuleId: RULE_ID,
        holidayOn: `${String(2026 + index)}-07-14`,
        id: `generated-${String(index)}`,
      }),
    )
    await mountPanel()
    await waitForText('Gerar próximos anos')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Gerar próximos anos'))

    await waitForText('Nenhuma data nova')
  })
})

describe('adoção de data gerada pela regra (spec 238 ADR-0096 §6.4)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  function seedGenerated(): void {
    businessCalendarDouble.rules = [buildRule()]
    businessCalendarDouble.holidays = [
      buildHoliday({
        cityIbgeCode: '3509502',
        generatedByRuleId: RULE_ID,
        holidayOn: '2026-07-14',
        id: 'generated-0',
        kind: 'city_anniversary',
        name: 'Aniversário de Campinas',
      }),
    ]
  }

  it('digitar a data que a regra gerou avisa que ela agora é do operador', async () => {
    seedGenerated()
    seedMunicipalities()
    await mountPanel()
    await waitForText('Todo ano, 14/07')

    await fillMunicipalForm({
      city: 'Campinas',
      date: '14/07/2026',
      kind: 'Aniversário da cidade',
      name: 'Aniversário (ponto facultativo)',
      recurrence: 'Só esta data',
      state: 'SP',
    })
    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitForText('Esta data agora é sua')
    expect(text()).toContain('sobrevive à exclusão da regra')
    expect(rowsOf(sectionOf(MUNICIPAL_HEADING))).toHaveLength(2)
  })

  it('uma data nova, que nenhuma regra gerou, não fala de adoção', async () => {
    seedMunicipalities()
    await mountPanel()

    await fillMunicipalForm({
      city: 'Curitiba',
      date: '08/09/2026',
      kind: 'Feriado',
      name: 'Nossa Senhora da Luz',
      recurrence: 'Só esta data',
      state: 'PR',
    })
    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitForText('Nossa Senhora da Luz')
    expect(text()).not.toContain('Esta data agora é sua')
  })
})
