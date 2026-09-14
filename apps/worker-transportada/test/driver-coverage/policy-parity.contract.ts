/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  buildRegionCityKey,
  coversRegion,
  foldRegionCity,
} from '../../src/routing/domain/region-coverage.policy.js'

const WORKER = new URL('../../src/routing/domain/region-coverage.policy.ts', import.meta.url)
const API = new URL(
  '../../../api-transportada/src/freight-regions/domain/region-coverage.policy.ts',
  import.meta.url,
)

/**
 * ⚠️ **Cópia por valor entre apps.** Se as duas divergirem, o roteirizador manda o agregado para uma
 * zona que a tabela de frete não reconhece, e o custo dele sai errado no mesmo dia — sem nada
 * falhar. O contrato compara o **comportamento**, não o texto: a cópia tem uma diferença deliberada
 * (código malformado devolve `null` em vez de lançar), e comparar linha a linha a proibiria.
 */
describe('paridade da política de cobertura (spec 106)', () => {
  test('a diferença deliberada está declarada nos dois lados', () => {
    const worker = readFileSync(WORKER, 'utf8')

    expect(worker).toInclude('Cópia por valor')
    expect(worker).toInclude(
      'api-transportada/src/freight-regions/domain/region-coverage.policy.ts',
    )
    /** A cópia não lança: quem lê dado gravado não derruba a roteirização por uma linha velha. */
    expect(worker).not.toInclude('throw new')
  })

  test('a forma impressa do código é a mesma dos dois lados', () => {
    const api = readFileSync(API, 'utf8')
    const worker = readFileSync(WORKER, 'utf8')
    const pattern = /REGION_CODE_PATTERN = (\S+)/

    expect(pattern.exec(worker)?.[1]).toBe(pattern.exec(api)?.[1])
  })

  test('a zona acumulativa se comporta igual à da API', () => {
    expect(coversRegion({ candidate: '1.000', coverage: '1.002' })).toBe(true)
    expect(coversRegion({ candidate: '1.002', coverage: '1.000' })).toBe(false)
    expect(coversRegion({ candidate: '2.000', coverage: '1.003' })).toBe(false)
    /** Matriz é saída, não zona: ela não entra na contagem acumulativa. */
    expect(coversRegion({ candidate: '0.001', coverage: '0.001' })).toBe(true)
  })

  test('a dobra da cidade é a mesma', () => {
    expect(foldRegionCity('  Ribeirão  Preto ')).toBe('RIBEIRAO PRETO')
    expect(foldRegionCity('MATÃO')).toBe(foldRegionCity('matao'))
  })

  test('a chave de casamento junta cidade dobrada e UF', () => {
    expect(buildRegionCityKey({ city: 'Orlândia', state: 'sp' })).toBe('ORLANDIA|SP')
  })
})
