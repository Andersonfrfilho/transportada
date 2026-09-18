/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * M13f (spec 156 T15): Enter tira foto no passo de captura, mas não pode disputar com o clique
 * nativo de um botão focado (ex.: "Pular") — `shouldTriggerCaptureShortcut` precisa de `HTMLElement`
 * de verdade, por isso mora aqui (DOM do `dom.preload.ts`), não no contrato principal sem DOM.
 */
import { describe, expect, test } from 'bun:test'

import { shouldTriggerCaptureShortcut } from '@/modules/trip/shared/fieldDeliveryCapture.service'

describe('shouldTriggerCaptureShortcut (spec 156 T15, M13f)', () => {
  test('foco num botão não dispara o atalho — o Enter é do botão', () => {
    const button = document.createElement('button')
    expect(shouldTriggerCaptureShortcut(button)).toBe(false)
  })

  test('foco em campo de texto/select/link também não dispara', () => {
    expect(shouldTriggerCaptureShortcut(document.createElement('input'))).toBe(false)
    expect(shouldTriggerCaptureShortcut(document.createElement('select'))).toBe(false)
    expect(shouldTriggerCaptureShortcut(document.createElement('a'))).toBe(false)
  })

  test('elemento com role="button" (ex.: div interativo) também não dispara', () => {
    const div = document.createElement('div')
    div.setAttribute('role', 'button')
    expect(shouldTriggerCaptureShortcut(div)).toBe(false)
  })

  test('foco no contêiner (nada interativo) dispara o atalho normalmente', () => {
    expect(shouldTriggerCaptureShortcut(document.createElement('div'))).toBe(true)
  })

  test('sem elemento (target nulo) dispara — mantém o comportamento anterior', () => {
    expect(shouldTriggerCaptureShortcut(null)).toBe(true)
  })
})
