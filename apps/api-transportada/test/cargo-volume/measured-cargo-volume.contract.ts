/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  medianBoxVolumeM3,
  resolveMeasuredCargoVolume,
} from '../../src/nfe-documents/domain/cargo-volume.policy.js'

/** 400 × 300 × 200 mm = 0,024 m³. */
const CAIXA = '0.024000'

describe('a cubagem que sai da caixa medida (spec 085 G006)', () => {
  test('soma quantidade × caixa medida e diz que foi medida', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: null,
        items: [
          { boxVolumeM3: CAIXA, quantity: '10', unitsPerBox: 1 },
          { boxVolumeM3: '0.010000', quantity: '5', unitsPerBox: 1 },
        ],
      }),
    ).toEqual({ source: 'measured', volumeM3: '0.290000' })
  })

  /**
   * ⚠️ A reserva é a **mediana das caixas já medidas da empresa**, e a origem vira `partial`: o
   * número continua útil para carregar, e quem o lê precisa saber que parte dele é palpite — é a
   * mesma regra do peso (ADR-0052) e da capacidade do veículo.
   */
  test('item sem medida usa a mediana da empresa e a origem vira parcial', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: '0.020000',
        items: [
          { boxVolumeM3: CAIXA, quantity: '10', unitsPerBox: 1 },
          { boxVolumeM3: null, quantity: '10', unitsPerBox: 1 },
        ],
      }),
    ).toEqual({ source: 'partial', volumeM3: '0.440000' })
  })

  /**
   * ⚠️ Sem reserva, o item sem medida sairia da soma e o total **subestimaria** a carga. Ocupação
   * menor do que a real é o número que faz alguém continuar carregando um baú que já encheu.
   */
  test('item sem medida e sem reserva não vira soma parcial', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: null,
        items: [
          { boxVolumeM3: CAIXA, quantity: '10', unitsPerBox: 1 },
          { boxVolumeM3: null, quantity: '10', unitsPerBox: 1 },
        ],
      }),
    ).toBeNull()
  })

  /** Nada medido é ausência: quem responde é a estimativa por espécie da spec 075. */
  test('nota sem nenhuma caixa medida devolve ausência', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: '0.020000',
        items: [{ boxVolumeM3: null, quantity: '10', unitsPerBox: 1 }],
      }),
    ).toBeNull()
    expect(resolveMeasuredCargoVolume({ fallbackBoxVolumeM3: null, items: [] })).toBeNull()
  })

  test('quantidade zerada não inventa volume', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: null,
        items: [{ boxVolumeM3: CAIXA, quantity: '0', unitsPerBox: 1 }],
      }),
    ).toBeNull()
  })
})

describe('a mediana das caixas medidas da empresa', () => {
  /** Mediana, não média: uma caixa de geladeira no meio de mil caixas de refrigerante. */
  test('lista ímpar devolve o do meio', () => {
    expect(medianBoxVolumeM3(['0.010000', '0.100000', '0.020000'])).toBe('0.020000')
  })

  test('lista par devolve a média dos dois centrais', () => {
    expect(medianBoxVolumeM3(['0.010000', '0.020000', '0.030000', '0.050000'])).toBe('0.025000')
  })

  test('sem medida nenhuma não há mediana', () => {
    expect(medianBoxVolumeM3([])).toBeNull()
  })
})

/**
 * ⚠️ **`uCom` nem sempre é caixa.** A linha em `CX24` já vem contada em caixas, mas a linha em `UN`
 * vem contada em unidades — e multiplicar 480 `UN` pela caixa master dava 14,4 m³ para uma carga de
 * 1,2 m³. Pior: como `measured` vence `estimated`, esse número saía da tela **sem marca de palpite**,
 * e ocupação superestimada faz alguém parar de carregar um baú que ainda cabe.
 */
describe('quantas unidades cabem na caixa', () => {
  const CAIXA = '0.030000'

  test('a linha em unidades é dividida pelo que cabe na caixa', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: null,
        items: [{ boxVolumeM3: CAIXA, quantity: '480', unitsPerBox: 12 }],
      }),
    ).toEqual({ source: 'measured', volumeM3: '1.200000' })
  })

  /** Caixa contada em caixas é `1`, e a conta continua sendo a de antes. */
  test('uma unidade por caixa deixa a conta como estava', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: null,
        items: [{ boxVolumeM3: CAIXA, quantity: '10', unitsPerBox: 1 }],
      })?.volumeM3,
    ).toBe('0.300000')
  })

  /** Sobra ocupa caixa inteira: cinco unidades de um produto de doze ainda viajam numa caixa. */
  test('a sobra ocupa uma caixa inteira', () => {
    expect(
      resolveMeasuredCargoVolume({
        fallbackBoxVolumeM3: null,
        items: [{ boxVolumeM3: CAIXA, quantity: '5', unitsPerBox: 12 }],
      })?.volumeM3,
    ).toBe('0.030000')
  })
})
