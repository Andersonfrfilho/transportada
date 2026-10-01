/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const SUPPORT = new URL('../../src/trips/infrastructure/trip-occupancy.support.ts', import.meta.url)

/**
 * Spec 147 D4: a chave da referência de volume só sai de `resolveVolumeReferenceKey`
 * (`fleet/domain/vehicle-capacity.policy.ts`). Cobrado por texto de fonte porque montar a chave à
 * mão aqui compila, passa em todo teste de caminho feliz e diverge caladamente no dia em que a
 * carreta entrar na consulta.
 */
describe('a chave da referência de volume da ocupação (spec 147 D4)', () => {
  const source = readFileSync(SUPPORT, 'utf8')

  test('não compara vehicleVolumeReferences.vehicleType direto com o campo do veículo', () => {
    expect(source).not.toMatch(
      /eq\(\s*vehicleVolumeReferences\.vehicleType\s*,\s*vehicle\.vehicleType\s*\)/u,
    )
  })

  test('não compara vehicleVolumeReferences.bodyType direto com o campo do veículo', () => {
    expect(source).not.toMatch(
      /eq\(\s*vehicleVolumeReferences\.bodyType\s*,\s*vehicle\.bodyType\s*\)/u,
    )
  })

  test('importa resolveVolumeReferenceKey do seam da frota', () => {
    expect(source).toMatch(
      /import\s*\{[^}]*resolveVolumeReferenceKey[^}]*\}\s*from\s*['"].*vehicle-capacity\.policy\.js['"]/u,
    )
  })

  test('chama resolveVolumeReferenceKey para montar a chave', () => {
    expect(source).toMatch(/resolveVolumeReferenceKey\(/u)
  })
})
