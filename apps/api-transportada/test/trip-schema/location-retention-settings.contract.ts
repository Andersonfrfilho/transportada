/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 239 D1: a configuração do expurgo da posição é uma linha por empresa, e a ausência dela é o
 * padrão seguro — desligado, 90 dias. O banco é a última barreira da faixa 30–90 e da carência: a
 * tela e a API validam antes, mas um `UPDATE` à mão não pode ligar o expurgo sem data de início nem
 * com prazo fora da faixa.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  LOCATION_RETENTION_MAX_DAYS,
  LOCATION_RETENTION_MIN_DAYS,
} from '../../src/shared/location-retention.constant.js'
import {
  companyLocationRetentionSettings,
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../src/database/database.schema.js'
import {
  columnNames,
  columnSqlTypes,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  indexWhereSqlByName,
  requiredColumnNames,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

const findColumn = (
  name: string,
): ReturnType<typeof getTableConfig>['columns'][number] | undefined =>
  getTableConfig(companyLocationRetentionSettings).columns.find((column) => column.name === name)

describe('a configuração do expurgo da posição (spec 239 D1)', () => {
  test('uma linha por empresa, com a empresa de chave', () => {
    expect(getTableConfig(companyLocationRetentionSettings).name).toBe(
      'company_location_retention_settings',
    )
    expect(findColumn('company_id')?.primary).toBeTrue()
    expect(columnNames(companyLocationRetentionSettings)).toEqual([
      'company_id',
      'purge_enabled',
      'retention_days',
      'purge_effective_at',
      /** Quem decidiu apagar dado pessoal — configuração assim sem autor é mudança sem dono. */
      'updated_by_user_id',
      'created_at',
      'updated_at',
    ])
    expect(requiredColumnNames(companyLocationRetentionSettings)).toEqual([
      'company_id',
      'purge_enabled',
      'retention_days',
      'updated_by_user_id',
      'created_at',
      'updated_at',
    ])
    expectRequiredUtcTimestamps(companyLocationRetentionSettings)
  })

  test('nasce desligado e com o teto de 90 dias, sem ENUM nativo', () => {
    expect(columnSqlTypes(companyLocationRetentionSettings)).toMatchObject({
      purge_enabled: 'boolean',
      retention_days: 'integer',
      purge_effective_at: 'timestamp with time zone',
    })
    expect(findColumn('purge_enabled')?.default).toBe(false)
    expect(findColumn('retention_days')?.default).toBe(90)
    expect(findColumn('retention_days')?.default).toBe(LOCATION_RETENTION_MAX_DAYS)
  })

  /** A carência mora no campo: anulável porque desligado não o lê, e sem default para ninguém esquecer. */
  test('a data de início do expurgo é anulável e sem padrão', () => {
    expect(findColumn('purge_effective_at')?.notNull).toBeFalse()
    expect(findColumn('purge_effective_at')?.hasDefault).toBeFalse()
  })

  test('o schema lê a faixa de uma constante neutra, sem importar do domínio de companies', async () => {
    const source = await Bun.file(
      new URL('../../src/database/company-location-retention-settings.schema.ts', import.meta.url),
    ).text()

    expect(source).toContain("from '../shared/location-retention.constant.js'")
    expect(source).not.toContain('/companies/')
  })

  test('o banco recusa prazo fora de 30 a 90 dias', () => {
    expect(LOCATION_RETENTION_MIN_DAYS).toBe(30)
    expect(LOCATION_RETENTION_MAX_DAYS).toBe(90)
    expect(
      unqualifiedCheckSqlByName(companyLocationRetentionSettings)
        .company_location_retention_settings_retention_days_check,
    ).toBe('"retention_days" between 30 and 90')
  })

  /** Ligado sem data seria a tela dizendo "ligado" com o worker ignorando a empresa para sempre. */
  test('o banco recusa expurgo ligado sem data de início', () => {
    expect(
      unqualifiedCheckSqlByName(companyLocationRetentionSettings)
        .company_location_retention_settings_effective_at_check,
    ).toBe('not "purge_enabled" or "purge_effective_at" is not null')
  })

  /** A única FK é a da empresa: o autor fica sem FK para o rastro sobreviver ao usuário. */
  test('ancora a linha na empresa, e só nela', () => {
    expect(foreignKeys(companyLocationRetentionSettings)).toEqual([
      {
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: 'company_location_retention_settings_company_id_companies_id_fk',
        onDelete: 'restrict',
        onUpdate: 'cascade',
      },
    ])
  })
})

/**
 * Spec 239 D1/D2: o expurgo e a contagem de impacto filtram por empresa antes da data. Cada tabela
 * de evento ganha o índice `(company_id, <tempo>)` só das linhas com ponto, pela coluna de tempo que
 * o worker usa nela — `trip_status_events` não tem `created_at`.
 */
describe('o índice por empresa do expurgo (spec 239 D1)', () => {
  const companyIndexedTables = [
    ['trip_stop_events', tripStopEvents, 'created_at'],
    ['trip_delivery_proofs', tripDeliveryProofs, 'created_at'],
    ['trip_status_events', tripStatusEvents, 'recorded_at'],
    ['trip_stop_occurrences', tripStopOccurrences, 'created_at'],
    ['trip_document_occurrences', tripDocumentOccurrences, 'created_at'],
  ] as const

  test('as cinco tabelas de evento têm o índice parcial por empresa e tempo', () => {
    expect(companyIndexedTables).toHaveLength(5)
    for (const [tableName, table, timeColumn] of companyIndexedTables) {
      const indexName = `${tableName}_company_located_${timeColumn}_idx`

      expect(indexColumnsByName(table)[indexName]).toEqual(['company_id', timeColumn])
      expect(indexWhereSqlByName(table)[indexName]).toBe(`"${tableName}"."latitude" is not null`)
    }
  })

  /** O índice só por tempo continua: a rotina de hoje ainda varre por data, sem a junção por empresa. */
  test('o índice só por tempo continua ao lado', () => {
    for (const [tableName, table, timeColumn] of companyIndexedTables) {
      expect(indexColumnsByName(table)[`${tableName}_located_${timeColumn}_idx`]).toEqual([
        timeColumn,
      ])
    }
  })
})
