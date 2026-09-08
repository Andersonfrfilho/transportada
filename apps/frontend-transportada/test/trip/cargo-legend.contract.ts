/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { isMostlyPresumed, resolveSliceCuts } from '@/modules/trip/shared/cargoLegend.service'
import trip from '../../src/modules/trip/locales/trip.locale.json'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function box(
  overrides: Partial<{
    isEstimated: boolean
    isSplit: boolean
    stopSequence: number
    xM: number
    yM: number
  }>,
) {
  /** `yM` só é lido em faixas; esta suíte é toda de profundidade (spec 100). */
  return { isEstimated: false, isSplit: false, stopSequence: 1, xM: 0, yM: 0, ...overrides }
}

/** Spec 095 G007: a tela conta o que sabe e o que presume. */
describe('trip cargo legend contract', () => {
  /** A divisa é onde a carga da parada começa — e o zero é a testeira, não uma divisa. */
  it('draws a cut where each stop starts, never at the front wall', () => {
    const cuts = resolveSliceCuts([
      box({ stopSequence: 3, xM: 0 }),
      box({ stopSequence: 3, xM: 1.2 }),
      box({ stopSequence: 2, xM: 2.4 }),
      box({ stopSequence: 1, xM: 5 }),
    ])

    expect(cuts).toEqual([2.4, 5])
  })

  /**
   * ⚠️ A carga **dividida** fica de fora da conta: ela mora fora da própria fatia, mais funda, e
   * incluí-la fazia uma parada com uma única sobra empurrar a divisa para dentro da fatia seguinte —
   * a linha contradizendo justamente a separação que ela existe para mostrar.
   */
  it('ignores split cargo when placing the cut', () => {
    const cuts = resolveSliceCuts([
      box({ stopSequence: 2, xM: 0 }),
      box({ isSplit: true, stopSequence: 1, xM: 0.5 }),
      box({ stopSequence: 1, xM: 3 }),
    ])

    expect(cuts).toEqual([3])
  })

  /** Uma parada só não tem divisa nenhuma: não há o que separar. */
  it('draws no cut for a single stop', () => {
    expect(resolveSliceCuts([box({}), box({ xM: 2 })])).toEqual([])
  })

  /**
   * ⚠️ Com quase toda a carga presumida o desenho segue útil como volume e é enganoso como
   * arrumação — hoje 15 de 345 notas têm todas as linhas casadas a caixa medida.
   */
  it('separates almost nothing measured from something presumed', () => {
    const mixed = [box({ isEstimated: true }), box({}), box({}), box({}), box({})]
    const almostNone = [box({ isEstimated: true }), box({ isEstimated: true }), box({})]

    expect(isMostlyPresumed(mixed)).toBe(false)
    expect(isMostlyPresumed(almostNone)).toBe(false)
    expect(isMostlyPresumed([box({ isEstimated: true })])).toBe(true)
  })

  /** Carga vazia não é carga presumida: sem caixa nenhuma não há aviso a dar. */
  it('says nothing about an empty bed', () => {
    expect(isMostlyPresumed([])).toBe(false)
  })

  /** A legenda nomeia as três marcas do desenho; sem ela o contorno vermelho não quer dizer nada. */
  it('names measured, presumed and split cargo', () => {
    const source = readFileSync(
      new URL('src/modules/trip/components/TripCargoLayers.component.tsx', APPLICATION_ROOT),
      'utf8',
    )

    expect(source).toContain("t('cargoLayers.legend.measured')")
    expect(source).toContain("t('cargoLayers.legend.presumed')")
    expect(source).toContain("t('cargoLayers.legend.split')")
    expect(trip.cargoLayers.legend.split).toContain('dividida')
    expect(trip.cargoLayers.mostlyPresumed).toContain('medida')
  })
})
