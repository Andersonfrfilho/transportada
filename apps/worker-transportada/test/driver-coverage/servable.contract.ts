/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveServableStops } from '../../src/routing/domain/servable-stops.policy.js'

const STOPS = [
  { city: 'Ribeirão Preto', index: 1, state: 'SP' },
  { city: 'MATAO', index: 2, state: 'SP' },
  { city: 'Orlândia', index: 3, state: 'SP' },
]

/** A cidade da zona: a mesma dobra que o casamento usa dos dois lados. */
const REGION_BY_CITY = new Map([
  ['RIBEIRAO PRETO|SP', '1.000'],
  ['MATAO|SP', '1.002'],
  ['ORLANDIA|SP', '2.000'],
])

describe('cobertura vira conjunto servível (spec 106)', () => {
  /**
   * ⚠️ **A regra de fallback, decidida pelo usuário:** motorista sem região cadastrada serve
   * **tudo**. Instalação que nunca configurou região continua funcionando igual a hoje — e conjunto
   * vazio ali faria o roteirizador parar de propor viagem, sem ninguém entender por quê.
   */
  test('motorista sem região cadastrada serve todas as paradas', () => {
    const servable = resolveServableStops({
      coverage: [],
      regionCodeByCityKey: REGION_BY_CITY,
      stops: STOPS,
    })

    expect(servable).toBe(null)
  })

  /** Zona acumulativa dentro da família: quem cobre `1.002` cobre `1.000` e `1.001`. */
  test('a zona cobre as de baixo da mesma família', () => {
    const servable = resolveServableStops({
      coverage: [{ city: '', regionCode: '1.002', scope: 'region', state: '' }],
      regionCodeByCityKey: REGION_BY_CITY,
      stops: STOPS,
    })

    expect([...(servable ?? [])].sort()).toEqual([1, 2])
  })

  /** Família diferente não cobre, por maior que seja a zona. */
  test('família diferente não cobre', () => {
    const servable = resolveServableStops({
      coverage: [{ city: '', regionCode: '1.003', scope: 'region', state: '' }],
      regionCodeByCityKey: REGION_BY_CITY,
      stops: STOPS,
    })

    expect([...(servable ?? [])]).not.toContain(3)
  })

  /** Cobertura por cidade solta vale junto com a por zona (`scope: 'city'`). */
  test('cidade solta entra mesmo fora da zona coberta', () => {
    const servable = resolveServableStops({
      coverage: [
        { city: '', regionCode: '1.000', scope: 'region', state: '' },
        { city: 'Orlândia', regionCode: '2.000', scope: 'city', state: 'SP' },
      ],
      regionCodeByCityKey: REGION_BY_CITY,
      stops: STOPS,
    })

    expect([...(servable ?? [])].sort()).toEqual([1, 3])
  })

  /**
   * ⚠️ Cidade sem zona cadastrada **não** é servível por cobertura de zona — ela não está na tabela,
   * e adivinhar a zona dela é inventar. Ela vira sobra, e a tela diz que falta cadastrar.
   */
  test('cidade fora da tabela de regiões não é coberta por zona', () => {
    const servable = resolveServableStops({
      coverage: [{ city: '', regionCode: '9.003', scope: 'region', state: '' }],
      regionCodeByCityKey: new Map(),
      stops: STOPS,
    })

    expect([...(servable ?? [])]).toEqual([])
  })

  /** A dobra do acento vale dos dois lados: `Ribeirão` casa com `RIBEIRAO`. */
  test('casa a cidade pela dobra, não pela grafia', () => {
    const servable = resolveServableStops({
      coverage: [{ city: 'RIBEIRAO PRETO', regionCode: '1.000', scope: 'city', state: 'sp' }],
      regionCodeByCityKey: REGION_BY_CITY,
      stops: STOPS,
    })

    expect([...(servable ?? [])]).toEqual([1])
  })
})
