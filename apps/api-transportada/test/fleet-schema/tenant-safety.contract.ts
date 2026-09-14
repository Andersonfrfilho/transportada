/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  aggregateApplications,
  companyEnergySettings,
  companyFuelPrices,
  companyTollBoothCharges,
  energyTariffReferences,
  fleetDriverVehicleAssignments,
  fleetDrivers,
  fleetVehicles,
  fuelPriceReferences,
  tollBooths,
  userCompanyMemberships,
  vehicleVolumeReferences,
} from '../../src/database/database.schema.js'
import { columnNames, foreignKeys, uniqueColumnsByName } from '../fiscal-schema/support.js'

describe('fleet tenant safety', () => {
  test('anchors every fleet table to a company', () => {
    expect(foreignKeys(fleetVehicles)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'fleet_vehicles_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(fleetDrivers)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'fleet_drivers_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(fleetDriverVehicleAssignments)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'fleet_driver_vehicle_assignments_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(aggregateApplications)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'aggregate_applications_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('anchors the company fuel price adjustment to the tenant', () => {
    expect(foreignKeys(companyFuelPrices)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_fuel_prices_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(companyEnergySettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_energy_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /**
   * Preço publicado pela ANP é dado de mercado, igual para toda empresa da instalação: a tabela não
   * tem `company_id` de propósito, e a ausência é assertada aqui para não passar por esquecimento.
   */
  test('keeps the public reference tenant-less on purpose, and unable to reach a company', () => {
    expect(columnNames(fuelPriceReferences)).not.toContain('company_id')
    expect(foreignKeys(fuelPriceReferences)).toEqual([])
  })

  /**
   * A tarifa homologada da ANEEL é o mesmo caso: pública por distribuidora, sem PII e sem efeito
   * fiscal. A escolha da distribuidora é que é da empresa, e ela mora na outra tabela.
   */
  test('keeps the published tariff tenant-less on purpose, and unable to reach a company', () => {
    expect(columnNames(energyTariffReferences)).not.toContain('company_id')
    expect(foreignKeys(energyTariffReferences)).toEqual([])
  })

  /**
   * ⚠️ **São quatro tabelas sem `company_id`**, e nenhuma delas é "a terceira" — as duas linhas de
   * trabalho que este merge juntou chamavam cada uma a sua assim, porque nasceram em paralelo e
   * nenhuma via a outra. A lista completa é `fuel_price_references`, `energy_tariff_references`,
   * `vehicle_volume_references` e `toll_booths`. Contar de cabeça foi o que produziu as duas
   * afirmações erradas; quem acrescentar a quinta conta as asserções deste arquivo.
   *
   * Spec 090 T1: a praça de pedágio é tarifa pública mapeada no OSM, idêntica para toda
   * instalação, sem PII e sem efeito fiscal.
   *
   * ⚠️ Esta asserção é a razão de a exceção ser **declarada**, e não descoberta. Uma tabela nasce
   * sem tenant por decisão ou por esquecimento, e as duas se parecem no diff; o que as separa é
   * haver uma linha aqui dizendo qual das duas foi.
   */
  test('keeps the toll booth catalogue tenant-less on purpose, and unable to reach a company', () => {
    expect(columnNames(tollBooths)).not.toContain('company_id')
    expect(foreignKeys(tollBooths)).toEqual([])
  })

  /**
   * Spec 095 D1: ao contrário do catálogo acima, o ajuste é decisão de uma transportadora sobre o
   * valor que ela paga — e por isso TEM `company_id`, assertado aqui como âncora ao tenant.
   */
  test('anchors the company toll booth charge adjustment to the tenant', () => {
    expect(foreignKeys(companyTollBoothCharges)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_toll_booth_charges_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /**
   * Spec 093: a cubagem de referência é catálogo de mercado — idêntica para toda instalação, sem
   * PII e sem efeito fiscal. Ela passou tempo sem asserção nenhuma, que é exatamente o
   * esquecimento que estes testes existem para impedir. Se ganhar `company_id`, vira configuração
   * por empresa e a spec muda de tamanho.
   */
  test('keeps the volume reference tenant-less on purpose, and unable to reach a company', () => {
    expect(columnNames(vehicleVolumeReferences)).not.toContain('company_id')
    expect(foreignKeys(vehicleVolumeReferences)).toEqual([])
  })

  // Um motorista de outra empresa não pode herdar o login desta — o vínculo passa pelo tenant
  test('reaches the membership through the tenant, never by id alone', () => {
    expect(uniqueColumnsByName(userCompanyMemberships)).toMatchObject({
      user_company_memberships_id_company_id_unique: ['id', 'company_id'],
    })
    expect(foreignKeys(fleetDrivers)).toContainEqual({
      columns: ['membership_id', 'company_id'],
      foreignColumns: ['id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'fleet_drivers_company_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('makes an assignment unable to point at another tenant driver or vehicle', () => {
    expect(foreignKeys(fleetDriverVehicleAssignments)).toContainEqual({
      columns: ['company_id', 'driver_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_drivers',
      name: 'fleet_driver_vehicle_assignments_company_driver_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(fleetDriverVehicleAssignments)).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'fleet_driver_vehicle_assignments_company_vehicle_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })
})
