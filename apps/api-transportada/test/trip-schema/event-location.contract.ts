/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196 D2 / ADR-0081 §2: o evento diz o estado do próprio ponto. Dois blocos — as duas tabelas
 * que já tinham as quatro colunas de ponto (`trip_stop_events` e `trip_delivery_proofs`), e as três
 * que não tinham coluna nenhuma e nascem com as cinco (T1.1).
 *
 * Sem o estado, "o GPS falhou", "o prazo apagou" e "não era toque do motorista" são o mesmo `null`,
 * e a tela teria de adivinhar pela idade e pelo tipo. `null` continua sendo **não se aplica** — e é
 * de propósito que ele não vira `unavailable` no histórico: o banco não sabe se o GPS falhou ou se
 * o app daquela época nem pedia posição.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  EVENT_LOCATION_STATES,
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../src/database/database.schema.js'
import {
  columnSqlTypes,
  indexColumnsByName,
  indexWhereSqlByName,
  unqualifiedCheckSqlByName,
} from '../fiscal-schema/support.js'

const LOCATED_EVENT_TABLES = [
  ['trip_stop_events', tripStopEvents],
  ['trip_delivery_proofs', tripDeliveryProofs],
] as const

describe('o estado do ponto do evento (spec 196 D2, ADR-0081 §2)', () => {
  test('os três estados são os da D2, sem ENUM nativo', () => {
    expect(Object.values(EVENT_LOCATION_STATES)).toEqual(['captured', 'unavailable', 'expired'])
  })

  test.each(LOCATED_EVENT_TABLES)(
    '%s tem location_state varchar(16) anulável',
    (_tableName, table) => {
      const column = getTableConfig(table).columns.find(
        (candidate) => candidate.name === 'location_state',
      )

      expect(columnSqlTypes(table).location_state).toBe('varchar(16)')
      expect(column?.notNull).toBe(false)
      expect(column?.hasDefault).toBe(false)
    },
  )

  test.each(LOCATED_EVENT_TABLES)('%s restringe o estado ao conjunto', (tableName, table) => {
    const checkSql = unqualifiedCheckSqlByName(table)[`${tableName}_location_state_check`]

    expect(checkSql).toBe(
      `"location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')`,
    )
  })

  /**
   * O texto é afirmado inteiro de propósito: a primeira versão deste CHECK abria com
   * `"location_state" is null or`, o que o fazia aceitar exatamente a linha que ele diz barrar —
   * coordenada com estado nulo. `is not distinct from` é a única forma que não devolve `NULL`, e
   * CHECK que avalia `NULL` passa em Postgres.
   */
  test.each(LOCATED_EVENT_TABLES)(
    '%s amarra captured à existência da coordenada, sem buraco de NULL',
    (tableName, table) => {
      const checkSql =
        unqualifiedCheckSqlByName(table)[`${tableName}_location_state_consistency_check`]

      expect(checkSql).toBe(
        `("location_state" is not distinct from 'captured') = ("latitude" is not null)`,
      )
      expect(checkSql).not.toContain('is null or')
    },
  )
})

/**
 * As três tabelas que não tinham coluna de posição nenhuma (T1.1, `plan.md` §Dados). Cada uma indexa
 * pela **sua** coluna de tempo: `trip_status_events` não tem `created_at`, e as duas de ocorrência
 * não têm `recorded_at` — um índice copiado da tabela vizinha nem compila.
 */
const NEWLY_LOCATED_EVENT_TABLES = [
  ['trip_status_events', tripStatusEvents, 'recorded_at'],
  ['trip_stop_occurrences', tripStopOccurrences, 'created_at'],
  ['trip_document_occurrences', tripDocumentOccurrences, 'created_at'],
] as const

const POSITION_COLUMN_SQL_TYPES = {
  accuracy_meters: 'numeric(10, 2)',
  captured_at: 'timestamp with time zone',
  latitude: 'numeric(10, 7)',
  location_state: 'varchar(16)',
  longitude: 'numeric(10, 7)',
} as const

describe('as três tabelas que ganham posição agora (spec 196 T1.1)', () => {
  test.each(NEWLY_LOCATED_EVENT_TABLES)(
    '%s ganha as cinco colunas de posição, todas anuláveis e sem default',
    (_tableName, table) => {
      const sqlTypes = columnSqlTypes(table)
      const { columns } = getTableConfig(table)

      for (const [columnName, sqlType] of Object.entries(POSITION_COLUMN_SQL_TYPES)) {
        const column = columns.find((candidate) => candidate.name === columnName)

        expect(sqlTypes[columnName]).toBe(sqlType)
        expect(column?.notNull).toBe(false)
        expect(column?.hasDefault).toBe(false)
      }
    },
  )

  test.each(NEWLY_LOCATED_EVENT_TABLES)(
    '%s amarra a coordenada: par completo, faixa do globo e precisão só com ponto',
    (tableName, table) => {
      const checkSql = unqualifiedCheckSqlByName(table)

      expect(checkSql[`${tableName}_coordinates_check`]).toBe(
        `("latitude" is null) = ("longitude" is null)`,
      )
      expect(checkSql[`${tableName}_latitude_range_check`]).toBe(
        `"latitude" is null or "latitude" between -90 and 90`,
      )
      expect(checkSql[`${tableName}_longitude_range_check`]).toBe(
        `"longitude" is null or "longitude" between -180 and 180`,
      )
      expect(checkSql[`${tableName}_accuracy_check`]).toBe(
        `"accuracy_meters" is null or "latitude" is not null`,
      )
    },
  )

  test.each(NEWLY_LOCATED_EVENT_TABLES)(
    '%s restringe o estado ao conjunto e amarra captured à coordenada, sem buraco de NULL',
    (tableName, table) => {
      const checkSql = unqualifiedCheckSqlByName(table)

      expect(checkSql[`${tableName}_location_state_check`]).toBe(
        `"location_state" is null or "location_state" in ('captured', 'unavailable', 'expired')`,
      )
      expect(checkSql[`${tableName}_location_state_consistency_check`]).toBe(
        `("location_state" is not distinct from 'captured') = ("latitude" is not null)`,
      )
      expect(checkSql[`${tableName}_location_state_consistency_check`]).not.toContain('is null or')
    },
  )

  /**
   * Os dois CHECKs de canal entram **só** nestas três: elas nascem sem nenhuma linha com coordenada,
   * então nada antigo pode reprovar. Em `trip_stop_events` o de estado depende de uma contagem em
   * produção que ainda não foi feita (staging deu zero) — o achado está em `evidence.md`.
   */
  test.each(NEWLY_LOCATED_EVENT_TABLES)(
    '%s só aceita coordenada do motorista (app ou WhatsApp), e estado só de canal que pede posição',
    (tableName, table) => {
      const checkSql = unqualifiedCheckSqlByName(table)

      expect(checkSql[`${tableName}_coordinates_channel_check`]).toBe(
        `"latitude" is null or "channel" in ('driver_app', 'whatsapp')`,
      )
      expect(checkSql[`${tableName}_location_state_channel_check`]).toBe(
        `"location_state" is null or "channel" in ('driver_app', 'whatsapp')`,
      )
    },
  )

  test.each(NEWLY_LOCATED_EVENT_TABLES)(
    '%s indexa só o que tem ponto, pela coluna de tempo da própria tabela',
    (tableName, table, timeColumn) => {
      const indexName = `${tableName}_located_${timeColumn}_idx`

      expect(indexColumnsByName(table)[indexName]).toEqual([timeColumn])
      expect(indexWhereSqlByName(table)[indexName]).toBe(`"${tableName}"."latitude" is not null`)
    },
  )
})
