/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 D23 (corrige a D21): baú fechado **não** amarra a carga — pilha alta solta no meio do baú
 * cai do mesmo jeito. `securesCargo` é só a regra da spec 100 (todo motorista amarra; nenhum motorista
 * é ninguém amarrando), e o baú fechado vira `enclosedBody`, que o empacotador lê à parte. Detalhe,
 * gatilho eager e prévia usam a **mesma** função.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import { resolveCargoSecuring } from '../../src/trips/domain/cargo-securing.policy.js'

const WIRED_SOURCES: string[] = [
  '../../src/trips/infrastructure/drizzle-trip.repository.ts',
  '../../src/trips/infrastructure/trip-cargo-layout-input.support.ts',
  '../../src/trips/infrastructure/trip-cargo-preview.query.ts',
]

describe('resolveCargoSecuring (spec 145 D23)', () => {
  test('closed body (02) is enclosed, and without any driver nobody ties it down', () => {
    expect(resolveCargoSecuring({ bodyType: '02', driversSecureCargo: [] })).toEqual({
      enclosedBody: true,
      securesCargo: false,
    })
  })

  test('closed body (02) follows the drivers for securesCargo', () => {
    expect(resolveCargoSecuring({ bodyType: '02', driversSecureCargo: [false] })).toEqual({
      enclosedBody: true,
      securesCargo: false,
    })
    expect(resolveCargoSecuring({ bodyType: '02', driversSecureCargo: [true, true] })).toEqual({
      enclosedBody: true,
      securesCargo: true,
    })
  })

  test.each(['05', '00', '01', '03', '04'])(
    'body %s is not enclosed, and every driver has to tie it down',
    (bodyType) => {
      expect(resolveCargoSecuring({ bodyType, driversSecureCargo: [true, true] })).toEqual({
        enclosedBody: false,
        securesCargo: true,
      })
      expect(resolveCargoSecuring({ bodyType, driversSecureCargo: [true, false] })).toEqual({
        enclosedBody: false,
        securesCargo: false,
      })
    },
  )

  test('not closed and no driver: nobody ties it down', () => {
    expect(resolveCargoSecuring({ bodyType: '05', driversSecureCargo: [] })).toEqual({
      enclosedBody: false,
      securesCargo: false,
    })
  })

  test('unknown vehicle (no body) is not enclosed and falls back to the drivers', () => {
    expect(resolveCargoSecuring({ bodyType: null, driversSecureCargo: [] })).toEqual({
      enclosedBody: false,
      securesCargo: false,
    })
    expect(resolveCargoSecuring({ bodyType: null, driversSecureCargo: [true] })).toEqual({
      enclosedBody: false,
      securesCargo: true,
    })
  })

  test.each(WIRED_SOURCES)('%s builds securesCargo and enclosedBody through the policy', (path) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8')
    expect(source).toContain('resolveCargoSecuring(')
    expect(source).toContain('enclosedBody')
    expect(source).not.toContain('resolveSecuresCargo')
    expect(source).not.toMatch(/\.every\(\(row\) => row\.(driverSecuresCargo|securesCargo)/)
  })
})
