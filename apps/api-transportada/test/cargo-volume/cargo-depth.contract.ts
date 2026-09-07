/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveBedDimensions,
  resolveCargoLayout,
} from '../../src/trips/domain/cargo-layout.policy.js'

/** Baú de truck medido com fita: 8,900 × 2,500 × 2,400 = 53,400 m³. */
const BAU = { heightM: '2.400', lengthM: '8.900', widthM: '2.500' }
/** Uma faixa de 1 m de profundidade neste baú são 2,5 × 2,4 = 6,000 m³. */
const CAPACIDADE = { bedDimensions: BAU, capacityM3: '53.400000' }

/** Três paradas na ordem de entrega: a primeira é a que sai primeiro, e fica na porta. */
const PARADAS = [
  { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '6.000000' },
  { documentsWithoutVolume: 0, label: 'Descalvado', sequence: 2, volumeM3: '12.000000' },
  { documentsWithoutVolume: 0, label: 'Campinas', sequence: 3, volumeM3: '18.000000' },
]

function slicesOf(input: Parameters<typeof resolveCargoLayout>[0]) {
  const layout = resolveCargoLayout(input)

  return (layout?.slices ?? []).map((slice) => ({
    depthM: slice.depthM,
    distanceFromDoorM: slice.distanceFromDoorM,
    label: slice.label,
    loadOrder: slice.loadOrder,
  }))
}

/**
 * Spec 088 G002: a fileira da 085 é proporção, e proporção não tem metro. Aqui ela ganha o metro
 * que a fita do conferente confere — e só quando a ficha do veículo tem as três medidas.
 */
describe('profundidade da faixa no baú (spec 088)', () => {
  /**
   * A profundidade não passa pela capacidade: é `volume ÷ (largura × altura)`, a fatia transversal
   * de verdade. Com o baú medido as duas contas coincidem, mas a capacidade pode ser um m³ que
   * alguém digitou — e aí a faixa herdaria um denominador que não é este baú.
   */
  test('a profundidade é o volume dividido pela seção do baú', () => {
    expect(slicesOf({ ...CAPACIDADE, stops: PARADAS }).map((slice) => slice.depthM)).toEqual([
      '1.000',
      '2.000',
      '3.000',
    ])
  })

  /**
   * ⚠️ Critério 4: do fundo para a porta, a ordem é a inversa da entrega. Campinas entrega por
   * último, então encosta na parede do fundo; Barrinha entrega primeiro e fica na porta.
   */
  test('a distância da porta cresce do fundo para a porta, na ordem inversa da entrega', () => {
    const slices = slicesOf({ ...CAPACIDADE, stops: PARADAS })

    /** Carga de 6 m nos 8,9 m do baú: sobram 2,900 m livres, e eles ficam junto da porta. */
    expect(slices).toEqual([
      { depthM: '1.000', distanceFromDoorM: '2.900', label: 'Barrinha', loadOrder: 3 },
      { depthM: '2.000', distanceFromDoorM: '3.900', label: 'Descalvado', loadOrder: 2 },
      { depthM: '3.000', distanceFromDoorM: '5.900', label: 'Campinas', loadOrder: 1 },
    ])
  })

  /** Critério 3: a soma das profundidades é o comprimento do baú menos o espaço livre. */
  test('as profundidades somadas com o espaço livre dão o comprimento do baú', () => {
    const layout = resolveCargoLayout({ ...CAPACIDADE, stops: PARADAS })

    expect(layout?.bedLengthM).toBe('8.900')
    expect(layout?.bedWidthM).toBe('2.500')
    expect(layout?.freeDepthM).toBe('2.900')
    expect(layout?.overflowDepthM).toBe('0.000')
  })

  /**
   * ⚠️ Critério 6: o que não cabe sai **fora** da porta, e a distância dele é negativa de
   * propósito. Encolher tudo para caber esconderia o estouro, que é a informação.
   */
  test('a carga que não cabe atravessa a porta e o metro excedente é dito', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [
        { documentsWithoutVolume: 0, label: 'Barrinha', sequence: 1, volumeM3: '12.000000' },
        { documentsWithoutVolume: 0, label: 'Campinas', sequence: 2, volumeM3: '48.000000' },
      ],
    })

    expect(layout?.overflowDepthM).toBe('1.100')
    expect(layout?.freeDepthM).toBe('0.000')
    expect(layout?.slices.map((slice) => slice.distanceFromDoorM)).toEqual(['-1.100', '0.900'])
  })

  /**
   * ⚠️ A ausência é o caso normal: 8 de 8 veículos estão sem medida. Ela não pode derrubar as
   * fileiras proporcionais da 085 — elas continuam inteiras, e só o metro some.
   */
  test('sem a medida do baú a faixa não promete metro, e a fileira da 085 continua', () => {
    const layout = resolveCargoLayout({
      bedDimensions: null,
      capacityM3: '53.400000',
      stops: PARADAS,
    })

    expect(layout?.bedLengthM).toBeNull()
    expect(layout?.bedWidthM).toBeNull()
    expect(layout?.freeDepthM).toBeNull()
    expect(layout?.overflowDepthM).toBeNull()
    expect(layout?.slices.map((slice) => slice.depthM)).toEqual([null, null, null])
    expect(layout?.slices.map((slice) => slice.distanceFromDoorM)).toEqual([null, null, null])
    expect(layout?.rows.length).toBeGreaterThan(0)
    expect(layout?.slices.map((slice) => slice.share)).toEqual(['0.1124', '0.2247', '0.3371'])
  })

  /** Uma parada só ocupa a profundidade da carga dela, nunca o baú inteiro. */
  test('uma parada só não vira o baú inteiro', () => {
    const layout = resolveCargoLayout({
      ...CAPACIDADE,
      stops: [{ documentsWithoutVolume: 0, label: 'Única', sequence: 1, volumeM3: '6.000000' }],
    })

    expect(layout?.slices[0]?.depthM).toBe('1.000')
    expect(layout?.slices[0]?.distanceFromDoorM).toBe('7.900')
  })

  /**
   * ⚠️ D2: a escala sai da FICHA, e a referência de mercado não desenha planta nenhuma. Ela erra
   * por 2× dentro do mesmo tipo — um VUC existe de 13 e de 26 m³ —, e aqui o erro deixaria de ser
   * uma porcentagem e viraria metro na tela de quem vai medir com fita.
   */
  test('a referência de mercado alimenta a ocupação e nunca a planta', () => {
    const daFicha = { capacityDimensions: BAU, capacitySource: 'measured' } as const
    const daReferencia = { capacityDimensions: BAU, capacitySource: 'reference' } as const
    const digitado = { capacityDimensions: null, capacitySource: 'declared' } as const

    expect(resolveBedDimensions(daFicha)).toEqual(BAU)
    expect(resolveBedDimensions(daReferencia)).toBeNull()
    expect(resolveBedDimensions(digitado)).toBeNull()
    expect(resolveBedDimensions(null)).toBeNull()
  })
})
