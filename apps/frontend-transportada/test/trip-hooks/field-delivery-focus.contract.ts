/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T16: o foco de cada passo do assistente de baixa. Mora na suíte com DOM porque o que se
 * prova é `HTMLElement.focus()` e `document.activeElement` de verdade.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import {
  FIELD_DELIVERY_FOCUS_ATTRIBUTE,
  focusFieldDeliveryStep,
  resolveFieldDeliveryFocusTarget,
} from '@/modules/trip/shared/fieldDeliveryWizardFocus.service'

function mountDialog(html: string): HTMLDivElement {
  const dialog = document.createElement('div')
  dialog.tabIndex = -1
  dialog.innerHTML = html
  document.body.append(dialog)
  return dialog
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('foco do passo do assistente de baixa (spec 156 T16)', () => {
  test('o botão marcado recebe o foco — o Enter segue a ação do passo', () => {
    const dialog = mountDialog(
      `<button>Pular nota</button><button ${FIELD_DELIVERY_FOCUS_ATTRIBUTE}>Capturar</button>`,
    )
    focusFieldDeliveryStep(dialog)
    expect(document.activeElement?.textContent).toBe('Capturar')
  })

  test('marcador num invólucro (Select, FileField): o primeiro controle de dentro', () => {
    const dialog = mountDialog(
      `<label ${FIELD_DELIVERY_FOCUS_ATTRIBUTE}>Esta foto é da nota<button aria-haspopup="listbox">9000/1</button></label>`,
    )
    expect(resolveFieldDeliveryFocusTarget(dialog)?.textContent).toBe('9000/1')
  })

  test('o seletor de arquivo escondido nunca é o alvo', () => {
    const dialog = mountDialog(
      `<div ${FIELD_DELIVERY_FOCUS_ATTRIBUTE}><input type="file"><button>Escolher arquivo</button></div>`,
    )
    expect(resolveFieldDeliveryFocusTarget(dialog)?.textContent).toBe('Escolher arquivo')
  })

  test('alvo desabilitado ou ausente: o foco fica no diálogo, nunca no body', () => {
    const dialog = mountDialog(
      `<button ${FIELD_DELIVERY_FOCUS_ATTRIBUTE} disabled>Enviar 0 notas</button>`,
    )
    expect(resolveFieldDeliveryFocusTarget(dialog)).toBeUndefined()
    focusFieldDeliveryStep(dialog)
    expect(document.activeElement).toBe(dialog)
  })

  test('sem alvo e com o foco já dentro do diálogo, não o rouba', () => {
    const dialog = mountDialog('<input aria-label="Nome de quem recebeu">')
    const input = dialog.querySelector('input')
    input?.focus()
    focusFieldDeliveryStep(dialog)
    expect(document.activeElement).toBe(input)
  })
})
