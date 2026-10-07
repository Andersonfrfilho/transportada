/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.4b: a empresa sem nenhum tipo de avaria de recebimento (a semente gravou 0 tipos) abria o
 * formulário com um seletor vazio e mudo — a pessoa não sabia por que não conseguia escolher. Agora o estado
 * vazio diz o que fazer ("Avise o suporte") e o botão de registrar fica desabilitado EXPLICANDO por quê.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import {
  dialog,
  mountSeparation,
  openOccurrenceForm,
  stubVisibleLayout,
} from './cargoOccurrenceScreen.helper'
import { click } from './cargoReceivingHarness.helper'
import { settle } from './renderHook.helper'

let restoreLayout: () => void = () => undefined

beforeEach(() => {
  document.body.innerHTML = ''
  restoreLayout = stubVisibleLayout()
})

afterEach(() => restoreLayout())

const submitButton = (): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(
    (button) => button.textContent?.trim() === 'Registrar avaria',
  ) as HTMLButtonElement

describe('o formulário da avaria sem nenhum tipo cadastrado', () => {
  test('mostra a mensagem, desabilita o registro e diz por quê (e o servidor nunca é chamado)', async () => {
    const { occurrence, rendered } = await mountSeparation({ occurrence: { types: [] } })

    await openOccurrenceForm(1001)

    const empty = dialog()?.querySelector<HTMLElement>('[data-types-empty]')
    expect(empty?.textContent).toBe(
      'Nenhum tipo de avaria de recebimento cadastrado. Avise o suporte.',
    )
    expect(submitButton().disabled).toBe(true)
    const reasonId = submitButton().getAttribute('aria-describedby') ?? ''
    expect(reasonId).not.toBe('')
    expect(document.getElementById(reasonId)?.textContent).toContain('não há tipo de avaria')
    await click(submitButton())
    await settle()
    expect(occurrence.calls.register).toHaveLength(0)
    rendered.unmount()
  })

  test('com tipos cadastrados nada disso aparece e o registro segue habilitado', async () => {
    const { rendered } = await mountSeparation()

    await openOccurrenceForm(1001)

    expect(dialog()?.querySelectorAll('[data-types-empty]').length).toBe(0)
    expect(submitButton().disabled).toBe(false)
    expect(submitButton().getAttribute('aria-describedby')).toBeNull()
    rendered.unmount()
  })
})
