/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveCargoLayout,
  type CargoLayoutStop,
} from '../../src/trips/domain/cargo-layout.policy.js'

const CAPACIDADE = { capacityM3: '10.000000' }
const BED = { heightM: '2.200', lengthM: '5.320', source: 'measured' as const, widthM: '2.080' }
const MEASURED_BOX = { heightMm: 300, lengthMm: 400, widthMm: 300 }
const UNMEASURED_BOX = { heightMm: null, lengthMm: null, widthMm: null }

function drawnVolumeM3(box: {
  readonly depthM: number
  readonly heightM: number
  readonly widthM: number
}): number {
  return box.heightM * box.widthM * box.depthM
}

/** Três paradas na ordem de entrega: a primeira é a que sai primeiro. */
const PARADAS = [
  { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '2.000000' },
  { documentsWithoutVolume: 0, label: 'Descalvado', sequence: 2, volumeM3: '3.000000' },
  { documentsWithoutVolume: 0, label: 'Campinas', sequence: 3, volumeM3: '1.000000' },
]

describe('mapa de carga do baú (spec 076)', () => {
  test('a fatia é proporcional ao volume da parada', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })

    expect(layout?.slices.map((slice) => slice.share)).toEqual(['0.2000', '0.3000', '0.1000'])
  })

  /**
   * ⚠️ O coração da feature: **quem entrega por último viaja no fundo**. A ordem de carregamento é o
   * inverso da de entrega, e é isso que evita descarregar duas vezes no mesmo portão.
   */
  test('a última parada da rota fica no fundo', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })

    expect(layout?.slices.map((slice) => slice.label)).toEqual([
      'Barrinha',
      'Descalvado',
      'Campinas',
    ])
    expect(layout?.slices.map((slice) => slice.loadOrder)).toEqual([3, 2, 1])
  })

  /** A porta é da primeira entrega: quem sai primeiro tem de estar ao alcance. */
  test('a primeira parada da rota fica na porta', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })
    const naPorta = layout?.slices.find((slice) => slice.loadOrder === PARADAS.length)

    expect(naPorta?.label).toBe('Barrinha')
  })

  /** Uma parada só ocupa o baú inteiro que a carga dela ocupa — não o baú todo. */
  test('uma parada só continua proporcional, não vira 100%', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [{ documentsWithoutVolume: 0, label: 'Única', sequence: 1, volumeM3: '2.500000' }],
    })

    expect(layout?.slices[0]?.share).toBe('0.2500')
  })

  /**
   * ⚠️ Excedente vai **fora** do baú, nunca comprimido para caber: comprimir faria o desenho
   * afirmar que a carga cabe, que é a única coisa que ele não pode dizer errado.
   */
  test('o que passa da capacidade é dito fora do baú', () => {
    const layout = resolveCargoLayout({
      capacityM3: '3.000000',
      stops: [{ documentsWithoutVolume: 0, label: 'Cheia', sequence: 1, volumeM3: '4.500000' }],
    })

    expect(layout?.overflowM3).toBe('1.500000')
    expect(layout?.slices[0]?.share).toBe('1.0000')
  })

  test('sem excedente, o campo é zero e não nulo', () => {
    expect(resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })?.overflowM3).toBe('0.000000')
  })

  /** RF7: nota sem cubagem é dita, nunca vira fatia zero — fatia zero é invisível e some da conferência. */
  test('parada sem cubagem não vira fatia zero', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [
        { documentsWithoutVolume: 0, label: 'Com volume', sequence: 1, volumeM3: '2.000000' },
        { documentsWithoutVolume: 2, label: 'Sem volume', sequence: 2, volumeM3: null },
      ],
    })

    expect(layout?.slices.map((slice) => slice.label)).toEqual(['Com volume'])
    expect(layout?.stopsWithoutVolume).toEqual([{ documentCount: 2, label: 'Sem volume' }])
  })

  /**
   * ⚠️ **A 085 reverte metade da D3 da 076, de propósito.** A 076 recusava desenhar sem capacidade
   * porque a única saída era a fatia **sobre a capacidade** — sem denominador, o retângulo mentiria.
   * A 085 mediu que a divisão **entre paradas** é invariante ao fator de cubagem (`f` está no
   * numerador e no denominador e cancela), então ela não precisa de capacidade nenhuma.
   *
   * O que continua recusado é o que a D3 realmente protegia: **afirmar quanto sobra**. Sem
   * capacidade, `freeRows` é zero e `occupancyKnown` é falso — o desenho divide a carga e cala
   * sobre o espaço livre.
   */
  test('sem capacidade o baú divide a carga, mas não afirma espaço livre', () => {
    const layout = resolveCargoLayout({ capacityM3: null, stops: PARADAS })

    expect(layout).not.toBeNull()
    expect(layout?.occupancyKnown).toBe(false)
    expect(layout?.freeRows).toBe(0)
    expect(layout?.slices).toEqual([])
  })

  /** Viagem sem parada é baú vazio de verdade — não é ausência. */
  test('viagem sem parada devolve baú vazio', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: [] })

    expect(layout).toMatchObject({ overflowM3: '0.000000', slices: [] })
  })
})

