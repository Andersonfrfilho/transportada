/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (ADR-0096 §6): excluir regra e data é irreversível — pede confirmação que diz o efeito, e a regra
 * avisa quantas datas digitadas no mesmo dia continuam valendo (o `DELETE` responde 204 sem corpo, então a contagem
 * vem da leitura da lista). Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { buildHoliday, buildRule, HOLIDAY_ID, RULE_ID } from '../fixtures/businessCalendar.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  click,
  dialog,
  endScenario,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  waitForText,
} from './businessCalendarHarness.helper'
import { MUNICIPAL_HEADING } from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

describe('exclusão de regra e de data fixa (spec 238 T2.1)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('excluir a regra pede confirmação e diz o que deixa de valer', async () => {
    businessCalendarDouble.rules = [buildRule()]
    await mountPanel()
    await waitForText('Todo ano, 14/07')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Aniversário de Campinas'))

    expect(dialog()).not.toBeNull()
    expect(dialog()?.textContent).toContain('Excluir a regra')
    expect(dialog()?.textContent).toContain('deixam de valer para o roteiro')
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('DELETE'))).toBe(false)
  })

  it('cancelar não apaga nada', async () => {
    businessCalendarDouble.rules = [buildRule()]
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Aniversário de Campinas'))

    await click(buttonIn(dialog() ?? document.body, 'Cancelar'))

    expect(dialog()).toBeNull()
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('DELETE'))).toBe(false)
    expect(rowsOf(sectionOf(MUNICIPAL_HEADING))).toHaveLength(1)
  })

  it('confirmar apaga a regra e a linha some', async () => {
    businessCalendarDouble.rules = [buildRule()]
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Aniversário de Campinas'))

    await click(buttonIn(dialog() ?? document.body, 'Excluir regra'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(`DELETE /municipal-holiday-rules/${RULE_ID}`),
    )
    await waitFor(() => expect(rowsOf(sectionOf(MUNICIPAL_HEADING)).length).toBe(0))
    expect(dialog()).toBeNull()
  })

  it('a regra com datas digitadas no mesmo dia diz que elas continuam valendo', async () => {
    businessCalendarDouble.rules = [buildRule()]
    businessCalendarDouble.holidays = [
      buildHoliday({
        cityIbgeCode: '3509502',
        holidayOn: '2027-07-14',
        id: 'typed-1',
        name: 'Digitada',
      }),
    ]
    await mountPanel()
    await waitForText('Todo ano, 14/07')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Aniversário de Campinas'))

    expect(dialog()?.textContent).toContain('1 data digitada neste dia continua valendo')
  })

  it('a falha ao excluir é dita dentro do diálogo, e o diálogo fica para tentar de novo', async () => {
    businessCalendarDouble.rules = [buildRule()]
    await mountPanel()
    await waitForText('Todo ano, 14/07')
    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Aniversário de Campinas'))
    businessCalendarDouble.failNext.set(
      `DELETE /municipal-holiday-rules/${RULE_ID}`,
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )

    await click(buttonIn(dialog() ?? document.body, 'Excluir regra'))

    await waitFor(() =>
      expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain('indisponível'),
    )
    expect(dialog()).not.toBeNull()
  })

  it('excluir uma data fixa digitada também pede confirmação', async () => {
    businessCalendarDouble.holidays = [buildHoliday()]
    await mountPanel()
    await waitForText('Nossa Senhora da Luz')

    await click(buttonIn(sectionOf(MUNICIPAL_HEADING), 'Excluir Nossa Senhora da Luz'))
    expect(dialog()?.textContent).toContain('Excluir a data')
    await click(buttonIn(dialog() ?? document.body, 'Excluir data'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(`DELETE /municipal-holidays/${HOLIDAY_ID}`),
    )
    await waitFor(() => expect(rowsOf(sectionOf(MUNICIPAL_HEADING)).length).toBe(0))
  })
})
