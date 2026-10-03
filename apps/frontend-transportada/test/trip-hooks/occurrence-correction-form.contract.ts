/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235 T2.2 (RF2, CA01): o formulário de correção montado de verdade, com a API dublada. Reabre com
 * o conjunto atual, manda o conjunto inteiro e o detalhe passa a mostrar a correção. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'

import { DETAIL_FIXTURE_IDS } from '../fixtures/tripOccurrenceDetail.fixture'
import {
  buttonByText,
  click,
  DetailHarness,
  installServerDouble,
  listedItems,
  typeQuantity,
} from './occurrenceCorrectionHarness.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

describe('formulário de correção da ocorrência (spec 235 T2.2, CA01)', () => {
  test('reabre com o conjunto atual, salva o conjunto inteiro e o detalhe mostra a correção', async () => {
    const { calls } = installServerDouble()
    const rendered = await renderWithQueryClient(createElement(DetailHarness))
    await waitFor(() => expect(listedItems()).toEqual(['696:3.000', '697:-']))

    await click(buttonByText('Corrigir'))
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
    )
    const prefilled = document.querySelector<HTMLInputElement>(
      'input[aria-label="696 — Quantidade"]',
    )
    expect(prefilled?.value).toBe('3.000')
    expect(
      document.querySelector('input[aria-label="697 — Quantidade"]')?.getAttribute('value'),
    ).toBe('')

    await typeQuantity('696 — Quantidade', '4')
    await click(buttonByText('Salvar correção'))
    await settle()

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      documentId: DETAIL_FIXTURE_IDS.documentId,
      idempotencyKey: expect.any(String) as unknown as string,
      items: [{ code: '696', quantity: '4', unit: 'box' }, { code: '697' }],
      occurrenceId: DETAIL_FIXTURE_IDS.occurrenceId,
      tripId: DETAIL_FIXTURE_IDS.tripId,
    })
    await waitFor(() => expect(listedItems()).toEqual(['696:4', '697:-']))
    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).toBeNull()
    rendered.unmount()
  })

  test('Descartar fecha o formulário sem chamar a API', async () => {
    const { calls } = installServerDouble()
    const rendered = await renderWithQueryClient(createElement(DetailHarness))
    await waitFor(() => expect(listedItems()).toHaveLength(2))

    await click(buttonByText('Corrigir'))
    await waitFor(() =>
      expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
    )
    await click(buttonByText('Descartar'))

    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).toBeNull()
    expect(calls).toHaveLength(0)
    rendered.unmount()
  })
})
