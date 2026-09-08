/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import {
  rankRouteOptions,
  type RouteOptionInput,
} from '../../src/toll-booths/domain/route-option.policy.js'

/** Um toco: 3,5 km/l, diesel a R$ 6,20 — os números que a spec 096 usou para medir. */
const VEICULO = { kilometersPerLiter: '3.5000', pricePerLiter: '6.2000' } as const

/**
 * Ribeirão Preto → Campinas, medido em 2026-09-07 contra o OSRM local, com a tarifa por eixo × 2:
 * a rota 1 tem uma praça a menos e economiza R$ 15,40 de pedágio, custando 18,1 km a mais.
 */
const CAMPINAS: readonly RouteOptionInput[] = [
  { distanceMeters: 221_500, durationSeconds: 179 * 60, tollTotal: '108.6000' },
  { distanceMeters: 239_600, durationSeconds: 198 * 60, tollTotal: '93.2000' },
]

describe('route options (spec 096 T2)', () => {
  it('elege a mais rápida pelo tempo, e não pela distância', () => {
    const ranked = rankRouteOptions({ options: CAMPINAS, vehicle: VEICULO })

    expect(ranked.fastestIndex).toBe(0)
  })

  /**
   * ⚠️ **A armadilha desta feature, medida.** 18,1 km a mais num toco a 3,5 km/l com diesel a
   * R$ 6,20 são ~R$ 32 de combustível, contra R$ 15,40 de pedágio economizado: a rota com **menos
   * praça** é a **mais cara**. Chamá-la de "mais barata" seria mentira produzida por nós, num
   * rótulo que o operador acredita e usa para decidir carga.
   */
  it('não chama de mais barata a rota que tem menos pedágio e custa mais no total', () => {
    const ranked = rankRouteOptions({ options: CAMPINAS, vehicle: VEICULO })

    expect(ranked.options[1]?.tollTotal).toBe('93.2000')
    expect(ranked.cheapestIndex).toBe(0)
  })

  it('soma pedágio e combustível, e publica o total de cada opção', () => {
    const ranked = rankRouteOptions({ options: CAMPINAS, vehicle: VEICULO })
    const [primeira, segunda] = ranked.options

    /**
     * ⚠️ Os centavos saem do `fuelCost` já usado por toda a valoração, que arredonda os litros
     * antes de multiplicar pelo preço — daí o `392.3713` contra os `392.3714` da conta direta. O
     * teste afirma o número **do produto**, não o da minha calculadora.
     */
    expect(primeira?.fuelTotal).toBe('392.3713')
    expect(primeira?.totalCost).toBe('500.9713')
    expect(segunda?.fuelTotal).toBe('424.4340')
    expect(segunda?.totalCost).toBe('517.6340')
  })

  it('elege a mais barata quando ela existe de verdade', () => {
    const ranked = rankRouteOptions({
      options: [
        { distanceMeters: 100_000, durationSeconds: 3_600, tollTotal: '80.0000' },
        { distanceMeters: 102_000, durationSeconds: 3_900, tollTotal: '20.0000' },
      ],
      vehicle: VEICULO,
    })

    expect(ranked.fastestIndex).toBe(0)
    expect(ranked.cheapestIndex).toBe(1)
  })

  /**
   * ⚠️ Sem consumo ou sem preço não há comparação de custo — e **estimar o consumo para preencher o
   * rótulo seria inventar o número que decide a escolha**. A tela oferece só a mais rápida.
   */
  it('não elege mais barata nenhuma quando o veículo não declara consumo', () => {
    const ranked = rankRouteOptions({
      options: CAMPINAS,
      vehicle: { kilometersPerLiter: null, pricePerLiter: '6.2000' },
    })

    expect(ranked.fastestIndex).toBe(0)
    expect(ranked.cheapestIndex).toBeNull()
    expect(ranked.options[0]?.totalCost).toBeNull()
    expect(ranked.costGap).toBe('NO_FUEL_BASELINE')
  })

  /** Pedágio desconhecido também não vira zero: sem ele o total não existe. */
  it('não compara custo quando alguma opção não sabe o próprio pedágio', () => {
    const ranked = rankRouteOptions({
      options: [
        { distanceMeters: 100_000, durationSeconds: 3_600, tollTotal: '80.0000' },
        { distanceMeters: 102_000, durationSeconds: 3_900, tollTotal: null },
      ],
      vehicle: VEICULO,
    })

    expect(ranked.cheapestIndex).toBeNull()
    expect(ranked.costGap).toBe('TOLL_UNKNOWN')
  })

  /** Uma opção só não é escolha: quem consome usa isto para não desenhar seletor nenhum. */
  it('diz que não há escolha quando o roteirizador devolveu um caminho só', () => {
    const ranked = rankRouteOptions({
      options: [{ distanceMeters: 100_000, durationSeconds: 3_600, tollTotal: '10.0000' }],
      vehicle: VEICULO,
    })

    expect(ranked.hasChoice).toBe(false)
    expect(ranked.fastestIndex).toBe(0)
  })
})
