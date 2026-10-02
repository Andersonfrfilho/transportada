/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225 D5: `legs[i]` chega a `stops[i]`. A rota congelada traz o trecho de saída do barracão e o
 * de retorno misturados aos trechos entre paradas — a política separa, e estes testes prendem a
 * suposição que a spec chama de "a parte frágil".
 */
import { describe, expect, test } from 'bun:test'

import { readApportionmentLegs } from '../../src/trips/domain/apportionment-route-legs.policy.js'

const LEGS = [
  { distanceMetres: 1_000, durationSeconds: 100 },
  { distanceMetres: 2_000, durationSeconds: 200 },
  { distanceMetres: 3_000, durationSeconds: 300 },
]

function route(input: { readonly depot?: unknown; readonly legs?: unknown }) {
  return {
    choiceReproduced: true,
    criterion: 'cheapest',
    isNoToll: false,
    legs: LEGS,
    points: [],
    signature: null,
    ...input,
  }
}

describe('os trechos da rota congelada chegam às paradas (spec 225 D5)', () => {
  test('com barracão de ida e volta: o primeiro trecho é a saída, o último é o retorno e fica de fora', () => {
    const legs = readApportionmentLegs(route({ depot: { leadingLegs: 1, trailingLegs: 1 } }))

    expect(legs).toEqual(LEGS.slice(0, 2))
  })

  test('com barracão e sem retorno: todos os trechos chegam a uma parada', () => {
    expect(readApportionmentLegs(route({ depot: { leadingLegs: 1, trailingLegs: 0 } }))).toEqual(
      LEGS,
    )
  })

  test('sem barracão a primeira parada é o ponto de partida: ela ganha um trecho vazio', () => {
    const legs = readApportionmentLegs(route({ depot: null }))

    expect(legs).toEqual([{ distanceMetres: 0, durationSeconds: 0 }, ...LEGS])
  })

  test('rota congelada antes de existir o barracão (campo ausente) lê como sem barracão', () => {
    expect(readApportionmentLegs(route({}))).toHaveLength(LEGS.length + 1)
  })

  test('forma inesperada, sem trecho ou contagem de barracão maior que a de trechos: ausência', () => {
    expect(readApportionmentLegs(null)).toEqual([])
    expect(readApportionmentLegs({})).toEqual([])
    expect(readApportionmentLegs(route({ legs: [] }))).toEqual([])
    expect(readApportionmentLegs(route({ depot: { leadingLegs: 3, trailingLegs: 1 } }))).toEqual([])
  })
})
