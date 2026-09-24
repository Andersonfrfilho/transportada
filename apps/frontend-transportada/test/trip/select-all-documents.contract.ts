/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A marcação por parada (spec 181 RF12) obrigava quem queria agir sobre a viagem inteira a clicar
 * parada por parada. Este contrato prova a caixa única no cabeçalho de "Cargas da viagem": cobre as
 * notas de todas as paradas **e** as sem parada, usa o mesmo `toggleMany` da seleção existente e
 * mostra o estado indeterminado quando só parte está marcada.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const SELECT_ALL = new URL(
  '../../src/modules/trip/components/TripSelectAllDocuments.component.tsx',
  import.meta.url,
)
const DETAIL = new URL(
  '../../src/modules/trip/components/TripDetail.component.tsx',
  import.meta.url,
)
const LOCALES = ['trip.locale.json', 'trip.en.locale.json'].map(
  (file) => new URL(`../../src/modules/trip/locales/${file}`, import.meta.url),
)

describe('selecionar todas as notas da viagem de uma vez', () => {
  it('a caixa marca e desmarca todas as notas pelo mesmo toggleMany da seleção', () => {
    const source = readFileSync(SELECT_ALL, 'utf8')

    expect(source).toContain('const allSelected =')
    expect(source).toContain('const someSelected =')
    expect(source).toContain('indeterminate={someSelected && !allSelected}')
    expect(source).toContain('onChange={(checked) => selection.toggleMany(documentIds, checked)}')
  })

  it('viagem sem nota não mostra a caixa', () => {
    const source = readFileSync(SELECT_ALL, 'utf8')

    expect(source).toContain('if (documentIds.length === 0) return null')
  })

  it('fica no cabeçalho de "Cargas da viagem", antes da lista, e cobre todas as notas da viagem', () => {
    const source = readFileSync(DETAIL, 'utf8')
    const titulo = source.indexOf('id="trip-stops-title"')
    const caixa = source.indexOf('<TripSelectAllDocuments', titulo)
    const lista = source.indexOf('<TripStopList', titulo)

    expect(caixa).toBeGreaterThan(titulo)
    expect(caixa).toBeLessThan(lista)
    expect(source.slice(caixa, lista)).toContain(
      'documentIds={trip.documents.map((document) => document.id)}',
    )
  })

  it('o rótulo existe nos dois idiomas', () => {
    for (const locale of LOCALES) {
      const stops = (JSON.parse(readFileSync(locale, 'utf8')) as { stops: Record<string, string> })
        .stops
      expect(stops.selectAllTrip).toBeString()
    }
  })
})
