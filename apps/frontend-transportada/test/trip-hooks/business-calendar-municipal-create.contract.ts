/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (RF3, RF7): cadastrar o feriado e o aniversário da cidade. "Todo ano" vira uma REGRA (mês e dia,
 * gerada pela API até o ano de horizonte); "só esta data" vira uma data fixa. O município escolhido pelo código
 * IBGE, a partir da UF. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  endScenario,
  mountPanel,
  rowsOf,
  sectionOf,
  startScenario,
  text,
  waitForText,
} from './businessCalendarHarness.helper'
import {
  controlOf,
  fillMunicipalForm,
  MUNICIPAL_HEADING,
  seedMunicipalities,
  submit,
} from './businessCalendarForms.helper'
import { waitFor } from './renderHook.helper'

describe('cadastro do feriado municipal (spec 238 RF3/RF7)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('"todo ano": a regra vai com mês e dia em número e aparece com "gerado até"', async () => {
    seedMunicipalities()
    await mountPanel()

    await fillMunicipalForm({
      city: 'Campinas',
      day: '14',
      kind: 'Aniversário da cidade',
      month: 'Julho',
      name: 'Aniversário de Campinas',
      recurrence: 'Todo ano',
      state: 'SP',
    })
    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })

    await waitForText('Todo ano, 14/07 — gerado até 2036')
    expect(businessCalendarDouble.calls).toContain(
      'POST /municipal-holiday-rules {"cityIbgeCode":"3509502","day":14,"kind":"city_anniversary","month":7,"name":"Aniversário de Campinas"}',
    )
    const rows = rowsOf(sectionOf(MUNICIPAL_HEADING))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).toContain('Campinas')
    expect(rows[0]?.textContent).toContain('Aniversário da cidade')
  })

  it('"só esta data": vai como data fixa, com a data civil, sem regra', async () => {
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
    expect(businessCalendarDouble.calls).toContain(
      'POST /municipal-holidays {"cityIbgeCode":"4106902","holidayOn":"2026-09-08","kind":"holiday","name":"Nossa Senhora da Luz"}',
    )
    expect(
      businessCalendarDouble.calls.some((call) => call.startsWith('POST /municipal-holiday-rules')),
    ).toBe(false)
    expect(text()).toContain('08/09/2026')
  })

  it('a recorrência decide os campos: "todo ano" pede mês e dia; "só esta data" pede a data', async () => {
    seedMunicipalities()
    await mountPanel()
    const section = sectionOf(MUNICIPAL_HEADING)

    await fillMunicipalForm({ recurrence: 'Todo ano' })
    expect(section.querySelectorAll('[aria-label="Dia"]').length).toBe(1)
    expect(section.querySelectorAll('[aria-label="Mês"]').length).toBe(1)
    expect(section.querySelectorAll('[aria-label="Data"]').length).toBe(0)

    await fillMunicipalForm({ recurrence: 'Só esta data' })
    expect(section.querySelectorAll('[aria-label="Dia"]').length).toBe(0)
    expect(section.querySelectorAll('[aria-label="Data"]').length).toBe(1)
  })

  it('a lista de municípios é a da UF escolhida, e o seletor tem busca', async () => {
    seedMunicipalities()
    await mountPanel()

    await fillMunicipalForm({ state: 'SP' })

    await waitFor(() => expect(businessCalendarDouble.calls).toContain('DIRECTORY SP'))
    expect(controlOf(MUNICIPAL_HEADING, 'Município').hasAttribute('disabled')).toBe(false)
  })

  it('sem UF escolhida o município não abre; trocar a UF limpa o município escolhido', async () => {
    seedMunicipalities()
    await mountPanel()

    expect(controlOf(MUNICIPAL_HEADING, 'Município').hasAttribute('disabled')).toBe(true)

    await fillMunicipalForm({ city: 'Campinas', state: 'SP' })
    expect(sectionOf(MUNICIPAL_HEADING).textContent).toContain('Campinas')
    await fillMunicipalForm({ state: 'PR' })

    expect(controlOf(MUNICIPAL_HEADING, 'Município').textContent).not.toContain('Campinas')
  })

  it('lista de municípios fora do ar: o código IBGE pode ser digitado, e o cadastro não para', async () => {
    businessCalendarDouble.municipalities = { SP: 'failure' }
    await mountPanel()

    await fillMunicipalForm({ state: 'SP' })

    await waitForText('Não foi possível carregar os municípios')
    expect(
      sectionOf(MUNICIPAL_HEADING).querySelectorAll('input[aria-label="Código IBGE do município"]')
        .length,
    ).toBe(1)
  })

  it('cadastro bem-sucedido limpa o formulário para o próximo', async () => {
    seedMunicipalities()
    await mountPanel()
    await fillMunicipalForm({
      city: 'Campinas',
      day: '14',
      kind: 'Feriado',
      month: 'Julho',
      name: 'Aniversário de Campinas',
      recurrence: 'Todo ano',
      state: 'SP',
    })
    await submit({ heading: MUNICIPAL_HEADING, label: 'Cadastrar feriado' })
    await waitForText('Todo ano, 14/07')

    const name = sectionOf(MUNICIPAL_HEADING).querySelector<HTMLInputElement>(
      'input[aria-label="Nome"]',
    )
    expect(name?.value).toBe('')
  })
})
