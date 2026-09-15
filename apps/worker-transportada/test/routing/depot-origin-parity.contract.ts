/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'

import { resolveDepotOrigin } from '../../src/routing/domain/depot-origin.policy.js'

const API_SOURCE = '../api-transportada/src/trips/domain/depot-origin.policy.ts'

describe('a origem do barracão (spec 097 D7)', () => {
  /**
   * ⚠️ Cópia por valor da regra da API. Se divergirem, "Propor ordem" parte de um lugar e o mapa da
   * montagem de outro — as duas verdades sobre a mesma viagem que a spec 097 existe para acabar.
   */
  test('é idêntica à da API, linha a linha', async () => {
    const [copy, original] = await Promise.all([
      readFile('src/routing/domain/depot-origin.policy.ts', 'utf8'),
      readFile(API_SOURCE, 'utf8'),
    ])

    expect(afterHeader(copy)).toBe(afterHeader(original))
  })

  /** Sem linha de configuração, as duas apps terminam a rota no mesmo lugar. */
  test('o padrão da política de fim é o mesmo nas duas apps', async () => {
    const [schema, repository] = await Promise.all([
      readFile('../api-transportada/src/database/route-suggestion.schema.ts', 'utf8'),
      readFile('src/routing/infrastructure/drizzle-route-optimization.repository.ts', 'utf8'),
    ])
    const apiDefault = /DEFAULT_ROUTE_END_POLICY: RouteEndPolicy = '([a-z_]+)'/u.exec(schema)?.[1]
    const workerDefault = /endPolicy: '([a-z_]+)'/u.exec(repository)?.[1]

    expect(apiDefault).toBeDefined()
    expect(workerDefault).toBe(apiDefault)
  })

  test('a configuração vence; sem ela, o endereço da empresa', () => {
    const companyAddress = { cityIbgeCode: '3543402', number: '2296', postalCode: '14076-400' }

    expect(resolveDepotOrigin({ companyAddress, configuredAddressKey: 'galpao' })).toEqual({
      addressKey: 'galpao',
      source: 'route_settings',
    })
    expect(resolveDepotOrigin({ companyAddress, configuredAddressKey: '' })).toEqual({
      addressKey: '3543402|14076400|2296',
      source: 'company_address',
    })
    expect(resolveDepotOrigin({ companyAddress: null, configuredAddressKey: null })).toBeNull()
  })
})

/** O cabeçalho e o import da chave (arquivos de nome diferente) são as únicas diferenças. */
function afterHeader(source: string): string {
  return source.slice(source.indexOf('export const DEPOT_ORIGIN_SOURCES')).trim()
}
