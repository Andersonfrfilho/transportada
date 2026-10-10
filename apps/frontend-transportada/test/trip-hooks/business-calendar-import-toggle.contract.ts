/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T5.2 (RF6, RF11): o liga/desliga da importação da empresa, no bloco da chave. É o `Checkbox` do design system
 * com rótulo explícito (não existe `button role="switch"` no painel). Só pede `settings.manage`, que a aba já exige:
 * trocar a chave é outra permissão, mas ligar e desligar a importação da própria empresa não.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { BusinessCalendarRequestError } from '@/modules/company-settings/shared/businessCalendarRequest.service'

import { buildEnablement } from '../fixtures/holidayProviderSettings.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  callsOf,
  click,
  endScenario,
  mountPanel,
  sectionOf,
  startScenario,
  waitForText,
} from './businessCalendarHarness.helper'
import { providerSettingsDouble } from './holidayProviderSettingsDouble.helper'
import { waitFor } from './renderHook.helper'

const HEADING = 'Chave da FeriadosAPI'
const LABEL = 'Importar feriados da FeriadosAPI'
const GET_ENABLEMENT = 'GET /company-settings/holiday-import'
const PUT_ENABLEMENT = 'PUT /company-settings/holiday-import'
const GET_STATUS = 'GET /holiday-imports/status'

function block(): HTMLElement {
  return sectionOf(HEADING)
}

function toggle(): HTMLInputElement {
  const label = [...block().querySelectorAll('label')].find((candidate) =>
    candidate.textContent?.includes(LABEL),
  )
  const input = label?.querySelector<HTMLInputElement>('input[type="checkbox"]')
  if (input === null || input === undefined) throw new Error('TOGGLE_NOT_FOUND')
  return input
}

describe('liga/desliga da importação da empresa (spec 262 T5.2)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('sem linha a importação vem ligada, com o rótulo explícito e a ressalva sobre o que já foi importado', async () => {
    await mountPanel()

    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(callsOf(GET_ENABLEMENT, businessCalendarDouble.calls)).toHaveLength(1)
    expect(block().textContent).toContain('Desligar não apaga os feriados já importados')
    expect(block().textContent).toContain('use Desligar na lista')
  })

  it('a empresa que desligou abre com a caixa desmarcada', async () => {
    providerSettingsDouble.enablement = buildEnablement({ isEnabled: false, origin: 'company' })
    await mountPanel()

    await waitFor(() => expect(toggle().checked).toBe(false))
  })

  it('desligar manda só `isEnabled`, relê o cartão de status e avisa que gravou', async () => {
    await mountPanel()
    await waitFor(() => expect(toggle().checked).toBe(true))

    await click(toggle())

    await waitForText('Salvo')
    expect(callsOf(PUT_ENABLEMENT, businessCalendarDouble.calls)).toEqual([
      `${PUT_ENABLEMENT} {"isEnabled":false}`,
    ])
    expect(toggle().checked).toBe(false)
    await waitFor(() => expect(callsOf(GET_STATUS, businessCalendarDouble.calls)).toHaveLength(2))
  })

  it('religar manda `isEnabled: true`', async () => {
    providerSettingsDouble.enablement = buildEnablement({ isEnabled: false, origin: 'company' })
    await mountPanel()
    await waitFor(() => expect(toggle().checked).toBe(false))

    await click(toggle())

    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(callsOf(PUT_ENABLEMENT, businessCalendarDouble.calls)).toEqual([
      `${PUT_ENABLEMENT} {"isEnabled":true}`,
    ])
  })

  it('a recusa é dita e a caixa volta ao que está gravado', async () => {
    businessCalendarDouble.failNext.set(
      PUT_ENABLEMENT,
      new BusinessCalendarRequestError({ code: 'FORBIDDEN', status: 403 }),
    )
    await mountPanel()
    await waitFor(() => expect(toggle().checked).toBe(true))

    await click(toggle())

    await waitFor(() => expect(block().textContent).toContain('Seu perfil não tem permissão'))
    expect(toggle().checked).toBe(true)
  })

  it('a caixa tem rótulo associado e alvo de toque, não um botão nem um `role="switch"`', async () => {
    await mountPanel()
    await waitFor(() => expect(toggle().checked).toBe(true))

    expect(block().querySelectorAll('[role="switch"]').length).toBe(0)
    expect(toggle().closest('label')?.textContent).toContain(LABEL)
  })

  it('funciona sem `holiday-import.configure`: ligar e desligar a empresa é `settings.manage`', async () => {
    await mountPanel(true, false)
    await waitFor(() => expect(toggle().checked).toBe(true))

    await click(toggle())

    await waitFor(() => expect(toggle().checked).toBe(false))
    expect(callsOf(PUT_ENABLEMENT, businessCalendarDouble.calls)).toHaveLength(1)
  })

  it('carregando: esqueleto no lugar da caixa', async () => {
    businessCalendarDouble.failNext.set(GET_ENABLEMENT, 'hold')
    await mountPanel()

    expect(block().querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0)
    expect(block().querySelectorAll('input[type="checkbox"]').length).toBe(0)
  })

  it('falha ao ler: diz o motivo e "Tentar de novo" lê outra vez', async () => {
    businessCalendarDouble.failNext.set(
      GET_ENABLEMENT,
      new BusinessCalendarRequestError({ code: 'DATABASE_UNAVAILABLE', status: 503 }),
    )
    await mountPanel()

    await waitFor(() => expect(block().textContent).toContain('indisponível'))
    const retry = [...block().querySelectorAll('button')].filter(
      (button) => button.textContent?.trim() === 'Tentar de novo',
    )
    expect(retry.length).toBeGreaterThan(0)
    await click(retry[retry.length - 1] as HTMLButtonElement)

    await waitFor(() => expect(toggle().checked).toBe(true))
    expect(callsOf(GET_ENABLEMENT, businessCalendarDouble.calls)).toHaveLength(2)
  })
})
