/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoLayout } from '../../src/trips/domain/cargo-layout.policy.js'
import {
  countBoxesToMeasure,
  resolveCargoPlanLayers,
} from '../../src/trips/domain/cargo-plan.policy.js'

/** Baú de truck medido com fita: 8,900 × 2,500 × 2,400. */
const BAU = { heightM: '2.400', lengthM: '8.900', source: 'measured' as const, widthM: '2.500' }
/** Caixa de 50 × 40 × 30 cm: pegada de 0,20 m², e sete delas empilham nos 2,4 m de altura. */
const CAIXA = { count: 40, heightMm: 300, lengthMm: 500, widthMm: 400 }

describe('camadas a partir da caixa medida (spec 088 D5)', () => {
  /**
   * Faixa de 2 m nos 2,5 m de largura são 5 m²; a caixa ocupa 0,20 m², então cabem 25 por camada.
   * Os 2,4 m de altura sobre 0,30 m dariam 8 camadas, mas 40 caixas em 25 por camada ocupam 2 — e
   * o par nunca descreve mais caixa do que a parada tem.
   */
  test('a área da faixa dá as caixas por camada, e a altura do baú dá as camadas', () => {
    expect(resolveCargoPlanLayers({ bandDepthM: '2.000', bed: BAU, boxes: [CAIXA] })).toEqual({
      boxCount: 40,
      boxesPerLayer: 25,
      layers: 2,
    })
  })

  /** Com carga que enche o baú, quem limita é a altura: 2,4 m sobre 0,30 m são 8 camadas. */
  test('a altura do baú é o teto quando a carga daria para empilhar mais', () => {
    const layers = resolveCargoPlanLayers({
      bandDepthM: '2.000',
      bed: BAU,
      boxes: [{ ...CAIXA, count: 1000 }],
    })

    expect(layers).toEqual({ boxCount: 1000, boxesPerLayer: 25, layers: 8 })
  })

  /**
   * ⚠️ O coração da D5: uma medida faltando e a conta inteira não acontece. "25 caixas por camada"
   * é lido como instrução, e uma instrução com um palpite dentro é pior que nenhuma.
   */
  test('uma caixa sem medida na parada apaga a contagem inteira', () => {
    const layers = resolveCargoPlanLayers({
      bandDepthM: '2.000',
      bed: BAU,
      boxes: [CAIXA, { count: 3, heightMm: null, lengthMm: null, widthMm: null }],
    })

    expect(layers).toBeNull()
  })

  /** Sem a medida do baú não há área de faixa: é a mesma ausência que apaga a planta inteira. */
  test('sem o baú medido não há camada nenhuma', () => {
    expect(resolveCargoPlanLayers({ bandDepthM: '2.000', bed: null, boxes: [CAIXA] })).toBeNull()
    expect(resolveCargoPlanLayers({ bandDepthM: null, bed: BAU, boxes: [CAIXA] })).toBeNull()
  })

  /** Parada sem caixa nenhuma não vira zero camada: vira ausência, como toda medida que falta. */
  test('parada sem caixa devolve ausência', () => {
    expect(resolveCargoPlanLayers({ bandDepthM: '2.000', bed: BAU, boxes: [] })).toBeNull()
    expect(
      resolveCargoPlanLayers({ bandDepthM: '2.000', bed: BAU, boxes: [{ ...CAIXA, count: 0 }] }),
    ).toBeNull()
  })

  /**
   * ⚠️ Caixas diferentes na mesma parada saem pela MAIOR pegada e pela MAIS ALTA: subestimar faz
   * alguém parar de carregar cedo, e superestimar faz a carga invadir a faixa da parada seguinte.
   */
  test('caixas diferentes na mesma parada saem pela maior pegada e pela mais alta', () => {
    const layers = resolveCargoPlanLayers({
      bandDepthM: '2.000',
      bed: BAU,
      boxes: [
        { count: 100, heightMm: 300, lengthMm: 500, widthMm: 400 },
        { count: 100, heightMm: 600, lengthMm: 1000, widthMm: 500 },
      ],
    })

    /** 5 m² ÷ 0,50 m² = 10 por camada, e 2,4 m ÷ 0,60 m = 4 camadas. */
    expect(layers).toEqual({ boxCount: 200, boxesPerLayer: 10, layers: 4 })
  })

  /** Caixa maior que a própria faixa não cabe nenhuma vez: ausência, nunca zero por camada. */
  test('caixa maior que a faixa devolve ausência em vez de zero por camada', () => {
    const layers = resolveCargoPlanLayers({
      bandDepthM: '0.300',
      bed: BAU,
      boxes: [{ count: 2, heightMm: 300, lengthMm: 2000, widthMm: 2000 }],
    })

    expect(layers).toBeNull()
  })
})

