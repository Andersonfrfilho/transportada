/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 255 T3.2 (RF4): o seletor de ícone da aba Tipos — um botão por nome do catálogo mais "Sem ícone",
 * cada um com nome acessível e `aria-pressed`; escolher devolve o nome, "Sem ícone" devolve `null`.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { OccurrenceTypeIconPicker } from '@/modules/trip/components/OccurrenceTypeIconPicker.component'
import { OCCURRENCE_TYPE_ICON_NAMES } from '@/modules/trip/shared/occurrenceTypeIcon.constant'

import { click } from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient } from './renderHook.helper'

type Choice = null | string

function mountPicker(value: Choice | undefined, chosen: Choice[]) {
  return renderWithQueryClient(
    createElement(OccurrenceTypeIconPicker, {
      disabled: false,
      onChange: (iconName: Choice) => chosen.push(iconName),
      value,
    }),
  )
}

function pickerButtons(): HTMLButtonElement[] {
  const group = document.querySelector('[role="group"]')
  return [...(group?.querySelectorAll('button') ?? [])]
}

describe('seletor de ícone do tipo de ocorrência (spec 255 T3.2)', () => {
  test('um botão por nome do catálogo mais "Sem ícone", todos com nome acessível', async () => {
    const view = await mountPicker('truck', [])
    const buttons = pickerButtons()
    expect(buttons).toHaveLength(OCCURRENCE_TYPE_ICON_NAMES.length + 1)
    expect(buttons.every((button) => (button.getAttribute('aria-label') ?? '') !== '')).toBe(true)
    expect(buttons.at(-1)?.getAttribute('aria-label')).toBe('Sem ícone')
    expect(buttons.find((b) => b.getAttribute('aria-label') === 'Caminhão')).toBeDefined()
    view.unmount()
  })

  test('aria-pressed marca só o ícone escolhido', async () => {
    const view = await mountPicker('truck', [])
    const pressed = pickerButtons().filter((b) => b.getAttribute('aria-pressed') === 'true')
    expect(pressed.map((b) => b.getAttribute('aria-label'))).toEqual(['Caminhão'])
    view.unmount()
  })

  test('sem ícone (null ou ausente) marca "Sem ícone"', async () => {
    for (const value of [null, undefined]) {
      const view = await mountPicker(value, [])
      const pressed = pickerButtons().filter((b) => b.getAttribute('aria-pressed') === 'true')
      expect(pressed.map((b) => b.getAttribute('aria-label'))).toEqual(['Sem ícone'])
      view.unmount()
    }
  })

  test('escolher devolve o nome; "Sem ícone" devolve null', async () => {
    const chosen: Choice[] = []
    const view = await mountPicker('truck', chosen)
    const buttons = pickerButtons()
    await click(buttons.find((b) => b.getAttribute('aria-label') === 'Câmera') as HTMLElement)
    await click(buttons.at(-1) as HTMLElement)
    expect(chosen).toEqual(['camera', null])
    view.unmount()
  })
})
