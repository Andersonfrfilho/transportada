/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 234 D3 (T1.5): o momento da entrega da nota e da pontualidade é uma expressão só, e o índice
 * é montado com ela. Expressão diferente da do índice (outra ordem, outro cast) não quebra nenhum
 * teste de banco vazio — só faz o filtro da janela da nota voltar a varrer a tabela.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { is, SQL } from 'drizzle-orm'

import { tripDeliveryProofs, tripStopEvents } from '../../src/database/database.schema.js'
import { deliveredMomentSql } from '../../src/database/delivered-moment.support.js'
import { columnSqlTypes, requiredColumnNames } from '../fiscal-schema/support.js'

const dialect = new PgDialect()
const NEW_INDEX = 'trip_stop_events_company_delivered_moment_idx'
const OLD_INDEX = 'trip_stop_events_company_delivered_at_idx'

function indexExpression(name: string): string {
  const index = getTableConfig(tripStopEvents).indexes.find(
    (candidate) => candidate.config.name === name,
  )
  const [, expression] = index?.config.columns ?? []

  return is(expression, SQL) ? dialect.sqlToQuery(expression).sql : ''
}

describe('o momento da entrega (spec 234 D3)', () => {
  test('é a hora corrigida, senão a leitura do GPS, senão o recebimento — nessa ordem', () => {
    expect(dialect.sqlToQuery(deliveredMomentSql(tripStopEvents)).sql).toBe(
      'coalesce("trip_stop_events"."occurred_at", "trip_stop_events"."captured_at", "trip_stop_events"."recorded_at")',
    )
  })

  test('o índice novo usa a mesma expressão da consulta, e o antigo continua', () => {
    expect(indexExpression(NEW_INDEX)).toBe(
      dialect.sqlToQuery(deliveredMomentSql(tripStopEvents)).sql,
    )
    expect(indexExpression(OLD_INDEX)).toBe(
      'coalesce("trip_stop_events"."captured_at", "trip_stop_events"."recorded_at")',
    )
  })

  test('as colunas novas são anuláveis e o desvio é bigint, sem teto no esquema', () => {
    expect(columnSqlTypes(tripStopEvents)).toMatchObject({
      clock_offset_ms: 'bigint',
      occurred_at: 'timestamp with time zone',
    })
    expect(columnSqlTypes(tripDeliveryProofs)).toMatchObject({ clock_offset_ms: 'bigint' })
    expect(requiredColumnNames(tripStopEvents)).not.toContain('occurred_at')
    expect(requiredColumnNames(tripStopEvents)).not.toContain('clock_offset_ms')
    expect(requiredColumnNames(tripDeliveryProofs)).not.toContain('clock_offset_ms')
  })
})
