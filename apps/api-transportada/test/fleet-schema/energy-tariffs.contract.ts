/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyEnergySettings,
  energyTariffReferences,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('energy tariff reference schema', () => {
  test('stores the two published parcels per distributor, recorte and vigência', () => {
    expect(getTableConfig(energyTariffReferences).name).toBe('energy_tariff_references')
    expectGeneratedUuidPrimaryKey(energyTariffReferences)

    expect(columnNames(energyTariffReferences)).toEqual([
      'id',
      'distributor_code',
      'distributor_name',
      'subgroup',
      'modality',
      'effective_from',
      'effective_to',
      'tusd_per_megawatt_hour',
      'te_per_megawatt_hour',
      'collected_at',
    ])
    expect(requiredColumnNames(energyTariffReferences)).toEqual(columnNames(energyTariffReferences))
  })

  /**
   * A unidade está no nome da coluna porque a ANEEL publica em R$/MWh e o veículo consome kWh: uma
   * linha lida na unidade errada entra no banco sem reclamar de nada, e sai mil vezes menor na tela.
   */
  test('names the published unit in the column, and keeps it in exact decimal', () => {
    expect(columnSqlTypes(energyTariffReferences)).toMatchObject({
      collected_at: 'timestamp with time zone',
      distributor_code: 'varchar(40)',
      distributor_name: 'varchar(160)',
      effective_from: 'date',
      effective_to: 'date',
      modality: 'varchar(20)',
      subgroup: 'varchar(10)',
      te_per_megawatt_hour: 'numeric(19, 4)',
      tusd_per_megawatt_hour: 'numeric(19, 4)',
    })
  })

  /**
   * O recorte entra na chave natural mesmo com uma linha só hoje (B3 Convencional): sem ele, uma
   * coleta de outro subgrupo sobrescreveria a tarifa que o veículo usa, e ninguém veria a troca.
   */
  test('makes the distributor, the recorte and the start of vigência the natural key', () => {
    expect(uniqueColumnsByName(energyTariffReferences)).toMatchObject({
      energy_tariff_references_natural_unique: [
        'distributor_code',
        'subgroup',
        'modality',
        'effective_from',
      ],
    })
  })

  test('refuses a parcel that is negative, and a pair that adds up to nothing', () => {
    const checks = checkSqlByName(energyTariffReferences)

    expect(checks.energy_tariff_references_parcel_check).toContain('>= 0')
    expect(checks.energy_tariff_references_parcel_check).toContain('> 0')
  })

  test('refuses a vigência that ends before it starts, and a distributor without a name', () => {
    const checks = checkSqlByName(energyTariffReferences)

    expect(checks.energy_tariff_references_period_check).toContain('>=')
    expect(checks.energy_tariff_references_distributor_check).toContain('upper(')
    expect(checks.energy_tariff_references_scope_check).toContain('length(')
  })
})

describe('company energy settings schema', () => {
  test('holds one distributor and one factor per company', () => {
    expect(getTableConfig(companyEnergySettings).name).toBe('company_energy_settings')
    expectRequiredUtcTimestamps(companyEnergySettings)

    expect(columnNames(companyEnergySettings)).toEqual([
      'company_id',
      'distributor_code',
      'adjustment_factor',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(companyEnergySettings)).toEqual(columnNames(companyEnergySettings))

    // A empresa é a chave: não há linha por distribuidora, e trocar de concessionária é um UPDATE
    const companyColumn = getTableConfig(companyEnergySettings).columns.find(
      (column) => column.name === 'company_id',
    )
    expect(companyColumn?.primary).toBeTrue()
  })

  /**
   * O fator é multiplicador, não dinheiro: a tarifa homologada é seca, e é ele que a empresa
   * declara para chegar ao que a conta de luz cobra. Sem declaração, `1.0000` — não inventamos
   * imposto que não medimos.
   */
  test('defaults the factor to one, in exact decimal', () => {
    expect(columnSqlTypes(companyEnergySettings)).toMatchObject({
      adjustment_factor: 'numeric(6, 4)',
      company_id: 'uuid',
      distributor_code: 'varchar(40)',
    })

    const factor = getTableConfig(companyEnergySettings).columns.find(
      (column) => column.name === 'adjustment_factor',
    )
    expect(factor?.default).toBe('1.0000')
  })

  test('refuses a factor that is not positive and a distributor that is blank', () => {
    const checks = checkSqlByName(companyEnergySettings)

    expect(checks.company_energy_settings_adjustment_factor_check).toContain('> 0')
    expect(checks.company_energy_settings_distributor_code_check).toContain('upper(')
  })
})
