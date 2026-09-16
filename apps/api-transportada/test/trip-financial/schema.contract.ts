/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyDriverAllowanceSettings,
  companyTaxSettings,
  fleetDrivers,
  tripCostEntries,
  tripFinancialParcels,
  tripFinancialResults,
  trips,
} from '../../src/database/database.schema.js'
import {
  columnNames,
  columnSqlTypes,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('o resultado congelado da viagem (spec 061 T002)', () => {
  /** Dinheiro na mesma escala de `cte_batch_item_charges`: somar em escalas diferentes perde centavo. */
  test('todo valor é numeric(19, 4)', () => {
    const result = columnSqlTypes(tripFinancialResults)

    for (const column of ['revenue_amount', 'tax_total', 'cost_total', 'net_amount']) {
      expect({ column, type: result[column] }).toEqual({ column, type: 'numeric(19, 4)' })
    }
    expect(columnSqlTypes(tripFinancialParcels).amount).toBe('numeric(19, 4)')
    expect(columnSqlTypes(tripCostEntries).amount).toBe('numeric(19, 4)')
  })

  /** Duas versões vivas seriam duas respostas para "quanto essa viagem deu". */
  test('uma versão viva por viagem, e o histórico fica', () => {
    expect(indexColumnsByName(tripFinancialResults).trip_financial_results_current_unique).toEqual([
      'company_id',
      'trip_id',
    ])
    expect(
      uniqueColumnsByName(tripFinancialResults).trip_financial_results_trip_version_unique,
    ).toEqual(['company_id', 'trip_id', 'version'])
  })

  /** A versão 2 sem explicação é a pergunta "por que esse número mudou?" sem resposta. */
  test('recálculo exige motivo', () => {
    expect(
      unqualifiedCheckSqlByName(tripFinancialResults).trip_financial_results_reason_check,
    ).toBe('"version" = 1 or length("recalculation_reason") > 0')
  })

  /**
   * ADR-0049 §2: parcela desconhecida ou de período é **zero com nome**. Valor ali seria contradição
   * — "não sei quanto foi" com um número do lado.
   */
  test('parcela ausente ou de período não carrega valor', () => {
    expect(
      unqualifiedCheckSqlByName(tripFinancialParcels).trip_financial_parcels_amount_check,
    ).toBe(`("source" in ('missing', 'period') and "amount" = 0) or "amount" >= 0`)
    expect(
      unqualifiedCheckSqlByName(tripFinancialParcels).trip_financial_parcels_source_check,
    ).toContain('period')
  })

  /** Uma parcela por tipo: duas linhas de combustível no mesmo resultado seriam soma dobrada. */
  test('uma parcela por tipo em cada resultado', () => {
    expect(
      uniqueColumnsByName(tripFinancialParcels).trip_financial_parcels_result_kind_unique,
    ).toEqual(['result_id', 'kind'])
  })

  test('o resultado alcança a viagem pelo tenant, nunca por id sozinho', () => {
    expect(foreignKeys(tripFinancialResults)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'trip_financial_results_company_trip_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})

describe('o modelo de pagamento do motorista (ADR-0049 §3)', () => {
  /**
   * As duas metades andam juntas: `fixed` sem valor é salário que ninguém paga, e `route_table` com
   * salário é contradição — ele é pago por rota.
   */
  test('o cadastro recusa modelo pela metade', () => {
    const check = unqualifiedCheckSqlByName(fleetDrivers).fleet_drivers_payment_shape_check ?? ''

    expect(check).toContain(`"payment_model" = 'fixed' and "fixed_amount" is not null`)
    expect(check).toContain('"payment_closing_day" between 1 and 28')
    expect(check).toContain(`"payment_model" = 'route_table' and "fixed_amount" is null`)
  })

  /** O padrão é o agregado: frota que hoje é toda de agregado não precisa mexer em nada. */
  test('o padrão é a tabela de região', () => {
    expect(unqualifiedCheckSqlByName(fleetDrivers).fleet_drivers_payment_model_check).toBe(
      `"payment_model" in ('route_table', 'fixed')`,
    )
  })
})

describe('o regime federal da empresa (ADR-0049 §4)', () => {
  /** Alíquota é fração (0.0065), não percentual: guardar 0,65 multiplicaria a conta por cem. */
  test('a alíquota é fração, e menor que um', () => {
    expect(unqualifiedCheckSqlByName(companyTaxSettings).company_tax_settings_rates_check).toBe(
      '"pis_rate" >= 0 and "pis_rate" < 1 and "cofins_rate" >= 0 and "cofins_rate" < 1',
    )
    expect(columnSqlTypes(companyTaxSettings).pis_rate).toBe('numeric(9, 6)')
  })

  /** Uma linha por empresa: duas seriam duas alíquotas para a mesma receita. */
  test('uma configuração por empresa', () => {
    expect(uniqueColumnsByName(companyTaxSettings).company_tax_settings_company_unique).toEqual([
      'company_id',
    ])
  })
})

describe('a diária do motorista (spec 143 D3, D4 — aceite 8)', () => {
  /**
   * A diária é dinheiro, e dinheiro nesta base é `numeric(19, 4)`: guardar a do motorista noutra
   * escala faria a soma da tripulação perder centavo contra as outras parcelas.
   */
  test('toda diária é numeric(19, 4)', () => {
    expect(columnSqlTypes(fleetDrivers).daily_allowance_amount).toBe('numeric(19, 4)')
    expect(columnSqlTypes(companyDriverAllowanceSettings).daily_allowance_amount).toBe(
      'numeric(19, 4)',
    )
  })

  /** Diária zero ou negativa é motorista que paga para trabalhar: o banco recusa as duas. */
  test('a diária do cadastro é nula ou positiva', () => {
    expect(unqualifiedCheckSqlByName(fleetDrivers).fleet_drivers_daily_allowance_check).toBe(
      '"daily_allowance_amount" is null or "daily_allowance_amount" > 0',
    )
  })

  /** O valor geral existe para ser usado: sem linha vale a constante, e com linha vale um número real. */
  test('o valor geral da empresa é sempre positivo', () => {
    expect(
      unqualifiedCheckSqlByName(companyDriverAllowanceSettings)
        .company_driver_allowance_settings_amount_check,
    ).toBe('"daily_allowance_amount" > 0')
  })

  /**
   * Meia diária está fora do escopo (D4) e viagem de zero dia não existe — a sugestão tem mínimo 1,
   * e o número corrigido na criação obedece ao mesmo piso.
   */
  test('a viagem tem no mínimo uma diária, quando informa alguma', () => {
    expect(unqualifiedCheckSqlByName(trips).trips_daily_allowance_days_check).toBe(
      '"daily_allowance_days" is null or "daily_allowance_days" >= 1',
    )
  })

  /** Uma linha por empresa, e a empresa é a chave: duas seriam dois valores gerais para a mesma frota. */
  test('uma configuração por empresa, com a empresa de chave', () => {
    const companyColumn = getTableConfig(companyDriverAllowanceSettings).columns.find(
      (column) => column.name === 'company_id',
    )

    expect(getTableConfig(companyDriverAllowanceSettings).name).toBe(
      'company_driver_allowance_settings',
    )
    expect(companyColumn?.primary).toBeTrue()
    expect(columnNames(companyDriverAllowanceSettings)).toEqual([
      'company_id',
      'daily_allowance_amount',
      /** Quem mexeu no valor geral — configuração de dinheiro sem autor é mudança sem dono. */
      'updated_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(companyDriverAllowanceSettings)).toEqual(
      columnNames(companyDriverAllowanceSettings),
    )
    expectRequiredUtcTimestamps(companyDriverAllowanceSettings)
  })
})
