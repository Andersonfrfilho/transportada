/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D21 (T17): baú fechado segura a carga sozinho — as paredes fazem o papel da cinta. Nos
 * outros tipos de carroceria vale a regra da spec 100: todo motorista da viagem amarra, e nenhum
 * motorista é ninguém amarrando. Detalhe, gatilho eager e prévia usam a **mesma** função.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { resolveSecuresCargo } from '../../src/trips/domain/cargo-securing.policy.js'

const WIRED_SOURCES: string[] = [
  '../../src/trips/infrastructure/drizzle-trip.repository.ts',
  '../../src/trips/infrastructure/trip-cargo-layout-input.support.ts',
  '../../src/trips/infrastructure/trip-cargo-preview.query.ts',
]

describe('resolveSecuresCargo (spec 145 D21)', () => {
  test('closed body (02) secures the cargo even without any driver', () => {
    expect(resolveSecuresCargo({ bodyType: '02', driversSecureCargo: [] })).toBe(true)
  })

  test('closed body (02) secures the cargo even when the driver does not tie it down', () => {
    expect(resolveSecuresCargo({ bodyType: '02', driversSecureCargo: [false] })).toBe(true)
  })

  test.each(['05', '00', '01', '03', '04'])(
    'body %s falls back to the drivers: every driver ties it down',
    (bodyType) => {
      expect(resolveSecuresCargo({ bodyType, driversSecureCargo: [true, true] })).toBe(true)
      expect(resolveSecuresCargo({ bodyType, driversSecureCargo: [true, false] })).toBe(false)
    },
  )

  test('not closed and no driver: nobody ties it down', () => {
    expect(resolveSecuresCargo({ bodyType: '05', driversSecureCargo: [] })).toBe(false)
  })

  test('unknown vehicle (no body) falls back to the drivers', () => {
    expect(resolveSecuresCargo({ bodyType: null, driversSecureCargo: [] })).toBe(false)
    expect(resolveSecuresCargo({ bodyType: null, driversSecureCargo: [true] })).toBe(true)
  })

  test.each(WIRED_SOURCES)('%s builds securesCargo through resolveSecuresCargo', (path) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(source).toContain('resolveSecuresCargo(')
    expect(source).not.toMatch(/\.every\(\(row\) => row\.(driverSecuresCargo|securesCargo)/)
  })
})
