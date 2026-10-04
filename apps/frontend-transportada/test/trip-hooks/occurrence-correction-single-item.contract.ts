/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 RF9 (P3): o formulário de correção conhece o teto de um item antes do envio — tipo com
 * `typeAllowsMultipleItems` desligado abre seleção única, e resposta sem o campo lê "vários". Dados
 * sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import {
  buttonByText,
  click,
  DetailHarness,
  installServerDouble,
  listedItems,
} from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, waitFor } from './renderHook.helper'

const SINGLE_ITEM_HINT = 'Este tipo aceita só um item'

function hasSingleItemHint(): boolean {
  return document.body.textContent?.includes(SINGLE_ITEM_HINT) === true
}

async function openCorrection(overrides: Parameters<typeof installServerDouble>[0]) {
  installServerDouble(overrides)
  const rendered = await renderWithQueryClient(createElement(DetailHarness))
  await waitFor(() => expect(listedItems()).toHaveLength(2))
  await click(buttonByText('Corrigir'))
  await waitFor(() =>
    expect(document.querySelector('input[aria-label="696 — Quantidade"]') !== null).toBe(true),
  )
  return rendered
}

describe('formulário de correção e o teto de um item (spec 241 RF9)', () => {
  test('tipo de item único abre a correção em seleção única', async () => {
    const rendered = await openCorrection({ typeAllowsMultipleItems: false })
    expect(hasSingleItemHint()).toBe(true)
    rendered.unmount()
  })

  test('tipo que aceita vários mantém a seleção múltipla', async () => {
    const rendered = await openCorrection({ typeAllowsMultipleItems: true })
    expect(hasSingleItemHint()).toBe(false)
    rendered.unmount()
  })

  test('resposta sem o campo (API anterior) lê vários, como hoje', async () => {
    const rendered = await openCorrection({})
    expect(hasSingleItemHint()).toBe(false)
    rendered.unmount()
  })
})
