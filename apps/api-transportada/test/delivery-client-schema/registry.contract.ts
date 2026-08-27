/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { getTableColumns } from 'drizzle-orm'

import {
  contractors,
  deliveryChargeEvents,
  deliveryCharges,
  deliveryClientChargeRules,
  deliveryClientExceptions,
  deliveryClientWindows,
  deliveryClients,
  extraChargeBatches,
  municipalHolidays,
  tripStopSchedules,
} from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  foreignKeys,
  indexColumnsByName,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

const TENANT_ANCHORED = [
  { name: 'delivery_clients', table: deliveryClients },
  { name: 'contractors', table: contractors },
  { name: 'municipal_holidays', table: municipalHolidays },
] as const

describe('o cadastro que nasce da nota (spec 060 T002)', () => {
  test('ancora cliente, contratante e feriado na empresa', () => {
    for (const { name, table } of TENANT_ANCHORED) {
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

  /** Um documento, um cadastro: é o unique que torna "dois cadastros para o mesmo CNPJ" impossível. */
  test('o documento é único por empresa, nos dois cadastros', () => {
    expect(uniqueColumnsByName(deliveryClients).delivery_clients_company_tax_id_unique).toEqual([
      'company_id',
      'tax_id',
    ])
    expect(uniqueColumnsByName(contractors).contractors_company_tax_id_unique).toEqual([
      'company_id',
      'tax_id',
    ])
  })

  /**
   * O CNPJ alfanumérico entrou em produção em 01/07/2026: um CHECK só de dígito recusaria emitente
   * com letra na base — que é o caso normal daqui em diante. O CPF continua com onze dígitos.
   */
  test('aceita CNPJ alfanumérico e CPF, e nada além', () => {
    for (const table of [deliveryClients, contractors]) {
      const checks = unqualifiedCheckSqlByName(table)
      const taxIdCheck = Object.entries(checks).find(([name]) => name.endsWith('tax_id_check'))?.[1]
      expect(taxIdCheck).toContain('^[0-9]{11}$|^[A-Z0-9]{12}[0-9]{2}$')
    }
  })

  /**
   * ADR-0048 §1: o cadastro nasce **sem regra**. Se estas colunas fossem `not null` com padrão, toda
   * parada ganharia taxa zero e tempo de atendimento explícitos, e o solver teria de distinguir
   * "sem regra" de "regra preenchida com o padrão" para sempre.
   */
  test('taxa e tempo de atendimento nascem nulos, e nulo quer dizer ausência', () => {
    const types = columnSqlTypes(deliveryClients)
    expect(types.delivery_fee_amount).toBe('numeric(14, 4)')
    expect(types.default_service_time_minutes).toBe('bigint')
  })

  /** Dinheiro é `numeric`, nunca ponto flutuante — nem na expectativa. */
  test('a taxa esperada não é ponto flutuante', () => {
    expect(columnSqlTypes(deliveryClients).delivery_fee_amount).not.toContain('double')
    expect(columnSqlTypes(deliveryClients).delivery_fee_amount).not.toContain('real')
  })

  /**
   * A janela que cruza a meia-noite vira **dois** intervalos, um em cada dia. Aceitar
   * `closes_at < opens_at` faria toda consulta de "abre agora?" carregar a exceção.
   */
  test('a janela é sempre crescente dentro do dia', () => {
    expect(
      unqualifiedCheckSqlByName(deliveryClientWindows).delivery_client_windows_interval_check,
    ).toBe('"opens_at" < "closes_at"')
    expect(
      unqualifiedCheckSqlByName(deliveryClientWindows).delivery_client_windows_weekday_check,
    ).toBe('"weekday" between 0 and 6')
  })

  /** `open` sem horário não diz nada, e `closed` com horário é contradição — o banco recusa os dois. */
  test('a exceção por data é coerente com o que ela declara', () => {
    const check =
      unqualifiedCheckSqlByName(deliveryClientExceptions)
        .delivery_client_exceptions_hours_check ?? ''
    expect(check).toContain(`"kind" = 'closed' and "opens_at" is null`)
    expect(check).toContain(`"kind" = 'open' and "opens_at" is not null`)
  })

  /** O feriado é da cidade, e a chave diz isso: uma data por município por empresa. */
  test('o feriado é único por município e por data', () => {
    expect(uniqueColumnsByName(municipalHolidays).municipal_holidays_company_city_day_unique).toEqual(
      ['company_id', 'city_ibge_code', 'holiday_on'],
    )
    expect(unqualifiedCheckSqlByName(municipalHolidays).municipal_holidays_city_check).toContain(
      '^[0-9]{7}$',
    )
  })

  /** Janela e exceção morrem com o cliente: cadastro apagado que deixasse horário para trás é lixo. */
  test('janela e exceção alcançam o cliente pelo tenant, e caem com ele', () => {
    for (const [table, name] of [
      [deliveryClientWindows, 'delivery_client_windows_client_fk'],
      [deliveryClientExceptions, 'delivery_client_exceptions_client_fk'],
    ] as const) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', 'delivery_client_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'delivery_clients',
        name,
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
    }
  })
})

describe('o repasse: lançamento, regra e lote (spec 060 T003)', () => {
  /** Um agendamento por parada: dois é a portaria recebendo dois protocolos para a mesma carga. */
  test('o agendamento é único por parada e exige hora quando confirmado', () => {
    expect(
      uniqueColumnsByName(tripStopSchedules).trip_stop_schedules_company_stop_unique,
    ).toEqual(['company_id', 'stop_id'])
    expect(
      unqualifiedCheckSqlByName(tripStopSchedules).trip_stop_schedules_confirmed_check,
    ).toBe(`"status" <> 'confirmed' or "scheduled_at" is not null`)
  })

  /**
   * ADR-0048 §5: `suggested` é alcançável **só** pelo que nasceu automático. Lançamento manual entra
   * direto em `recorded`, e o banco recusa a combinação que a máquina de estados não produz.
   */
  test('lançamento manual nunca nasce sugerido', () => {
    expect(
      unqualifiedCheckSqlByName(deliveryCharges).delivery_charges_suggested_origin_check,
    ).toBe(`"status" <> 'suggested' or "origin" <> 'manual'`)
  })

  /** Sugestão dentro de lote seria dinheiro cobrado sem ninguém conferir. */
  test('o lote só aceita o que já passou por gente', () => {
    const check = unqualifiedCheckSqlByName(deliveryCharges).delivery_charges_batch_status_check ?? ''
    expect(check).toContain('"batch_id" is null or')
    expect(check).not.toContain('suggested')
    expect(check).not.toContain(`'recorded'`)
  })

  test('a taxa é numeric e positiva — dinheiro não é ponto flutuante, e zero não é lançamento', () => {
    expect(columnSqlTypes(deliveryCharges).amount).toBe('numeric(14, 4)')
    expect(unqualifiedCheckSqlByName(deliveryCharges).delivery_charges_amount_check).toBe(
      '"amount" > 0',
    )
  })

  /**
   * Taxa de nota cujo emitente ainda não tem cadastro **existe**: ela aparece na lista de "sem
   * contratante" e nunca é atribuída por palpite. Por isso a coluna é anulável.
   */
  test('o lançamento sobrevive sem contratante', () => {
    expect(
      getTableColumns(deliveryCharges).contractorId.notNull,
    ).toBe(false)
    expect(getTableColumns(deliveryCharges).deliveryClientId.notNull).toBe(true)
  })

  /** Duas regras vivas do mesmo tipo gerariam duas sugestões da mesma taxa, toda entrega. */
  test('uma regra viva por cliente e tipo', () => {
    const indexes = indexColumnsByName(deliveryClientChargeRules)
    expect(indexes.delivery_client_charge_rules_active_unique).toEqual([
      'company_id',
      'delivery_client_id',
      'charge_type',
    ])
  })

  /** Token curto é token adivinhável, e esta é a única porta anônima do produto que serve dinheiro. */
  test('o token do lote é único e tem tamanho mínimo', () => {
    expect(
      uniqueColumnsByName(extraChargeBatches).extra_charge_batches_access_token_unique,
    ).toEqual(['access_token'])
    expect(unqualifiedCheckSqlByName(extraChargeBatches).extra_charge_batches_token_check).toBe(
      'length("access_token") >= 32',
    )
  })

  /** ADR-0048 §7: quem decidiu pela página pública é um token, nunca um `userId` inventado. */
  test('a trilha do lançamento aceita decisão por token', () => {
    expect(getTableColumns(deliveryChargeEvents).decidedByToken.notNull).toBe(false)
    expect(getTableColumns(deliveryChargeEvents).actorUserId.notNull).toBe(false)
  })
})
