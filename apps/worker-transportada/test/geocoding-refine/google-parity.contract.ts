/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { toGeocodingPrecision } from '../../src/geocoding-refine/domain/google-location-type.policy.js'

const WORKER = new URL(
  '../../src/geocoding-refine/domain/google-location-type.policy.ts',
  import.meta.url,
)
const API = new URL(
  '../../../api-transportada/src/routing/domain/geocoding-precision.policy.ts',
  import.meta.url,
)

/**
 * ⚠️ A tradução `location_type` → precisão é **cópia por valor** entre as duas apps (ADR-0062). Se
 * elas divergirem, a mesma resposta do Google vira precisão diferente conforme quem perguntou — a
 * marca humana na API e a compra automática aqui —, e o endereço fica melhor ou pior por causa de
 * qual caminho o alcançou primeiro.
 */
describe('the paid provider translation agrees with the API', () => {
  test('maps every location type to the same precision, in the same order', async () => {
    const [worker, api] = await Promise.all([readFile(WORKER, 'utf8'), readFile(API, 'utf8')])

    expect(mapBlock(worker)).toEqual(mapBlock(api))
    expect(typeList(worker)).toEqual(typeList(api))
  })

  /** O desconhecido é o palpite mais grosseiro, nunca o mais fino: aqui ele gastaria para piorar. */
  test('reads an unknown location type as the coarsest precision', () => {
    expect(toGeocodingPrecision('PLUS_CODE')).toBe('city')
    expect(toGeocodingPrecision('')).toBe('city')
  })

  test('reads the four documented location types', () => {
    expect(toGeocodingPrecision('ROOFTOP')).toBe('rooftop')
    expect(toGeocodingPrecision('RANGE_INTERPOLATED')).toBe('street')
    expect(toGeocodingPrecision('GEOMETRIC_CENTER')).toBe('postal_code')
    expect(toGeocodingPrecision('APPROXIMATE')).toBe('city')
  })
})

function mapBlock(source: string): readonly string[] {
  return entriesOf(source, 'const PRECISION_BY_LOCATION_TYPE', '}')
}

function typeList(source: string): readonly string[] {
  return entriesOf(source, 'export const GOOGLE_LOCATION_TYPES', ']')
}

/**
 * Só as **entradas** do literal: comentário é livre para divergir entre as apps — cada lado explica
 * o que importa ali —, e comparar prosa faria o contrato falhar por reescrita de texto, que é o
 * jeito mais rápido de ensinar alguém a ignorá-lo.
 */
function entriesOf(source: string, header: string, closing: string): readonly string[] {
  const start = source.indexOf(header)
  expect(start).toBeGreaterThan(-1)

  const lines = source.slice(start).split('\n').slice(1)
  const entries: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith(closing)) break
    if (trimmed.length === 0) continue
    if (trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('//')) continue
    entries.push(trimmed)
  }

  return entries
}
