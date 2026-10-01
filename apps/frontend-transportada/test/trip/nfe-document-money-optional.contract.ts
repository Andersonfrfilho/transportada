/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T701 (achado CRITICAL da revisão final): sem `trip.financials` (T301) a API corta
 * `totalAmount`/`freightAmount` da linha de `/nfe-documents` — a chave **some**, nunca `null`, nunca
 * zero. O bipe por chave de acesso (`scannedNfeDocumentFromApi`) lançava `TRIP_RESPONSE_INVALID`, e
 * a busca por faixa (`tripCandidateDocumentPageFromApi`) descartava a linha em silêncio, porque os
 * dois validadores ainda exigiam `totalAmount` sempre presente. Os papéis `fiscal`, `viewer` e
 * `separator` bipam nota sem ver valor.
 */
import { describe, expect, test } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import { NFE_DOCUMENT_LISTING_ROW } from './trip.fixture'

const adapters = createTripResponseAdapters()

function linhaSemDinheiro(): Record<string, unknown> {
  const row: Record<string, unknown> = { ...NFE_DOCUMENT_LISTING_ROW }
  delete row.totalAmount
  delete row.freightAmount
  return row
}

describe('nota fiscal sem trip.financials na viagem (D10)', () => {
  test('o bipe por chave de acesso não lança e some com o valor, nunca zero', () => {
    const document = adapters.scannedNfeDocumentFromApi({
      data: [linhaSemDinheiro()],
    }) as { freightAmount: unknown; totalAmount: unknown; emitterName: unknown } | null

    expect(document).not.toBeNull()
    expect(document?.totalAmount).toBeNull()
    expect(document?.freightAmount).toBeNull()
    expect(document?.emitterName).toBe(NFE_DOCUMENT_LISTING_ROW.emitterName)
  })

  test('o bipe com trip.financials continua trazendo o valor', () => {
    const document = adapters.scannedNfeDocumentFromApi({
      data: [NFE_DOCUMENT_LISTING_ROW],
    }) as { totalAmount: unknown } | null

    expect(document?.totalAmount).toBe(NFE_DOCUMENT_LISTING_ROW.totalAmount)
  })

  test('a busca por faixa mantém a linha sem dinheiro, em vez de descartá-la em silêncio', () => {
    const page = adapters.tripCandidateDocumentPageFromApi({
      data: [linhaSemDinheiro()],
    }) as { items: readonly { totalAmount: unknown; freightAmount: unknown }[] }

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.totalAmount).toBeNull()
    expect(page.items[0]?.freightAmount).toBeNull()
  })

  test('a busca por faixa com trip.financials continua trazendo o valor', () => {
    const page = adapters.tripCandidateDocumentPageFromApi({
      data: [NFE_DOCUMENT_LISTING_ROW],
    }) as { items: readonly { totalAmount: unknown }[] }

    expect(page.items[0]?.totalAmount).toBe(NFE_DOCUMENT_LISTING_ROW.totalAmount)
  })
})
