/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 096 T3: o seletor de rota alternativa na montagem, abaixo do bloco de pedágio da T7. No
 * molde de `test/trip/assembly-toll.contract.ts` — contrato de tela, por texto de fonte.
 *
 * Spec 153 T402 extraiu o seletor para `RouteChoiceOptions.component.tsx` (RF13) — os testes
 * abaixo migraram junto para continuar lendo a fonte onde cada regra hoje mora.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const COMPONENT = new URL(
  '../../src/modules/trip/components/TripAssemblyMap.component.tsx',
  import.meta.url,
)
const ROUTE_CHOICE_OPTIONS_COMPONENT = new URL(
  '../../src/modules/trip/components/RouteChoiceOptions.component.tsx',
  import.meta.url,
)

describe('seletor de rota alternativa (spec 096 T3)', () => {
  const source = readFileSync(COMPONENT, 'utf8')
  const routeChoiceOptionsSource = readFileSync(ROUTE_CHOICE_OPTIONS_COMPONENT, 'utf8')

  /** Rota única não é escolha (D2) — a lista só é montada quando há mais de uma opção. */
  it('só monta o seletor quando há mais de uma rota', () => {
    expect(routeChoiceOptionsSource).toInclude('if (options.length === 0) return null')
    expect(routeChoiceOptionsSource).toInclude('options.length <= 1 ? null')
  })

  it('está montado abaixo do bloco de pedágio', () => {
    const tollIndex = source.indexOf('<RouteTollSummary')
    const optionsIndex = source.indexOf('<RouteChoiceOptions')

    expect(tollIndex).toBeGreaterThan(-1)
    expect(optionsIndex).toBeGreaterThan(tollIndex)
  })

  /** Sem `totalCost`, nenhum rótulo de mais barata — a razão (`costGap`) é o que a tela imprime. */
  it('imprime a razão da ausência de rota mais barata, nunca um rótulo inventado', () => {
    expect(source).toInclude('costGap')
    expect(routeChoiceOptionsSource).toInclude('routeOptions.gap')
  })

  /** A opção escolhida redesenha o traço — nunca a rota principal sozinha. */
  it('a rota escolhida alimenta o mapa e o pedágio exibido, não só a principal', () => {
    expect(source).toInclude('selectedOptionIndex')
    expect(source).toInclude('activeOption')
  })

  /** Spec 153 D1: abre sempre na mais barata que a API indicou — nunca fixo no índice 0. */
  it('abre a escolha na rota que a API indicou, não sempre a primeira', () => {
    expect(source).toInclude('geometryQuery.data?.selectedIndex')
    expect(source).not.toInclude('setSelectedOptionIndex(0)')
  })
})
