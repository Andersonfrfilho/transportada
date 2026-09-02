/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { municipalityCentroids } from '../../src/database/database.schema.js'
import { checkSqlByName, columnNames, requiredColumnNames } from '../fiscal-schema/support.js'

describe('municipality centroids (spec 069, último degrau da cascata)', () => {
  test('is keyed by the IBGE city code the addresses already carry', () => {
    expect(columnNames(municipalityCentroids)).toEqual([
      'city_code',
      'state',
      'latitude',
      'longitude',
      'created_at',
      'updated_at',
    ])
  })

  /**
   * Sem `company_id`, como `geocoded_addresses`, `fuel_price_references` e
   * `energy_tariff_references`: a divisão territorial do IBGE é dado público, idêntico para toda
   * empresa da instalação, sem PII e sem efeito fiscal.
   *
   * A ausência é assertada aqui para não passar por **esquecimento** — que é a diferença entre uma
   * exceção declarada e um descuido que vira precedente para o próximo.
   */
  test('keeps the public division tenant-less on purpose, and unable to reach a company', () => {
    expect(columnNames(municipalityCentroids)).not.toContain('company_id')
    expect(Object.keys(checkSqlByName(municipalityCentroids))).not.toContain(
      'municipality_centroids_company_id_check',
    )
  })

  test('requires the coordinate it exists to serve', () => {
    expect(requiredColumnNames(municipalityCentroids)).toContain('latitude')
    expect(requiredColumnNames(municipalityCentroids)).toContain('longitude')
    expect(requiredColumnNames(municipalityCentroids)).toContain('state')
  })

  /** Coordenada fora da faixa entra em base sem reclamar de nada e sai como rota para o oceano. */
  test('refuses a coordinate outside the earth', () => {
    const checks = checkSqlByName(municipalityCentroids)

    expect(checks.municipality_centroids_latitude_check).toContain('between -90 and 90')
    expect(checks.municipality_centroids_longitude_check).toContain('between -180 and 180')
  })

  test('pins the city code to seven digits and the state to two letters', () => {
    const checks = checkSqlByName(municipalityCentroids)

    expect(checks.municipality_centroids_city_code_check).toContain('^[0-9]{7}$')
    expect(checks.municipality_centroids_state_check).toContain('^[A-Z]{2}$')
  })
})
