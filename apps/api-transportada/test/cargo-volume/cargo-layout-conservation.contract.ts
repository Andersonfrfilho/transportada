/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoLayout,
  type CargoLayoutStop,
  type ResolvedCargoLayout,
} from '../../src/trips/domain/cargo-layout.policy.js'

const BED = { heightM: '2.200', lengthM: '5.320', source: 'measured' as const, widthM: '2.080' }
const CAPACITY_M3 = '24.000000'

const MEASURED_BOX = { heightMm: 300, lengthMm: 400, widthMm: 300 }
const UNMEASURED_BOX = { heightMm: null, lengthMm: null, widthMm: null }

/** A parada com cubagem: as caixas dela entram no desenho hoje. */
const WITH_VOLUME: CargoLayoutStop = {
  boxes: [{ ...MEASURED_BOX, count: 4, label: 'Com cubagem' }],
  documentsWithoutVolume: 0,
  label: 'Barrinha',
  sequence: 1,
  volumeM3: '0.144000',
}

function countInput(stops: readonly CargoLayoutStop[]): number {
  return stops.flatMap((stop) => stop.boxes ?? []).reduce((total, box) => total + box.count, 0)
}

function countDrawn(layout: ResolvedCargoLayout | null): number {
  return layout?.placement?.layers.reduce((total, layer) => total + layer.boxes.length, 0) ?? 0
}

function countNamed(layout: ResolvedCargoLayout | null): number {
  return layout?.placement?.unplaced.reduce((total, box) => total + box.count, 0) ?? 0
}

/**
 * **Nenhuma caixa some sem motivo.** A invariante da planta é `desenhadas + recusadas com motivo ==
 * caixas de entrada`, e ela vale para a viagem inteira — não só para as paradas que têm cubagem por
 * nota. A parada cuja NF-e não tem volume (sem `nfe_volumes`, sem fator por espécie, nenhuma caixa
 * medida) ainda tem caixas: cada produto vira caixa pela quantidade, e a planta as desenha presumidas
 * (spec 094) ou as nomeia `notMeasured`. Sumir com elas é o que a spec 085 recusou por escrito.
 */
describe('a planta conserva as caixas da viagem', () => {
  test('caixas medidas de uma parada sem cubagem por nota entram no desenho', () => {
    const stops: CargoLayoutStop[] = [
      WITH_VOLUME,
      {
        boxes: [{ ...MEASURED_BOX, count: 3, label: 'Medida, sem cubagem' }],
        documentsWithoutVolume: 1,
        label: 'Descalvado',
        sequence: 2,
        volumeM3: null,
      },
    ]
    const layout = resolveCargoLayout({ bedDimensions: BED, capacityM3: CAPACITY_M3, stops })

    expect(countDrawn(layout) + countNamed(layout)).toBe(countInput(stops))
    expect(countNamed(layout)).toBe(0)
  })

  test('caixas presumidas de uma parada sem cubagem por nota entram no desenho', () => {
    const stops: CargoLayoutStop[] = [
      WITH_VOLUME,
      {
        boxes: [{ ...UNMEASURED_BOX, count: 5, label: 'Presumida, sem cubagem' }],
        documentsWithoutVolume: 1,
        label: 'Descalvado',
        sequence: 2,
        volumeM3: null,
      },
    ]
    const layout = resolveCargoLayout({
      bedDimensions: BED,
      capacityM3: CAPACITY_M3,
      fallbackBoxVolumeM3: 0.036,
      measuredShapes: [MEASURED_BOX],
      stops,
    })

    expect(countDrawn(layout) + countNamed(layout)).toBe(countInput(stops))
    expect(countNamed(layout)).toBe(0)
    expect(layout?.placement?.source).toBe('estimated')
  })

  test('sem medida e sem caixa típica, a caixa da parada sem cubagem é nomeada, não sumida', () => {
    const stops: CargoLayoutStop[] = [
      WITH_VOLUME,
      {
        boxes: [{ ...UNMEASURED_BOX, count: 2, label: 'Sem medida' }],
        documentsWithoutVolume: 1,
        label: 'Descalvado',
        sequence: 2,
        volumeM3: null,
      },
    ]
    const layout = resolveCargoLayout({ bedDimensions: BED, capacityM3: CAPACITY_M3, stops })

    expect(countDrawn(layout) + countNamed(layout)).toBe(countInput(stops))
    expect(layout?.placement?.unplaced).toEqual([
      { count: 2, label: 'Sem medida', reason: 'notMeasured' },
    ])
  })

  /**
   * G002: nota sem ficha e sem mediana da empresa, mas com `qVol` no XML, ainda desenha as caixas
   * presumidas — pelo resíduo da nota (D2), não pela mediana. O m³ desenhado tem de fechar com o
   * m³ da fatia, dentro da tolerância de milímetro do arredondamento em caixas.
   */
  test('nota sem ficha e com qVol desenha as caixas presumidas pelo resíduo, fechando com a fatia', () => {
    const stops: CargoLayoutStop[] = [
      WITH_VOLUME,
      {
        boxes: [
          { ...UNMEASURED_BOX, count: 10, estimatedVolumeM3: 0.05, label: 'Presumida pela nota' },
        ],
        documentsWithoutVolume: 0,
        label: 'Descalvado',
        sequence: 2,
        volumeM3: '0.500000',
      },
    ]
    const layout = resolveCargoLayout({
      bedDimensions: BED,
      capacityM3: CAPACITY_M3,
      fallbackBoxVolumeM3: 0.036,
      measuredShapes: [MEASURED_BOX],
      stops,
    })

    expect(countDrawn(layout) + countNamed(layout)).toBe(countInput(stops))
    expect(countNamed(layout)).toBe(0)
    expect(layout?.placement?.source).toBe('estimated')

    const drawnBoxes = layout?.placement?.layers.flatMap((layer) => layer.boxes) ?? []
    const stopBoxes = drawnBoxes.filter((box) => box.label === 'Presumida pela nota')
    const drawnVolumeM3 = stopBoxes.reduce(
      (total, box) => total + box.heightM * box.widthM * box.depthM,
      0,
    )

    expect(Math.abs(drawnVolumeM3 - 0.5)).toBeLessThanOrEqual(10 * 1e-4)
  })

  /** A fatia continua sendo só de quem tem cubagem: a parada sem volume não vira fatia zero. */
  test('a parada sem cubagem continua fora das fatias e listada em stopsWithoutVolume', () => {
    const stops: CargoLayoutStop[] = [
      WITH_VOLUME,
      {
        boxes: [{ ...MEASURED_BOX, count: 3, label: 'Medida, sem cubagem' }],
        documentsWithoutVolume: 1,
        label: 'Descalvado',
        sequence: 2,
        volumeM3: null,
      },
    ]
    const layout = resolveCargoLayout({ bedDimensions: BED, capacityM3: CAPACITY_M3, stops })

    expect(layout?.slices.map((slice) => slice.label)).toEqual(['Barrinha'])
    expect(layout?.stopsWithoutVolume).toEqual([{ documentCount: 1, label: 'Descalvado' }])
  })
})
