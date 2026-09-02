/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyCargoVolumeFactors } from '../../src/database/company-cargo-volume-factor.schema.js'

const REPOSITORY = new URL(
  '../../src/companies/infrastructure/drizzle-cargo-volume-factor.repository.ts',
  import.meta.url,
)

describe('cargo volume factor tenant safety (spec 075 RNF1)', () => {
  test('carries a restrictive company ownership like every table of the product', () => {
    const config = getTableConfig(companyCargoVolumeFactors)
    const companyId = config.columns.find((column) => column.name === 'company_id')

    expect(companyId?.getSQLType()).toBe('uuid')
    expect(companyId?.notNull).toBeTrue()
    expect(
      config.foreignKeys
        .map((key) => key.reference().foreignTable)
        .map(getTableConfig)
        .map((t) => t.name),
    ).toContain('companies')
  })

  /**
   * ⚠️ A chave é `(company_id, species)`. Fosse só `species`, a espécie de uma empresa apagaria a
   * da outra no `onConflictDoUpdate` — e o fator de cubagem de um cliente passaria a estimar a
   * carga de outro, calado.
   */
  test('keys by company and species together, never by species alone', () => {
    const primary = getTableConfig(companyCargoVolumeFactors).primaryKeys[0]

    expect(primary?.columns.map((column) => column.name)).toEqual(['company_id', 'species'])
  })

  /** Zero é recusado no banco: desligar a estimativa é apagar a linha (ADR-0052, mesma decisão). */
  test('refuses a zero or negative factor at the database', () => {
    const checks = getTableConfig(companyCargoVolumeFactors).checks.map((check) => check.name)

    expect(checks).toContain('company_cargo_volume_factors_volume_check')
  })

  /**
   * Toda consulta do repositório filtra por empresa. Cobrado por texto de fonte porque uma consulta
   * que esquece o `where` compila, passa em todo teste de caminho feliz, e só aparece quando duas
   * empresas existem na mesma instalação.
   */
  test('every query in the repository filters by company', () => {
    const source = readFileSync(REPOSITORY, 'utf8')
    const operations = source.match(/\.(select|delete|insert)\(/gu) ?? []
    const companyFilters = source.match(/companyCargoVolumeFactors\.companyId/gu) ?? []

    expect(operations.length).toBeGreaterThan(0)
    // select e delete filtram; insert carrega o companyId no valor gravado.
    expect(companyFilters.length).toBeGreaterThanOrEqual(2)
    expect(source).toInclude('eq(companyCargoVolumeFactors.companyId, companyId)')
  })
})
