/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import {
  NO_NUMBER_KEY,
  buildStopAddressKey,
  normalizeAddressNumber,
  normalizePostalCode,
} from '../../src/routing/domain/pool-address-key.js'

const API_SOURCE = '../api-transportada/src/trips/domain/stop-address-key.ts'

describe('a chave de parada do pool (spec 058 P2)', () => {
  /**
   * ⚠️ Cópia por valor da regra da API. Se as duas divergirem, a parada que o worker propõe e a
   * parada que o aceite cria não casam — e o roteiro aceito fica com duas paradas no mesmo portão.
   * O contrato compara o **corpo** dos dois arquivos, ignorando só o cabeçalho de comentário.
   */
  test('é idêntica à da API, linha a linha', async () => {
    const [copy, original] = await Promise.all([
      readFile('src/routing/domain/pool-address-key.ts', 'utf8'),
      readFile(API_SOURCE, 'utf8'),
    ])

    expect(afterHeader(copy)).toBe(afterHeader(original))
  })

  /** `01310-100` e `01310100` são o mesmo lugar; CEP incompleto não vira chave inventada. */
  test('normaliza o CEP e recusa o incompleto', () => {
    expect(normalizePostalCode('01310-100')).toBe('01310100')
    expect(normalizePostalCode('1310100')).toBeNull()
    expect(normalizePostalCode(null)).toBeNull()
  })

  /** "nº 45" e "45" são o mesmo portão; sem número é um endereço, e tem uma chave só. */
  test('normaliza o número e trata o sem-número', () => {
    expect(normalizeAddressNumber('nº 45')).toBe('45')
    expect(normalizeAddressNumber('  ')).toBe(NO_NUMBER_KEY)
    expect(normalizeAddressNumber('s/n')).toBe(NO_NUMBER_KEY)
  })

  test('a chave junta cidade, CEP e número, nesta ordem', () => {
    expect(
      buildStopAddressKey({ cityCode: '3543402', number: 'nº 45', postalCode: '14020-000' }),
    ).toBe('3543402|14020000|45')
    expect(buildStopAddressKey({ cityCode: '3543402', number: '45', postalCode: null })).toBeNull()
  })
})

/** O cabeçalho da cópia explica que ela é cópia — é a única diferença permitida. */
function afterHeader(source: string): string {
  return source.slice(source.indexOf('export type StopAddressComponents')).trim()
}
