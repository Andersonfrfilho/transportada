/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 093 T3: o seletor de rota alternativa na montagem, abaixo do bloco de pedágio da T7. No
 * molde de `test/trip/assembly-toll.contract.ts` — contrato de tela, por texto de fonte.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)

describe('seletor de rota alternativa (spec 093 T3)', () => {
  const source = readFileSync(COMPONENT, 'utf8')

  /** Rota única não é escolha (D2) — o seletor só é montado quando `hasChoice` é `true`. */
  it('só monta o seletor quando há mais de uma rota', () => {
    expect(source).toInclude('hasChoice')
    const bloco = source.slice(source.indexOf('routeOptions'))
    expect(bloco).toInclude('hasChoice')
  })

  it('está montado abaixo do bloco de pedágio', () => {
    const tollIndex = source.indexOf('assemblyToll')
    const optionsIndex = source.indexOf('routeOptions')

    expect(tollIndex).toBeGreaterThan(-1)
    expect(optionsIndex).toBeGreaterThan(tollIndex)
  })

  /** Sem `totalCost`, nenhum rótulo de mais barata — a razão (`costGap`) é o que a tela imprime. */
  it('imprime a razão da ausência de rota mais barata, nunca um rótulo inventado', () => {
    expect(source).toInclude('costGap')
    expect(source).toInclude('routeOptions.gap')
  })

  /** A opção escolhida redesenha o traço — nunca a rota principal sozinha. */
  it('a rota escolhida alimenta o mapa e o pedágio exibido, não só a principal', () => {
    expect(source).toInclude('selectedOptionIndex')
    expect(source).toInclude('activeOption')
  })

  it('reseta a escolha quando a resposta da geometria muda', () => {
    expect(source).toInclude('setSelectedOptionIndex(0)')
  })
})
