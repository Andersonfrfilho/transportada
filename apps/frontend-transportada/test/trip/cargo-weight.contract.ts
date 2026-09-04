/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import trip from '../../src/modules/trip/locales/trip.locale.json'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripCargoPanel.component.tsx',
  import.meta.url,
)

/**
 * Spec 079 T002. O gêmeo do contrato de ocupação, e existe pelo mesmo motivo: a política sabe que o
 * peso é estimado, e a tela pode imprimir o número sem dizer. O `CLAUDE.md` já registrava a dívida
 * — "quem expuser peso em qualquer superfície leva a origem junto" — e até aqui nenhuma tela
 * mostrava peso, então a regra nunca tinha sido posta à prova.
 */
describe('peso da carga na tela (spec 079 T002)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  it('imprime a marca de estimativa quando a origem é estimada', () => {
    expect(source).toInclude("cargoWeight.source === 'estimated'")
    expect(source).toInclude("t('cargoWeight.estimated')")
  })

  /**
   * A mesma armadilha da ocupação: um `&&` a mais e a marca some sem ninguém notar.
   *
   * ⚠️ A âncora é `isWeightEstimated` cru, **nunca** `isWeightEstimated ?`. Com o `?` na busca, o
   * `&&` que este teste existe para pegar faz o `indexOf` devolver -1, o trecho sai vazio e a
   * afirmação passa — foi o que aconteceu na primeira escrita, e a mutação revelou.
   */
  it('não esconde a marca atrás de segunda condição', () => {
    const inicio = source.indexOf('isWeightEstimated')
    expect(inicio).toBeGreaterThan(-1)

    const trecho = source.slice(inicio, source.indexOf('cargoWeight.estimated', inicio))

    expect(trecho).not.toInclude('&&')
  })

  /** Nota sem peso é dita, nunca somada como zero — zero diria que a carga não pesa nada. */
  it('diz quantas notas ficaram fora da conta', () => {
    expect(source).toInclude('cargoWeight.documentsWithoutWeight')
    expect(trip.cargoWeight.withoutWeight).toInclude('não entrou na conta')
  })

  /** O rótulo diz por que o peso é estimado, não só que é. */
  it('explica a origem da estimativa no texto', () => {
    expect(trip.cargoWeight.estimated).toInclude('não declarou o peso')
    expect(trip.cargoWeight.estimated).toInclude('volume')
  })

  /**
   * ⚠️ Sem percentual. A ficha do veículo não guarda capacidade em massa, e um teto inventado para
   * produzir porcentagem é exatamente o número que faria alguém parar de carregar, ou continuar.
   */
  it('não anuncia percentual de peso', () => {
    expect(trip.cargoWeight).not.toHaveProperty('ratio')
    expect(source).not.toInclude('weightPercent')
  })
})
