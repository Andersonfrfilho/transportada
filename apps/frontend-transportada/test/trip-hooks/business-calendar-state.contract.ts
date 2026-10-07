/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (RF4, ADR-0096 §6): o feriado estadual. A UF é uma das 27, "todo ano" leva mês e dia, "só esta data"
 * leva a data; `POST` idêntico é 200 com a existente, divergente é 409; o `PATCH` leva a recorrência e, no "todo
 * ano", mês e dia juntos. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import {
  buildOnceStateHoliday,
  buildYearlyStateHoliday,
  STATE_HOLIDAY_ID,
} from '../fixtures/businessCalendar.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  click,
  dialog,
  endScenario,
  inputIn,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  text,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import { fillStateForm, STATE_HEADING, submit } from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

const SUBMIT = 'Cadastrar feriado estadual'
const YEARLY = {
  day: '9',
  month: 'Julho',
  name: 'Revolução Constitucionalista',
  recurrence: 'Todo ano',
  state: 'SP',
} as const

describe('feriados estaduais (spec 238 RF4)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('"todo ano": UF, mês, dia e nome, e a linha mostra a UF e o dia', async () => {
    await mountPanel()

    await fillStateForm(YEARLY)
    await submit({ heading: STATE_HEADING, label: SUBMIT })

    await waitForText('Todo ano, 09/07')
    expect(businessCalendarDouble.calls).toContain(
      'POST /state-holidays {"day":9,"month":7,"name":"Revolução Constitucionalista","recurrence":"yearly","stateIbgeCode":"35"}',
    )
    expect(rowsOf(sectionOf(STATE_HEADING))[0]?.textContent).toContain('SP')
  })

  it('"só esta data": leva a data civil', async () => {
    await mountPanel()

    await fillStateForm({
      date: '19/12/2026',
      name: 'Emancipação Política do Paraná',
      recurrence: 'Só esta data',
      state: 'PR',
    })
    await submit({ heading: STATE_HEADING, label: SUBMIT })

    await waitForText('19/12/2026')
    expect(businessCalendarDouble.calls).toContain(
      'POST /state-holidays {"holidayOn":"2026-12-19","name":"Emancipação Política do Paraná","recurrence":"once","stateIbgeCode":"41"}',
    )
  })

  it('cadastro idêntico ao que já existe (200) é dito, sem duplicar a linha', async () => {
    businessCalendarDouble.stateHolidays = [buildYearlyStateHoliday()]
    await mountPanel()
    await waitForText('Todo ano, 09/07')

    await fillStateForm(YEARLY)
    await submit({ heading: STATE_HEADING, label: SUBMIT })

    await waitForText('Este feriado já estava cadastrado')
    expect(rowsOf(sectionOf(STATE_HEADING))).toHaveLength(1)
  })

  it('o mesmo dia com outro nome é conflito, dito pelo motivo', async () => {
    businessCalendarDouble.stateHolidays = [buildYearlyStateHoliday()]
    await mountPanel()
    await waitForText('Todo ano, 09/07')

    await fillStateForm({ ...YEARLY, name: 'Outro nome' })
    await submit({ heading: STATE_HEADING, label: SUBMIT })

    await waitForText('Já existe um feriado estadual nesta UF e neste dia, com outro nome')
  })

  it('31 de novembro não existe', async () => {
    await mountPanel()

    await fillStateForm({ ...YEARLY, day: '31', month: 'Novembro' })
    await submit({ heading: STATE_HEADING, label: SUBMIT })

    await waitForText('Este dia não existe nesse mês')
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('POST'))).toBe(false)
  })

  it('editar trava a UF e a recorrência e manda a recorrência junto no PATCH', async () => {
    businessCalendarDouble.stateHolidays = [buildYearlyStateHoliday()]
    await mountPanel()
    await waitForText('Todo ano, 09/07')

    await click(buttonIn(sectionOf(STATE_HEADING), 'Editar Revolução Constitucionalista'))

    const section = sectionOf(STATE_HEADING)
    expect(section.querySelector('button[aria-label="UF"]')?.hasAttribute('disabled')).toBe(true)
    expect(
      section.querySelector('button[aria-label="Recorrência"]')?.hasAttribute('disabled'),
    ).toBe(true)
    await typeInto(inputIn(section, 'Nome'), 'Revolução de 1932')
    await submit({ heading: STATE_HEADING, label: 'Salvar alterações' })

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `PATCH /state-holidays/${STATE_HOLIDAY_ID} {"name":"Revolução de 1932","recurrence":"yearly"}`,
      ),
    )
    await waitForText('Revolução de 1932')
  })

  it('no "todo ano", mudar só o dia manda mês e dia juntos', async () => {
    businessCalendarDouble.stateHolidays = [buildYearlyStateHoliday()]
    await mountPanel()
    await waitForText('Todo ano, 09/07')
    await click(buttonIn(sectionOf(STATE_HEADING), 'Editar Revolução Constitucionalista'))

    await typeInto(inputIn(sectionOf(STATE_HEADING), 'Dia'), '10')
    await submit({ heading: STATE_HEADING, label: 'Salvar alterações' })

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(
        `PATCH /state-holidays/${STATE_HOLIDAY_ID} {"day":10,"month":7,"recurrence":"yearly"}`,
      ),
    )
  })

  it('a forma que não confere com a gravada (400) é dita pelo motivo', async () => {
    businessCalendarDouble.stateHolidays = [buildOnceStateHoliday()]
    await mountPanel()
    await waitForText('19/12/2026')
    await click(buttonIn(sectionOf(STATE_HEADING), 'Editar Emancipação Política do Paraná'))
    await typeInto(inputIn(sectionOf(STATE_HEADING), 'Nome'), 'Nome novo')
    businessCalendarDouble.failNext.set(
      `PATCH /state-holidays/${buildOnceStateHoliday().id}`,
      new BusinessCalendarRequestError({ code: 'STATE_HOLIDAY_RECURRENCE_MISMATCH', status: 400 }),
    )

    await submit({ heading: STATE_HEADING, label: 'Salvar alterações' })

    await waitForText('A recorrência não confere com a do feriado gravado')
  })

  it('excluir pede confirmação e depois apaga', async () => {
    businessCalendarDouble.stateHolidays = [buildYearlyStateHoliday()]
    await mountPanel()
    await waitForText('Todo ano, 09/07')

    await click(buttonIn(sectionOf(STATE_HEADING), 'Excluir Revolução Constitucionalista'))
    expect(dialog()?.textContent).toContain('Excluir o feriado estadual')
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('DELETE'))).toBe(false)
    await click(buttonIn(dialog() ?? document.body, 'Excluir feriado'))

    await waitFor(() =>
      expect(businessCalendarDouble.calls).toContain(`DELETE /state-holidays/${STATE_HOLIDAY_ID}`),
    )
    await waitFor(() => expect(rowsOf(sectionOf(STATE_HEADING)).length).toBe(0))
    expect(text()).not.toContain('Revolução Constitucionalista')
  })

  it('sem feriado cadastrado a tabela diz que está vazia', async () => {
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(STATE_HEADING).textContent).toContain('Nenhum feriado estadual cadastrado'),
    )
  })
})
