/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createTripResponseAdapters } from '../../src/modules/trip/shared/tripResponse.validation'
import {
  TRIP_DETAIL_KEYS,
  TRIP_DETAIL_OPTIONAL_KEYS,
} from '../../src/modules/trip/shared/trip.constant'
import { TRIP_DETAIL } from './trip.fixture'

const adapters = createTripResponseAdapters()

function aceita(data: unknown): boolean {
  try {
    adapters.tripDetailFromApi(data)
    return true
  } catch {
    return false
  }
}

/**
 * Spec 078 D2: a atomicidade cobre "API à frente do bundle". Ela **não** cobre o inverso — bundle
 * novo com API antiga tem o campo **ausente**, e ausente reprova, corretamente: é contrato quebrado.
 *
 * A saída não é afrouxar a guarda (ver D1: a rigidez dela é defesa contra vazamento). É disciplina
 * de escrita: **campo recém-acrescentado nasce opcional no cliente** até a API que o serve estar
 * garantidamente no ar. Depois disso ele pode virar obrigatório, numa mudança própria.
 */
describe('campo novo nasce opcional (spec 078 D2)', () => {
  /** `occupancy` é o caso concreto: entrou na 075, e o rollback da API o faria sumir do corpo. */
  it('aceita o detalhe sem o campo novo, como uma API anterior o serviria', () => {
    const anterior: Record<string, unknown> = { ...TRIP_DETAIL }
    Reflect.deleteProperty(anterior, 'occupancy')

    expect(aceita(anterior)).toBe(true)
  })

  /** E continua aceitando com ele — a tolerância é do cliente, não do contrato da API. */
  it('aceita o detalhe com o campo novo', () => {
    expect(aceita(TRIP_DETAIL)).toBe(true)
  })

  /**
   * ⚠️ Opcional **não** é "qualquer coisa": presente com forma errada continua reprovando, senão a
   * disciplina viraria porta aberta.
   */
  it('reprova o campo novo com forma errada', () => {
    expect(aceita({ ...TRIP_DETAIL, occupancy: 'cheio' })).toBe(false)
  })

  /** Campo **antigo** ausente segue reprovando: a regra vale para o que acabou de nascer. */
  it('continua reprovando campo antigo ausente', () => {
    const semParadas: Record<string, unknown> = { ...TRIP_DETAIL }
    Reflect.deleteProperty(semParadas, 'stops')

    expect(aceita(semParadas)).toBe(false)
  })

  /** A disciplina se lê onde ela se aplica, não numa spec que ninguém abre depois. */
  it('está escrita no arquivo que a implementa', () => {
    const source = readFileSync(
      new URL('../../src/modules/trip/shared/trip.constant.ts', import.meta.url),
      'utf8',
    )

    expect(source).toInclude('nasce opcional')
  })
})

/**
 * ⚠️ **A tipagem do helper só protege se o espelho acompanhar.** A spec 075 anotou
 * `trip-smoke.helper.ts` com `TripDetailContract` justamente para o `tsc` pegar campo faltando — e
 * na spec 076 ele **não pegou**, porque `TripDetailContract` é escrito à mão e eu acrescentei o
 * campo só no tipo real. Quatro casos do smoke caíram de novo, pelo mesmo motivo.
 *
 * Este contrato compara o **objeto** da fixture com as chaves que o guard aceita: tipo escrito à
 * mão não se enumera em tempo de execução, mas o objeto sim.
 */
describe('a fixture declara todas as chaves do detalhe (spec 076)', () => {
  it('cobre exatamente o que o guard aceita', () => {
    const permitidas = [...TRIP_DETAIL_KEYS, ...TRIP_DETAIL_OPTIONAL_KEYS].toSorted()

    expect(Object.keys(TRIP_DETAIL).toSorted()).toEqual(permitidas)
  })
})
