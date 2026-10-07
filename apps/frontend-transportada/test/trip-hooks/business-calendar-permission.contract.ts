/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (RF7): a aba é de quem tem `settings.manage` — sem a permissão o painel não renderiza nenhum dos
 * três blocos e NÃO faz nenhuma chamada à API (a tela não pede o que não pode ver).
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  endScenario,
  mountPanel,
  startScenario,
  text,
  waitForText,
} from './businessCalendarHarness.helper'

describe('permissão do calendário (spec 238 RF7)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('sem `settings.manage`: só o aviso de permissão, nenhum bloco e nenhuma chamada', async () => {
    await mountPanel(false)

    await waitForText('Você não tem permissão para ver o calendário de dias úteis')
    expect(document.querySelectorAll('h3').length).toBe(0)
    expect(document.querySelectorAll('input, form, table').length).toBe(0)
    expect(businessCalendarDouble.calls).toEqual([])
  })

  it('com a permissão: os três blocos e o aviso fixo do roteiro', async () => {
    await mountPanel(true)

    await waitForText('Feriados estaduais')
    const headings = [...document.querySelectorAll('h3')].map((heading) => heading.textContent)
    expect(headings).toEqual(['Sábado', 'Feriados municipais', 'Feriados estaduais'])
    expect(text()).toContain(
      'O roteiro fecha os clientes da cidade nas datas geradas por esta regra',
    )
    expect(text()).toContain('feriados nacionais e estaduais não fecham clientes no roteiro')
    expect(text()).toContain('o prazo de entrega por contratante conta todos')
  })

  it('o aviso fixo diz até que ano: sem regras é o ano corrente + 10', async () => {
    await mountPanel(true)

    await waitForText('(até 2036)')
  })

  it('o aviso fixo diz até o menor "gerado até" entre as regras', async () => {
    businessCalendarDouble.rules = [
      {
        cityIbgeCode: '3509502',
        createdAt: '2026-10-01T12:00:00.000Z',
        day: 14,
        id: 'rule-a',
        kind: 'city_anniversary',
        materializedThroughYear: 2031,
        month: 7,
        name: 'Aniversário de Campinas',
        updatedAt: '2026-10-01T12:00:00.000Z',
      },
    ]
    await mountPanel(true)

    await waitForText('(até 2031)')
  })
})
