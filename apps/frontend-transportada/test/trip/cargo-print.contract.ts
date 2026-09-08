/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { buildCargoPrintSummary } from '@/modules/trip/shared/cargoPrintSummary.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function box(overrides: Partial<Parameters<typeof buildCargoPrintSummary>[0][number]>) {
  return { depthM: 0.5, isEstimated: false, isSplit: false, stopSequence: 1, xM: 0, ...overrides }
}

/** Spec 095 G008: a folha que o agregado leva para dentro da van. */
describe('trip cargo print contract', () => {
  /**
   * ⚠️ A folha sai na **ordem de carregamento**, que é o inverso da de entrega: quem empilha começa
   * pela última parada, encostando na testeira. Na ordem de entrega, a folha se lê de baixo para
   * cima.
   */
  it('prints in loading order, not delivery order', () => {
    const rows = buildCargoPrintSummary([
      box({ stopSequence: 1, xM: 4 }),
      box({ stopSequence: 3, xM: 0 }),
      box({ stopSequence: 2, xM: 2 }),
    ])

    expect(rows.map((row) => row.stopSequence)).toEqual([3, 2, 1])
  })

  /** Cada parada leva a faixa que ocupa, em metros do fundo — é o que se confere com a fita. */
  it('gives each stop its span in metres', () => {
    const rows = buildCargoPrintSummary([
      box({ stopSequence: 1, xM: 2 }),
      box({ depthM: 1, stopSequence: 1, xM: 3 }),
    ])

    expect(rows[0]).toMatchObject({ boxes: 2, fromM: 2, toM: 4 })
  })

  /**
   * ⚠️ A faixa em metros **não conta a sobra**: ela mora fora da fatia, mais funda, e a folha
   * imprimiria um começo dentro da parada seguinte — apontando o lugar errado na única informação
   * que ela promete carregar.
   */
  it('leaves split cargo out of the printed span', () => {
    const rows = buildCargoPrintSummary([
      box({ isSplit: true, stopSequence: 1, xM: 0.5 }),
      box({ stopSequence: 1, xM: 3 }),
    ])

    expect(rows[0]).toMatchObject({ boxes: 2, fromM: 3, split: 1, toM: 3.5 })
  })

  /** As duas contagens que mudam o que a pessoa faz: o que é palpite e o que está fora do lugar. */
  it('counts presumed and split cargo apart', () => {
    const rows = buildCargoPrintSummary([
      box({ isEstimated: true }),
      box({ isSplit: true }),
      box({}),
    ])

    expect(rows[0]).toMatchObject({ boxes: 3, presumed: 1, split: 1 })
  })

  /**
   * ⚠️ **Nada na folha pode depender de cor**: o galpão imprime em laser mono. E os controles não
   * vão para o papel — botão impresso é tinta gasta.
   */
  it('prints black on white, without the controls', () => {
    const css = readFileSync(
      new URL('src/modules/trip/styles/trip.module.css', APPLICATION_ROOT),
      'utf8',
    )

    expect(css).toContain('@media print')
    expect(css).toContain('.cargoPads')
    expect(trip.cargoLayers.print).toBeDefined()
  })
})
