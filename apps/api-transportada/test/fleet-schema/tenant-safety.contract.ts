/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  aggregateApplications,
  companyDriverAllowanceSettings,
  companyEnergySettings,
  companyFuelPrices,
  companyTollBoothCharges,
  energyTariffReferences,
  fleetDriverVehicleAssignments,
  fleetDrivers,
  fleetVehicles,
  fuelPriceReferences,
  tollBoothExtracts,
  tollBooths,
  userCompanyMemberships,
  vehicleVolumeReferences,
} from '../../src/database/database.schema.js'
import {
  columnNames,
  columnSqlTypes,
  foreignKeys,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

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
    /** Spec 143 D3: o valor geral da diária é da empresa, e a empresa é a chave da linha. */
    expect(foreignKeys(companyDriverAllowanceSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_driver_allowance_settings_company_id_companies_id_fk',
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
   * ⚠️ **São cinco tabelas sem `company_id`**, e nenhuma delas é "a terceira" — as duas linhas de
   * trabalho que este merge juntou chamavam cada uma a sua assim, porque nasceram em paralelo e
   * nenhuma via a outra. A lista completa é `fuel_price_references`, `energy_tariff_references`,
   * `vehicle_volume_references`, `toll_booths` e `toll_booth_extracts`. Contar de cabeça foi o que
   * produziu as duas afirmações erradas; quem acrescentar a sexta conta as asserções deste arquivo.
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
   * Spec 154 T101/T102: a quinta tabela sem `company_id`, com justificativa **diferente** das
   * outras quatro — não é dado público de mercado, é que o extrato descreve o catálogo, e o
   * catálogo é da instalação (ADR-0021, um deploy por transportadora). Recarregar muda a tarifa
   * que todas as empresas do deploy enxergam.
   *
   * ⚠️ As três primeiras asserções não são redundantes: sem FK e sem `company_id` são os dois
   * negativos de sempre, mas uma tabela sem tenant e sem ator obrigatório seria auditoria de
   * mentira — teria uma coluna de "quem fez" que ninguém garante estar preenchida. As duas
   * seguintes travam o tipo: `uploaded_by_user_id` e `reloaded_by_user_id` são `uuid` sem
   * `references` de propósito — `removeMembership` (spec 149) apaga o usuário de verdade, e
   * `RESTRICT` travaria a remoção enquanto `SET NULL`/`CASCADE` apagaria o ator; ator que some com
   * o usuário deixa de ser auditoria (security.md §10). Esta linha é a única trilha desta ação em
   * toda a API — a mesma assimetria de `nfe_package_box_measurements.measured_by_user_id`.
   */
  test('keeps the toll booth extract tenant-less on purpose, with a mandatory actor unable to reach a company', () => {
    expect(columnNames(tollBoothExtracts)).not.toContain('company_id')
    expect(foreignKeys(tollBoothExtracts)).toEqual([])
    expect(requiredColumnNames(tollBoothExtracts)).toContain('uploaded_by_user_id')
    expect(columnSqlTypes(tollBoothExtracts).uploaded_by_user_id).toBe('uuid')
    expect(columnSqlTypes(tollBoothExtracts).reloaded_by_user_id).toBe('uuid')
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
