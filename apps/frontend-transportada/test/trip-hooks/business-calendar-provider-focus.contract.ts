/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final), acessibilidade do bloco da chave da FeriadosAPI: a confirmação de remover é um diálogo
 * modal rotulado pela pergunta (foco dentro, Esc fecha, o foco volta ao gatilho); depois de salvar ou remover, o formulário
 * remonta e o foco não pode cair no `body` — vai ao aviso de status; e o liga/desliga não perde o foco enquanto grava.
 */
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { act } from 'react'

import {
  buildEnablement,
  buildProviderSettings,
  FAKE_PROVIDER_TOKEN,
} from '../fixtures/holidayProviderSettings.fixture'

import { businessCalendarDouble } from './businessCalendarClientMocks.helper'
import {
  buttonIn,
  callsOf,
  click,
  dialog,
  endScenario,
  mountPanel,
  sectionOf,
  startScenario,
  typeInto,
  waitForText,
} from './businessCalendarHarness.helper'
import { providerSettingsDouble } from './holidayProviderSettingsDouble.helper'
import { waitFor } from './renderHook.helper'

const HEADING = 'Chave da FeriadosAPI'
const QUESTION = 'Remover a chave da FeriadosAPI?'
const DELETE_TOKEN = 'DELETE /holiday-imports/provider-settings/token'
const PUT_ENABLEMENT = 'PUT /company-settings/holiday-import'
const TOGGLE_LABEL = 'Importar feriados da FeriadosAPI'

function block(): HTMLElement {
  return sectionOf(HEADING)
}

function dialogElement(): HTMLElement {
  const found = dialog()
  if (found === null) throw new Error('DIALOG_NOT_FOUND')
  return found
}

/** Compara o foco por booleano: o Bun cai ao imprimir um nó do DOM numa asserção que falha. */
function isFocused(element: Element): boolean {
  return document.activeElement === element
}

/** O texto do aviso `role="status"` que tem o foco; vazio se o foco está em outro lugar (o `body` contém a página inteira). */
function focusedText(): string {
  const active = document.activeElement
  return active?.getAttribute('role') === 'status' ? (active.textContent ?? '') : ''
}

function toggleInput(): HTMLInputElement {
  const label = [...block().querySelectorAll('label')].find((candidate) =>
    candidate.textContent?.includes(TOGGLE_LABEL),
  )
  const input = label?.querySelector('input')
  if (input === null || input === undefined) throw new Error('TOGGLE_NOT_FOUND')
  return input
}

async function openRemoval(): Promise<HTMLButtonElement> {
  providerSettingsDouble.settings = buildProviderSettings()
  await mountPanel()
  await waitForText('Chave configurada')
  const trigger = buttonIn(block(), 'Remover chave')
  trigger.focus()
  await click(trigger)
  return trigger
}

describe('remover a chave: diálogo modal acessível (spec 262 T6.1b)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('abre como diálogo modal rotulado pela pergunta, com o foco dentro dele', async () => {
    await openRemoval()

    const opened = dialogElement()
    const labelId = opened.getAttribute('aria-labelledby') ?? ''
    expect(opened.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(labelId)?.textContent).toContain(QUESTION)
    expect(opened.contains(document.activeElement)).toBe(true)
    expect(callsOf(DELETE_TOKEN, businessCalendarDouble.calls)).toHaveLength(0)
  })

  it('"Cancelar" fecha o diálogo, não remove nada e devolve o foco ao botão de remover', async () => {
    const trigger = await openRemoval()

    await click(buttonIn(dialogElement(), 'Cancelar'))

    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0)
    expect(isFocused(trigger)).toBe(true)
    expect(callsOf(DELETE_TOKEN, businessCalendarDouble.calls)).toHaveLength(0)
  })

  it('Esc fecha o diálogo e devolve o foco ao botão de remover', async () => {
    const trigger = await openRemoval()

    await act(async () => {
      dialogElement().dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
      await Promise.resolve()
    })

    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0)
    expect(isFocused(trigger)).toBe(true)
  })

  it('confirmar remove só a chave, fecha o diálogo e leva o foco ao aviso "Chave removida."', async () => {
    await openRemoval()

    await click(buttonIn(dialogElement(), 'Sim, remover a chave'))

    await waitFor(() => expect(focusedText()).toContain('Chave removida'))
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0)
    expect(callsOf(DELETE_TOKEN, businessCalendarDouble.calls)).toHaveLength(1)
  })
})

describe('depois de salvar o formulário remonta, e o foco não cai no body (spec 262 T6.1b)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('salvar leva o foco ao aviso "Configuração salva"', async () => {
    providerSettingsDouble.settings = buildProviderSettings()
    await mountPanel()
    await waitForText('Chave configurada')
    const field = block().querySelector<HTMLInputElement>('input[type="password"]')
    if (field === null) throw new Error('TOKEN_FIELD_NOT_FOUND')
    await typeInto(field, FAKE_PROVIDER_TOKEN)

    await click(buttonIn(block(), 'Salvar'))

    await waitFor(() => expect(focusedText()).toContain('Configuração salva'))
    expect(focusedText()).not.toContain(FAKE_PROVIDER_TOKEN)
  })
})

describe('liga/desliga da importação: grava sem perder o foco (spec 262 T6.1b)', () => {
  beforeEach(startScenario)
  afterEach(endScenario)

  it('enquanto grava a caixa continua habilitada e focada, e "Salvando…" é um aviso de status', async () => {
    providerSettingsDouble.enablement = buildEnablement()
    businessCalendarDouble.failNext.set(PUT_ENABLEMENT, 'hold')
    await mountPanel()
    await waitForText(TOGGLE_LABEL)
    const input = toggleInput()
    input.focus()

    await click(input)

    expect(input.disabled).toBe(false)
    expect(isFocused(input)).toBe(true)
    const statusTexts = [...block().querySelectorAll('[role="status"]')].map(
      (element) => element.textContent ?? '',
    )
    expect(statusTexts.some((text) => text.includes('Salvando'))).toBe(true)
  })

  it('um segundo clique durante a gravação não manda outro pedido', async () => {
    providerSettingsDouble.enablement = buildEnablement()
    businessCalendarDouble.failNext.set(PUT_ENABLEMENT, 'hold')
    await mountPanel()
    await waitForText(TOGGLE_LABEL)
    const input = toggleInput()

    await click(input)
    await click(input)

    expect(callsOf(PUT_ENABLEMENT, businessCalendarDouble.calls)).toHaveLength(1)
  })
})