/**
 * G003 (spec 144, D1): a precedência de quem dá a forma à caixa que o empacotador desenha —
 * **medida > resíduo da nota > mediana da empresa**. A medida nunca cede; entre as duas presumidas,
 * o resíduo é o número mais específico (veio da própria nota) e vence a mediana genérica.
 */
describe('a precedência D1 na caixa que o empacotador desenha', () => {
  test('caixa medida ignora tanto o resíduo quanto a mediana', () => {
    const stops: CargoLayoutStop[] = [
      {
        boxes: [{ ...MEASURED_BOX, count: 1, estimatedVolumeM3: 0.5, label: 'Medida' }],
        documentsWithoutVolume: 0,
        label: 'Única',
        sequence: 1,
        volumeM3: '0.036000',
      },
    ]
    const layout = resolveCargoLayout({
      bedDimensions: BED,
      ...CAPACIDADE,
      fallbackBoxVolumeM3: 0.036,
      measuredShapes: [MEASURED_BOX],
      stops,
    })
    const box = layout?.placement?.layers
      .flatMap((layer) => layer.boxes)
      .find((placed) => placed.label === 'Medida')

    expect(box?.source).toBe('measured')
    expect(box === undefined ? NaN : Math.abs(drawnVolumeM3(box) - 0.036)).toBeLessThanOrEqual(1e-3)
  })

  test('caixa sem ficha com volume da nota usa o resíduo, não a mediana', () => {
    const stops: CargoLayoutStop[] = [
      {
        boxes: [
          { ...UNMEASURED_BOX, count: 1, estimatedVolumeM3: 0.5, label: 'Presumida pela nota' },
        ],
        documentsWithoutVolume: 0,
        label: 'Única',
        sequence: 1,
        volumeM3: '0.500000',
      },
    ]
    const layout = resolveCargoLayout({
      bedDimensions: BED,
      ...CAPACIDADE,
      fallbackBoxVolumeM3: 0.036,
      measuredShapes: [MEASURED_BOX],
      stops,
    })
    const box = layout?.placement?.layers
      .flatMap((layer) => layer.boxes)
      .find((placed) => placed.label === 'Presumida pela nota')

    expect(box?.source).toBe('estimated')
    expect(box === undefined ? NaN : Math.abs(drawnVolumeM3(box) - 0.5)).toBeLessThanOrEqual(1e-3)
  })

  test('caixa sem ficha e sem volume da nota usa a mediana da empresa', () => {
    const stops: CargoLayoutStop[] = [
      {
        boxes: [{ ...UNMEASURED_BOX, count: 1, label: 'Presumida pela mediana' }],
        documentsWithoutVolume: 0,
        label: 'Única',
        sequence: 1,
        volumeM3: '0.036000',
      },
    ]
    const layout = resolveCargoLayout({
      bedDimensions: BED,
      ...CAPACIDADE,
      fallbackBoxVolumeM3: 0.036,
      measuredShapes: [MEASURED_BOX],
      stops,
    })
    const box = layout?.placement?.layers
      .flatMap((layer) => layer.boxes)
      .find((placed) => placed.label === 'Presumida pela mediana')

    expect(box?.source).toBe('estimated')
    expect(box === undefined ? NaN : Math.abs(drawnVolumeM3(box) - 0.036)).toBeLessThanOrEqual(1e-3)
  })
})
