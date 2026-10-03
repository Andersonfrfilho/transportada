/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 235 T2.3 (RF7, CA05): cada código estável da API vira a sua mensagem em português, afirmada
 * pelo **texto renderizado** no alerta do formulário — nenhum cai no texto genérico. Dados sintéticos.
 */
import { createElement } from 'react'
import { describe, expect, test } from 'bun:test'

import '@/modules/shared/i18n/i18n.service'
import tripEn from '@/modules/trip/locales/trip.en.locale.json'
import tripPt from '@/modules/trip/locales/trip.locale.json'
import { OCCURRENCE_CORRECTION_ERROR } from '@/modules/trip/shared/occurrence.constant'
import { resolveTripFeedbackKey } from '@/modules/trip/shared/tripFeedback.service'

import {
  buttonByText,
  click,
  DetailHarness,
  installServerDouble,
} from './occurrenceCorrectionHarness.helper'
import { tripHookFakes as fakes } from './tripClientMocks.helper'
import { renderWithQueryClient, settle, waitFor } from './renderHook.helper'

const GENERIC =
  'O servidor recusou esta operação. Nada foi gravado — tente de novo e, se repetir, avise o suporte com o horário.'
const REFRESHED = 'Nada foi gravado; a tela foi atualizada com o estado atual.'

const MESSAGES: readonly (readonly [label: string, code: string, text: string])[] = [
  [
    'tratativa aberta (409)',
    OCCURRENCE_CORRECTION_ERROR.CASE_ALREADY_OPEN,
    `A tratativa desta ocorrência já foi aberta, e ela não pode mais ser corrigida nem cancelada. ${REFRESHED}`,
  ],
  [
    'já cancelada (409)',
    OCCURRENCE_CORRECTION_ERROR.ALREADY_CANCELLED,
    `Esta ocorrência já foi cancelada e não pode ser cancelada de novo. ${REFRESHED}`,
  ],
  [
    'cancelada, corrigir (409)',
    OCCURRENCE_CORRECTION_ERROR.CANCELLED,
    `Esta ocorrência foi cancelada e não pode mais ser corrigida. ${REFRESHED}`,
  ],
  [
    'teto de um item (422)',
    OCCURRENCE_CORRECTION_ERROR.TYPE_SINGLE_ITEM,
    'Este tipo de ocorrência aceita um item só. Deixe apenas um item e salve de novo.',
  ],
  [
    'quantidade não positiva (400)',
    OCCURRENCE_CORRECTION_ERROR.ITEM_QUANTITY_NOT_POSITIVE,
    'A quantidade de cada item precisa ser maior que zero. Corrija e salve de novo.',
  ],
  [
    'quantidade sem unidade (400)',
    OCCURRENCE_CORRECTION_ERROR.ITEM_QUANTITY_UNIT_PAIRING,
    'Quantidade e unidade andam juntas: informe as duas ou nenhuma. Corrija e salve de novo.',
  ],
  [
    'item fora da nota (422)',
    OCCURRENCE_CORRECTION_ERROR.PRODUCT_NOT_IN_DOCUMENT,
    'Um dos itens escolhidos não está nesta nota. Escolha só itens da nota e salve de novo.',
  ],
  [
    'ocorrência inexistente (404)',
    OCCURRENCE_CORRECTION_ERROR.OCCURRENCE_NOT_FOUND,
    'Esta ocorrência não foi encontrada. Volte à lista de ocorrências e tente de novo.',
  ],
]

async function saveRejectingWith(
  code: string,
): Promise<Readonly<{ alert: string; reads: number }>> {
  const { detailReads } = installServerDouble()
  fakes.tripClient = {
    ...fakes.tripClient,
    correctTripOccurrenceItems: () => Promise.reject(new Error(code)),
  }
  const rendered = await renderWithQueryClient(createElement(DetailHarness))
  await waitFor(() => expect(document.querySelector('ul[aria-label="itens"]')).not.toBeNull())
  await click(buttonByText('Corrigir'))
  await waitFor(() =>
    expect(document.querySelector('input[aria-label="696 — Quantidade"]')).not.toBeNull(),
  )
  const readsBefore = detailReads()
  await click(buttonByText('Salvar correção'))
  await settle()
  const alert = document.querySelector('[role="alert"]')?.textContent ?? ''
  const reads = detailReads() - readsBefore
  rendered.unmount()
  return { alert, reads }
}

describe('mensagens de erro da correção, por código estável (spec 235 T2.3, CA05)', () => {
  for (const [label, code, text] of MESSAGES) {
    test(`${label}: ${code} mostra a mensagem própria, e não a genérica`, async () => {
      const { alert } = await saveRejectingWith(code)
      expect(alert).toBe(text)
      expect(alert).not.toBe(GENERIC)
    })
  }

  test('código desconhecido cai no genérico', async () => {
    const { alert } = await saveRejectingWith('CODIGO_QUE_A_TELA_NAO_CONHECE')
    expect(alert).toBe(GENERIC)
  })

  test('as oito mensagens são distintas entre si', () => {
    expect(new Set(MESSAGES.map(([, , text]) => text)).size).toBe(MESSAGES.length)
  })

  test('em inglês, cada código também tem mensagem própria, diferente da do português', () => {
    const english: Readonly<Record<string, string>> = tripEn.feedback
    const portuguese: Readonly<Record<string, string>> = tripPt.feedback
    for (const [, code] of MESSAGES) {
      const key = resolveTripFeedbackKey(new Error(code))
      expect(key).not.toBe('serverRefused')
      expect(typeof english[key ?? '']).toBe('string')
      expect(english[key ?? '']).not.toBe(portuguese[key ?? ''])
    }
  })

  test('depois do 409 de tratativa, a tela recarrega o detalhe', async () => {
    const { reads } = await saveRejectingWith(OCCURRENCE_CORRECTION_ERROR.CASE_ALREADY_OPEN)
    expect(reads).toBeGreaterThanOrEqual(1)
  })
})
