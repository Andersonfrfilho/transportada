/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 T2.6 (ADR-0108, D11): a cópia efetiva do e-mail à contratante ganha a lista do tipo, que vence as outras
 * duas: tipo (com algum ativo) ?? contratante da nota ?? empresa — a mesma regra "com algum ativo vence, sem ativo
 * herda" da 267.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveEffectiveWatchers,
  type OccurrenceWatcherCandidate,
} from '../../src/contractor-mail/domain/occurrence-watcher.policy.js'

function candidate(
  name: string,
  overrides: Partial<OccurrenceWatcherCandidate> = {},
): OccurrenceWatcherCandidate {
  return {
    address: `${name.toLowerCase()}@empresa.example.test`,
    name,
    status: 'active',
    userId: `user-${name.toLowerCase()}`,
    ...overrides,
  }
}

const COMPANY = [candidate('Ana'), candidate('Bruno')]
const CONTRACTOR = [candidate('Carla')]
const TYPE = [candidate('Davi')]

function resolve(overrides: Partial<Parameters<typeof resolveEffectiveWatchers>[0]> = {}) {
  return resolveEffectiveWatchers({
    companyWatchers: COMPANY,
    contractorWatchers: CONTRACTOR,
    excludedUserIds: [],
    toAddresses: [],
    typeWatchers: TYPE,
    ...overrides,
  })
}

describe('a cópia do tipo vence a da contratante e a da empresa (spec 271 D11)', () => {
  test('tipo com algum ativo: só o tipo, de origem occurrence_type', () => {
    const effective = resolve()

    expect(effective.source).toBe('occurrence_type')
    expect(effective.copy.map((entry) => entry.userId)).toEqual(['user-davi'])
  })

  test('tipo só com inativo herda a contratante', () => {
    const effective = resolve({ typeWatchers: [candidate('Davi', { status: 'inactive' })] })

    expect(effective.source).toBe('contractor')
    expect(effective.copy.map((entry) => entry.userId)).toEqual(['user-carla'])
  })

  test('tipo vazio e contratante vazia herda a empresa', () => {
    const effective = resolve({ contractorWatchers: [], typeWatchers: [] })

    expect(effective.source).toBe('company')
    expect(effective.copy.map((entry) => entry.userId)).toEqual(['user-ana', 'user-bruno'])
  })

  test('sem lista do tipo (correção de endereço), vale a regra da 267', () => {
    const effective = resolveEffectiveWatchers({
      companyWatchers: COMPANY,
      contractorWatchers: CONTRACTOR,
      excludedUserIds: [],
      toAddresses: [],
    })

    expect(effective.source).toBe('contractor')
  })

  test('nenhuma lista com ativo: sem cópia e sem origem', () => {
    const effective = resolve({ companyWatchers: [], contractorWatchers: [], typeWatchers: [] })

    expect(effective).toEqual({ copy: [], droppedCount: 0, source: null })
  })

  test('o operador tira um chip: o removido não vai, e a lista não troca por outra', () => {
    const effective = resolve({
      excludedUserIds: ['user-davi'],
      typeWatchers: [candidate('Davi'), candidate('Eva')],
    })

    expect(effective.source).toBe('occurrence_type')
    expect(effective.copy.map((entry) => entry.userId)).toEqual(['user-eva'])
  })

  test('quem já está no To não repete; sem e-mail é descartado e contado', () => {
    const effective = resolve({
      toAddresses: ['EVA@empresa.example.test'],
      typeWatchers: [
        candidate('Davi'),
        candidate('Eva'),
        candidate('Fabio', { address: undefined }),
      ],
    })

    expect(effective.copy.map((entry) => entry.userId)).toEqual(['user-davi'])
    expect(effective.droppedCount).toBe(1)
  })
})
