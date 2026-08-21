/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  fleetDriverRegions,
  freightRegionCities,
  freightRegionDriverRates,
  freightRegions,
} from '../../src/database/database.schema.js'
import { columnNames, foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'

const REGION_TABLES = [
  { name: 'freight_regions', table: freightRegions },
  { name: 'freight_region_cities', table: freightRegionCities },
  { name: 'freight_region_driver_rates', table: freightRegionDriverRates },
  { name: 'fleet_driver_regions', table: fleetDriverRegions },
] as const

describe('freight region tenant safety', () => {
  test('anchors every region table to a company', () => {
    for (const { name, table } of REGION_TABLES) {
      expect(columnNames(table)).toContain('company_id')
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: `${name}_company_id_companies_id_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })

  /**
   * A região é alcançada pelo par `(id, company_id)`, nunca pelo id sozinho: é isso que impede uma
   * cidade, um valor ou a cobertura de um motorista apontarem para a rota de outra empresa.
   */
  test('reaches the region through the tenant, never by id alone', () => {
    expect(uniqueColumnsByName(freightRegions)).toMatchObject({
      freight_regions_company_id_id_unique: ['company_id', 'id'],
    })

    for (const { name, table } of REGION_TABLES.slice(1)) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['region_id', 'company_id'],
        foreignColumns: ['id', 'company_id'],
        foreignTable: 'freight_regions',
        name: `${name}_company_region_fk`,
        onDelete: name === 'fleet_driver_regions' ? 'restrict' : 'cascade',
        onUpdate: 'cascade',
      })
    }
  })

  test('reaches the driver through the tenant as well', () => {
    expect(foreignKeys(fleetDriverRegions)).toContainEqual({
      columns: ['driver_id', 'company_id'],
      foreignColumns: ['id', 'company_id'],
      foreignTable: 'fleet_drivers',
      name: 'fleet_driver_regions_company_driver_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  /**
   * ⚠️ BARRINHA/SP está em `1.000` (Barretos) e em `5.000` (Jaboticabal) na tabela real do cliente,
   * com preços diferentes. Unicidade por `(company_id, city)` recusaria a importação da segunda
   * linha — a cidade é única dentro da rota, não dentro da empresa.
   */
  test('keeps the city unique inside the route, never inside the company', () => {
    expect(uniqueColumnsByName(freightRegionCities)).toMatchObject({
      freight_region_cities_region_city_unique: ['company_id', 'region_id', 'city', 'state'],
    })
    expect(Object.values(uniqueColumnsByName(freightRegionCities))).not.toContainEqual([
      'company_id',
      'city',
    ])
  })

  // Chave natural da importação: reimportar a tabela do cliente atualiza a rota, nunca duplica
  test('keeps the printed route code unique per company', () => {
    expect(uniqueColumnsByName(freightRegions)).toMatchObject({
      freight_regions_company_id_code_unique: ['company_id', 'code'],
    })
  })

  test('keeps one paid amount per route and vehicle class', () => {
    expect(uniqueColumnsByName(freightRegionDriverRates)).toMatchObject({
      freight_region_driver_rates_region_class_unique: ['company_id', 'region_id', 'freight_class'],
    })
  })
})
