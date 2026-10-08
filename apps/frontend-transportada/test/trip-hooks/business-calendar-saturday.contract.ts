/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T2.1 (RF5, RF7): o interruptor "Sábado é dia útil" montado de verdade. Sem linha gravada o padrão é
 * segunda a sexta; gravar é `PUT`; a recusa e a falha de leitura são ditas, nunca mudas. Dados sintéticos.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  click,
  endScenario,
  mountPanel,
  sectionOf,
  startScenario,
  text,
  waitForText,
} from './businessCalendarHarness.helper'
import { waitFor } from './renderHook.helper'

const HEADING = 'Sábado'

function checkbox(): HTMLInputElement {
  const input = sectionOf(HEADING).querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (input === null) throw new Error('CHECKBOX_NOT_FOUND')
  return input
}

describe('interruptor "Sábado é dia útil" (spec 238 RF5)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('carregando: esqueleto na forma do bloco, sem o interruptor', async () => {
    businessCalendarDouble.failNext.set('GET /company-settings/business-calendar', 'hold')
    await mountPanel()

    expect(sectionOf(HEADING).querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(sectionOf(HEADING).querySelectorAll('input[type="checkbox"]').length).toBe(0)
  })

  it('sem linha gravada: desligado, e diz que é o padrão de segunda a sexta', async () => {
    await mountPanel()
    await waitFor(() => expect(sectionOf(HEADING).querySelectorAll('input').length).toBe(1))

    expect(checkbox().checked).toBe(false)
    expect(sectionOf(HEADING).textContent).toContain('Padrão do sistema: segunda a sexta')
  })

  it('ligar grava com PUT, mostra salvo e passa a ser da empresa', async () => {
    await mountPanel()
    await waitFor(() => expect(sectionOf(HEADING).querySelectorAll('input').length).toBe(1))

    await click(checkbox())

    await waitFor(() => expect(checkbox().checked).toBe(true))
    expect(businessCalendarDouble.calls).toContain(
      'PUT /company-settings/business-calendar {"saturdayIsBusinessDay":true}',
    )
    await waitForText('Salvo')
    expect(sectionOf(HEADING).textContent).toContain('Configurado pela empresa')
  })

  it('a empresa que já ligou abre ligada', async () => {
    businessCalendarDouble.settings = {
      origin: 'company',
      saturdayIsBusinessDay: true,
      updatedAt: '2026-10-01T12:00:00.000Z',
    }
    await mountPanel()

    await waitFor(() => expect(checkbox().checked).toBe(true))
  })

  it('recusa na gravação: o interruptor volta, e o motivo é dito por extenso', async () => {
    await mountPanel()
    await waitFor(() => expect(sectionOf(HEADING).querySelectorAll('input').length).toBe(1))
    businessCalendarDouble.failNext.set(
      'PUT /company-settings/business-calendar',
      new BusinessCalendarRequestError({ code: 'FORBIDDEN', status: 403 }),
    )

    await click(checkbox())

    await waitFor(() =>
      expect(sectionOf(HEADING).querySelector('[role="alert"]')?.textContent).toContain(
        'Seu perfil não tem permissão',
      ),
    )
    expect(checkbox().checked).toBe(false)
  })

  it('falha de leitura: alerta com o motivo e botão para tentar de novo', async () => {
    businessCalendarDouble.failNext.set(
      'GET /company-settings/business-calendar',
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )
    await mountPanel()

    await waitFor(() =>
      expect(sectionOf(HEADING).querySelector('[role="alert"]')?.textContent).toContain(
        'indisponível',
      ),
    )
    expect(sectionOf(HEADING).querySelectorAll('input[type="checkbox"]').length).toBe(0)

    await click(buttonIn(sectionOf(HEADING), 'Tentar de novo'))

    await waitFor(() => expect(sectionOf(HEADING).querySelectorAll('input').length).toBe(1))
    expect(text()).not.toContain('indisponível')
  })
})