/**
 * Spec 088 R4: a camada só existe dentro da faixa, e a faixa só existe com o baú medido. Aqui se
 * confere a junção — é ela que decide o que o conferente lê ao lado da parada.
 */
describe('a camada chega à faixa da parada (spec 088 R4)', () => {
  const PARADAS = [
    {
      boxes: [CAIXA],
      documentsWithoutVolume: 0,
      label: 'Barrinha',
      sequence: 1,
      volumeM3: '12.000000',
    },
    {
      boxes: [{ ...CAIXA, heightMm: null, lengthMm: null, widthMm: null }],
      documentsWithoutVolume: 0,
      label: 'Campinas',
      sequence: 2,
      volumeM3: '12.000000',
    },
  ]

  test('a parada com todas as caixas medidas conta camadas, e a vizinha sem medida não', () => {
    const layout = resolveCargoLayout({
      bedDimensions: BAU,
      capacityM3: '53.400000',
      stops: PARADAS,
    })

    expect(layout?.slices.map((slice) => slice.layers)).toEqual([
      { boxCount: 40, boxesPerLayer: 25, layers: 2 },
      null,
    ])
  })

  /**
   * ⚠️ `layers` nulo tem **duas** causas, e a tela precisa distinguir: caixa por medir, e caixa
   * maior que a própria faixa. Sem `boxesToMeasure` ela mandava medir uma parada 100% medida, e o
   * conferente ia à fila da 085 e não achava nada.
   */
  test('separa a caixa por medir da caixa que não cabe na faixa', () => {
    const layout = resolveCargoLayout({
      bedDimensions: BAU,
      capacityM3: '53.400000',
      stops: PARADAS,
    })

    expect(layout?.slices.map((slice) => slice.boxesToMeasure)).toEqual([0, 40])

    const gorda = resolveCargoLayout({
      bedDimensions: BAU,
      capacityM3: '53.400000',
      stops: [
        {
          boxes: [{ count: 2, heightMm: 300, lengthMm: 2000, widthMm: 2000 }],
          documentsWithoutVolume: 0,
          label: 'Barrinha',
          sequence: 1,
          volumeM3: '1.000000',
        },
      ],
    })

    /** Medida completa, e mesmo assim sem camada: a caixa é maior que a faixa que ela recebeu. */
    expect(gorda?.slices[0]?.layers).toBeNull()
    expect(gorda?.slices[0]?.boxesToMeasure).toBe(0)
  })

  /** A contagem é de CAIXAS, não de linhas: é o que o conferente vai procurar na fila. */
  test('conta as caixas por medir, não as linhas da nota', () => {
    expect(
      countBoxesToMeasure([
        { count: 7, heightMm: null, lengthMm: null, widthMm: null },
        { count: 5, heightMm: null, lengthMm: null, widthMm: null },
        CAIXA,
      ]),
    ).toBe(12)
    expect(countBoxesToMeasure([CAIXA])).toBe(0)
  })

  /** Sem o baú medido não há faixa, e sem faixa não há camada — nem para quem mediu tudo. */
  test('sem o baú medido a parada medida também fica sem camada', () => {
    const layout = resolveCargoLayout({
      bedDimensions: null,
      capacityM3: '53.400000',
      stops: PARADAS,
    })

    expect(layout?.slices.map((slice) => slice.layers)).toEqual([null, null])
  })
})
