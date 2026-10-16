/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveEffectiveWatchers,
  type OccurrenceWatcherCandidate,
} from '../../src/contractor-mail/domain/occurrence-watcher.policy.js'

function watcher(
  name: string,
  overrides: Partial<OccurrenceWatcherCandidate> = {},
): OccurrenceWatcherCandidate {
  return {
    address: `${name.toLowerCase()}@empresa.test`,
    name,
    status: 'active',
    userId: `user-${name.toLowerCase()}`,
    ...overrides,
  }
}

const ANA = watcher('Ana')
const BRUNO = watcher('Bruno')
const CARLA = watcher('Carla')

function resolve(overrides: Partial<Parameters<typeof resolveEffectiveWatchers>[0]> = {}) {
  return resolveEffectiveWatchers({
    companyWatchers: [BRUNO, ANA],
    contractorWatchers: [],
    excludedUserIds: [],
    toAddresses: ['contato@cliente.test'],
    ...overrides,
  })
}

describe('resolveEffectiveWatchers (spec 267 RF3)', () => {
  test('sem lista da contratante vale a da empresa, em ordem de nome', () => {
    const result = resolve()
    expect(result.source).toBe('company')
    expect(result.copy.map((entry) => entry.name)).toEqual(['Ana', 'Bruno'])
  })

  test('a lista da contratante vence a da empresa', () => {
    const result = resolve({ contractorWatchers: [CARLA] })
    expect(result.source).toBe('contractor')
    expect(result.copy.map((entry) => entry.name)).toEqual(['Carla'])
  })

  test('lista da contratante só com inativos herda a da empresa', () => {
    const result = resolve({ contractorWatchers: [{ ...CARLA, status: 'inactive' }] })
    expect(result.source).toBe('company')
    expect(result.copy.map((entry) => entry.name)).toEqual(['Ana', 'Bruno'])
  })

  test('inativo não vai em cópia', () => {
    const result = resolve({ companyWatchers: [ANA, { ...BRUNO, status: 'inactive' }] })
    expect(result.copy.map((entry) => entry.name)).toEqual(['Ana'])
  })

  test('sem nenhuma lista ativa não há fonte nem cópia', () => {
    expect(resolve({ companyWatchers: [] })).toEqual({ copy: [], droppedCount: 0, source: null })
  })

  test('inelegível (sem endereço) sai e conta como descartado', () => {
    const result = resolve({ companyWatchers: [ANA, { ...BRUNO, address: undefined }] })
    expect(result.copy.map((entry) => entry.name)).toEqual(['Ana'])
    expect(result.droppedCount).toBe(1)
  })

  test('o excluído sai; o excluído que não está na lista não adiciona ninguém', () => {
    const result = resolve({ excludedUserIds: [BRUNO.userId, 'user-de-outra-pessoa'] })
    expect(result.copy.map((entry) => entry.name)).toEqual(['Ana'])
  })

  test('endereço já presente no To sai, sem distinguir caixa nem espaço', () => {
    const result = resolve({ toAddresses: [' ANA@empresa.test '] })
    expect(result.copy.map((entry) => entry.name)).toEqual(['Bruno'])
  })

  test('endereço repetido entra uma vez só', () => {
    const result = resolve({
      companyWatchers: [ANA, watcher('Ana2', { address: 'Ana@empresa.test' })],
    })
    expect(result.copy).toHaveLength(1)
  })

  test('a cópia leva o endereço normalizado', () => {
    const result = resolve({ companyWatchers: [watcher('Ana', { address: ' Ana@Empresa.Test ' })] })
    expect(result.copy[0]?.address).toBe('ana@empresa.test')
  })
})
