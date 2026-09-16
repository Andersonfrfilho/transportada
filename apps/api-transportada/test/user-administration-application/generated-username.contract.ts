/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  buildUsernameCandidates,
  pickAvailableUsername,
} from '../../src/identity/domain/generated-username.policy.js'

/**
 * O convite gravava o id interno como login, e ninguém lembra de um UUID. O login nasce do nome:
 * primeiro nome e último sobrenome, minúsculos, sem acento, separados por ponto.
 */
describe('login gerado a partir do nome', () => {
  test('primeiro nome e último sobrenome, sem acento, com ponto', () => {
    expect(buildUsernameCandidates('Deisy Campos Coimbra')[0]).toBe('deisy.coimbra')
    expect(buildUsernameCandidates('Andréia Ulisses Procópio')[0]).toBe('andreia.procopio')
  })

  test('partícula não conta como sobrenome', () => {
    expect(buildUsernameCandidates('Egberto Candido da Silva')[0]).toBe('egberto.silva')
    expect(buildUsernameCandidates('Egberto Candido da Silva')).not.toContain('egberto.da')
  })

  test('em uso, tenta os sobrenomes anteriores e depois número no fim', () => {
    const candidates = buildUsernameCandidates('Deisy Campos Coimbra')

    expect(candidates.slice(0, 4)).toEqual([
      'deisy.coimbra',
      'deisy.campos',
      'deisy.coimbra2',
      'deisy.coimbra3',
    ])
    expect(
      pickAvailableUsername({
        candidates,
        taken: new Set(['deisy.coimbra', 'deisy.campos', 'deisy.coimbra2']),
      }),
    ).toBe('deisy.coimbra3')
  })

  test('nome de uma palavra só vira o próprio nome', () => {
    expect(buildUsernameCandidates('Thiago')[0]).toBe('thiago')
  })

  /** Todo candidato passa na mesma regra da edição: login gerado que a edição recusa é armadilha. */
  test('todo candidato respeita a regra de login da edição', () => {
    const pattern = /^[a-z0-9][a-z0-9._-]{2,59}$/u
    for (const name of ["Ana D'Ávila", 'Jo Ã', 'Maria  de  Lourdes  Nascimento-Souza']) {
      buildUsernameCandidates(name).forEach((candidate) => expect(candidate).toMatch(pattern))
    }
  })

  test('nome que não rende login válido não gera candidato: o convite usa o id interno', () => {
    expect(buildUsernameCandidates('   ')).toEqual([])
    expect(buildUsernameCandidates('Jo')).toEqual([])
  })
})
