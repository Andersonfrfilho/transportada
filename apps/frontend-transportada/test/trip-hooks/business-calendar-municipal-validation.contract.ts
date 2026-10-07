/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (`web.md` §11): o erro de campo é do próprio campo (`aria-invalid` + `aria-describedby`), some ao
 * editar, e o dia que não cabe no mês (31/04, 30/02) é recusado ANTES de ir ao servidor; 29/02 vale.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  endScenario,
  inputIn,
  mountPanel,
  sectionOf,
  startScenario,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import {
  fieldError,
  fillMunicipalForm,
  MUNICIPAL_HEADING,
  seedMunicipalities,
  submit,
} from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

const COMPLETE = {
  city: 'Campinas',
  kind: 'Feriado',
  name: 'Feriado de teste',
  recurrence: 'Todo ano',
  state: 'SP',
} as const

function ruleCalls(): readonly string[] {
  return businessCalendarDouble.calls.filter((call) =>
    call.startsWith('POST /municipal-holiday-rules'),
  )
}

describe('validação do formulário do feriado municipal (spec 238 T2.1)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('31 de abril não existe: o campo do dia aponta o erro e nada vai ao servidor', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm({ ...COMPLETE, day: '31', month: 'Abril' })

    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitForText('Este dia não existe nesse mês')
    const day = inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia')
    expect(day.getAttribute('aria-invalid')).toBe('true')
    const describedBy = day.getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(describedBy ?? '')?.textContent).toContain(
      'não existe nesse mês',
    )
    expect(ruleCalls()).toEqual([])
  })

  it('30 de fevereiro também não; e corrigir o dia limpa o erro', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm({ ...COMPLETE, day: '30', month: 'Fevereiro' })
    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })
    await waitForText('Este dia não existe nesse mês')

    await typeInto(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia'), '28')

    await waitFor(() => expect(fieldError(MUNICIPAL_HEADING, 'day')).toBeNull())
    expect(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia').hasAttribute('aria-invalid')).toBe(false)
  })

  it('29 de fevereiro é aceito: existe nos anos bissextos', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm({ ...COMPLETE, day: '29', month: 'Fevereiro' })

    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitFor(() => expect(ruleCalls()).toHaveLength(1))
    expect(ruleCalls()[0]).toContain('"day":29,"kind":"holiday","month":2')
  })

  it('formulário vazio: aponta todos os campos de uma vez e nenhum pedido sai', async () => {
    await mountPanel()

    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitFor(() => {
      const fields = [...sectionOf(MUNICIPAL_HEADING).querySelectorAll('[data-field-error]')].map(
        (error) => error.closest('[data-field]')?.getAttribute('data-field'),
      )
      expect(fields).toEqual(['stateIbgeCode', 'cityIbgeCode', 'kind', 'recurrence', 'name'])
    })
    expect(businessCalendarDouble.calls.some((call) => call.startsWith('POST'))).toBe(false)
  })

  it('o dia só aceita dois dígitos', async () => {
    await mountPanel()
    await fillMunicipalForm({ recurrence: 'Todo ano' })

    await typeInto(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia'), '3a1x9')

    expect(inputIn(sectionOf(MUNICIPAL_HEADING), 'Dia').value).toBe('31')
  })

  it('nome acima de 120 caracteres é recusado na tela', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm({ ...COMPLETE, day: '14', month: 'Julho', name: 'a'.repeat(121) })

    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitForText('no máximo 120 caracteres')
    expect(ruleCalls()).toEqual([])
  })
})
