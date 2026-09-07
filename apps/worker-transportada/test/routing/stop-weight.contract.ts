/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveStopWeight } from '../../src/routing/domain/stop-weight.policy.js'

const FALLBACK = '250.0000'

describe('o peso da parada sai da nota (spec 067 no roteirizador)', () => {
  /**
   * O emitente declara `pesoB` por volume, e a soma dele é massa **medida**. Era ela que o solver
   * jogava fora para usar a média da empresa em toda parada.
   */
  test('a soma do pesoB vence a média da empresa', () => {
    expect(
      resolveStopWeight({
        defaultWeightPerVolume: null,
        documents: [
          { grossWeight: '37.6620', quantity: '8' },
          { grossWeight: '107.8440', quantity: '17' },
        ],
        fallbackWeightKilograms: FALLBACK,
      }),
    ).toEqual({ estimated: false, weightKilograms: 145.506 })
  })

  /** Sem massa declarada, a estimativa por volume da 067 — a mesma que a listagem imprime. */
  test('sem pesoB, a estimativa é por volume', () => {
    expect(
      resolveStopWeight({
        defaultWeightPerVolume: '12.5000',
        documents: [{ grossWeight: '0', quantity: '20' }],
        fallbackWeightKilograms: FALLBACK,
      }),
    ).toEqual({ estimated: true, weightKilograms: 250 })
  })

  /**
   * Estimativa desligada é o padrão (`company_cargo_settings` vazia). Aí a nota sem massa cai no
   * peso de parada — que é o que o solver já usava, e continua marcado.
   */
  test('sem estimativa, a nota sem massa cai no peso de parada', () => {
    expect(
      resolveStopWeight({
        defaultWeightPerVolume: null,
        documents: [{ grossWeight: '0', quantity: '0' }],
        fallbackWeightKilograms: FALLBACK,
      }),
    ).toEqual({ estimated: true, weightKilograms: 250 })
  })

  /**
   * ⚠️ O fallback entra **por nota sem medida**, não por parada: ignorar a nota faria o solver
   * mandar carga a mais para um caminhão que ele acredita vazio, e é a sobrecarga que estoura no
   * pátio. Uma parada com uma nota só é idêntica ao comportamento anterior.
   */
  test('parada mista soma o medido e completa o que falta', () => {
    expect(
      resolveStopWeight({
        defaultWeightPerVolume: null,
        documents: [
          { grossWeight: '108.6700', quantity: '11' },
          { grossWeight: '0.0000', quantity: '20' },
        ],
        fallbackWeightKilograms: FALLBACK,
      }),
    ).toEqual({ estimated: true, weightKilograms: 358.67 })
  })

  /** Uma nota medida entre outras não torna a parada medida — a marca é do pior caso. */
  test('a marca de estimativa é do pior caso da parada', () => {
    const resolved = resolveStopWeight({
      defaultWeightPerVolume: '10.0000',
      documents: [
        { grossWeight: '50.0000', quantity: '5' },
        { grossWeight: '0', quantity: '3' },
      ],
      fallbackWeightKilograms: FALLBACK,
    })
    expect(resolved.estimated).toBe(true)
    expect(resolved.weightKilograms).toBe(80)
  })

  /** Parada sem nota nenhuma (a viagem que ainda não vinculou) continua no peso de parada. */
  test('parada sem nota fica no peso de parada, marcada', () => {
    expect(
      resolveStopWeight({
        defaultWeightPerVolume: null,
        documents: [],
        fallbackWeightKilograms: FALLBACK,
      }),
    ).toEqual({ estimated: true, weightKilograms: 250 })
  })

  /** Empresa sem configuração de roteirização: o fallback é zero, e zero não vira marca de nada. */
  test('sem peso de parada configurado, a nota medida ainda manda', () => {
    expect(
      resolveStopWeight({
        defaultWeightPerVolume: null,
        documents: [{ grossWeight: '30.0000', quantity: '3' }],
        fallbackWeightKilograms: '0.00',
      }),
    ).toEqual({ estimated: false, weightKilograms: 30 })
  })
})
