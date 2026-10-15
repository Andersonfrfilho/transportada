/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverOccurrenceType } from '../../src/modules/driver-trip/shared/driverTrip.types'
import {
  buildOccurrenceTypeList,
  normalizeOccurrenceTypeQuery,
  readOccurrenceTypeUsage,
  recordOccurrenceTypeUse,
  type OccurrenceTypeUsageStorage,
} from '../../src/modules/driver-trip/shared/occurrenceTypeList.service'

function type(id: string, name: string, flow: 'document' | 'stop'): DriverOccurrenceType {
  return { flow, id, name }
}

const TYPES = [
  type('a', 'Item avariado', 'document'),
  type('b', 'Devolução total', 'document'),
  type('c', 'Espera longa', 'stop'),
  type('d', 'Doca interditada', 'stop'),
  type('e', 'Destinatário ausente', 'document'),
]

function memoryStorage(initial?: string): OccurrenceTypeUsageStorage & { value: string | null } {
  const box = { value: initial ?? null }
  return {
    getItem: () => box.value,
    setItem: (_key, value) => {
      box.value = value
    },
    get value() {
      return box.value
    },
  }
}

describe('lista de tipos de ocorrência do motorista', () => {
  it('sem uso e sem busca: só os grupos, parada primeiro, na ordem da API', () => {
    const list = buildOccurrenceTypeList({ query: '', types: TYPES, usage: {} })
    expect(list.frequent).toEqual([])
    expect(list.groups.map((group) => group.flow)).toEqual(['stop', 'document'])
    expect(list.groups[1]?.types.map((t) => t.id)).toEqual(['a', 'b', 'e'])
  })

  it('os mais usados vêm primeiro, repetidos no grupo e limitados a três', () => {
    const usage = { a: 1, b: 9, c: 5, d: 2 }
    const list = buildOccurrenceTypeList({ query: '', types: TYPES, usage })
    expect(list.frequent.map((t) => t.id)).toEqual(['b', 'c', 'd'])
    expect(list.groups[0]?.types.map((t) => t.id)).toEqual(['c', 'd'])
    expect(list.groups[1]?.types.map((t) => t.id)).toEqual(['b', 'a', 'e'])
  })

  it('a busca ignora acento e caixa, e esconde "Mais usados"', () => {
    const list = buildOccurrenceTypeList({
      query: 'DEVOLUCAO',
      types: TYPES,
      usage: { b: 9 },
    })
    expect(list.frequent).toEqual([])
    expect(list.groups.flatMap((group) => group.types.map((t) => t.id))).toEqual(['b'])
    expect(normalizeOccurrenceTypeQuery('  Doça ')).toBe('doca')
  })

  it('busca sem resultado devolve nenhum grupo', () => {
    expect(buildOccurrenceTypeList({ query: 'zzz', types: TYPES, usage: {} }).groups).toEqual([])
  })

  it('lista curta não mostra "Mais usados"', () => {
    const list = buildOccurrenceTypeList({
      query: '',
      types: TYPES.slice(0, 3),
      usage: { a: 4 },
    })
    expect(list.frequent).toEqual([])
  })

  it('o uso soma no armazenamento e dado malformado é ignorado', () => {
    const storage = memoryStorage()
    recordOccurrenceTypeUse({ storage, typeId: 'a' })
    recordOccurrenceTypeUse({ storage, typeId: 'a' })
    expect(readOccurrenceTypeUsage(storage)).toEqual({ a: 2 })
    expect(readOccurrenceTypeUsage(memoryStorage('{"a":"x","b":-1,"c":3}'))).toEqual({ c: 3 })
    expect(readOccurrenceTypeUsage(memoryStorage('nope'))).toEqual({})
    expect(readOccurrenceTypeUsage(null)).toEqual({})
  })
})
