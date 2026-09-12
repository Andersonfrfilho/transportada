/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import { buildCargoPreviewStops } from '../../src/trips/domain/cargo-preview.policy.js'

/**
 * Spec 119: a caixa da planta sabe de que nota veio. O empacotador (hoje em
 * `@adatechnology/cargo-placement`) prova que a nota não move caixa; aqui fica a metade da app —
 * quem carimba a nota antes de chamar o pacote.
 */
describe('cargo placement note identity contract (spec 119)', () => {
  /** A prévia carimba a nota onde as caixas viram da parada — nunca num mapa ao lado. */
  test('stamps the note on the boxes where the preview groups them by stop', () => {
    const stops = buildCargoPreviewStops({
      boxesByDocument: new Map([
        ['nota-a', [{ count: 1, heightMm: 100, lengthMm: 100, widthMm: 100 }]],
        ['nota-b', [{ count: 2, heightMm: 100, lengthMm: 100, widthMm: 100 }]],
      ]),
      documents: [
        {
          addressKey: 'k',
          label: 'Loja',
          nfeDocumentId: 'nota-a',
          number: '7',
          volumeM3: null,
          weightKilograms: null,
        },
        {
          addressKey: 'k',
          label: 'Loja',
          nfeDocumentId: 'nota-b',
          volumeM3: null,
          weightKilograms: null,
        },
      ],
      order: [],
    })

    expect(stops[0]?.boxes?.map((entry) => [entry.documentId, entry.documentNumber])).toEqual([
      ['nota-a', '7'],
      ['nota-b', null],
    ])
  })

  /** O detalhe da viagem carimba pela mesma chave, na mesma volta que agrupa as caixas da parada. */
  test('stamps the note in the trip detail too', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/drizzle-trip.repository.ts', import.meta.url),
      'utf8',
    )

    expect(source).toContain('documentId: document.nfeDocumentId')
  })
})
