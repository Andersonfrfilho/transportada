/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { fleetVehicleAxles } from '../../src/database/database.schema.js'
import { columnNames, foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'

describe('eixos do veículo (spec 094)', () => {
  /**
   * ⚠️ **Tabela, não coluna.** Um `max_axle_load_kg` único responderia "o veículo aguenta X por
   * eixo" e não responde a pergunta que interessa — *este* arranjo sobrecarrega *qual* eixo. Para
   * isso é preciso saber onde cada eixo está, e isso é uma linha por eixo.
   */
  test('guarda posição e limite por eixo', () => {
    expect(getTableConfig(fleetVehicleAxles).name).toBe('fleet_vehicle_axles')
    expect(columnNames(fleetVehicleAxles)).toEqual([
      'id',
      'company_id',
      'vehicle_id',
      'position',
      'distance_from_front_m',
      'max_load_kg',
      'created_at',
      'updated_at',
    ])
  })

  /** A FK leva o tenant junto: a simples aceitaria amarrar eixo ao veículo de outra empresa. */
  test('não alcança o veículo de outro tenant', () => {
    expect(foreignKeys(fleetVehicleAxles)).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'fleet_vehicle_axles_company_vehicle_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  /** Dois eixos na mesma posição do mesmo veículo é cadastro duplicado, não veículo com gêmeos. */
  test('a posição é única por veículo', () => {
    expect(uniqueColumnsByName(fleetVehicleAxles)).toMatchObject({
      fleet_vehicle_axles_vehicle_position_unique: ['company_id', 'vehicle_id', 'position'],
    })
  })
})
