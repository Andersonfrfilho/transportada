/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { is } from 'drizzle-orm'
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core'

import * as tripExecutionSchema from '../../src/database/trip-execution.schema.js'

type ExpectedColumn = { readonly name: string; readonly sqlType: string }

/** Tipos iguais aos da API (`event-location.schema.ts`): a cópia não reinterpreta precisão nenhuma. */
const LATITUDE: ExpectedColumn = { name: 'latitude', sqlType: 'numeric(10, 7)' }
const LONGITUDE: ExpectedColumn = { name: 'longitude', sqlType: 'numeric(10, 7)' }
const ACCURACY: ExpectedColumn = { name: 'accuracy_meters', sqlType: 'numeric(10, 2)' }
const CAPTURED_AT: ExpectedColumn = { name: 'captured_at', sqlType: 'timestamp with time zone' }
const LOCATION_STATE: ExpectedColumn = { name: 'location_state', sqlType: 'varchar(16)' }

const FULL_POSITION = [LATITUDE, LONGITUDE, ACCURACY, CAPTURED_AT, LOCATION_STATE]
/** A foto do comprovante guarda o próprio `captured_at` (horário declarado), que o expurgo não toca. */
const PROOF_POSITION = [LATITUDE, LONGITUDE, ACCURACY, LOCATION_STATE]

const STAMPED_TABLES = [
  {
    columns: FULL_POSITION,
    exportName: 'tripStopEvents',
    table: 'trip_stop_events',
    timeColumn: 'created_at',
  },
  {
    columns: PROOF_POSITION,
    exportName: 'tripDeliveryProofs',
    table: 'trip_delivery_proofs',
    timeColumn: 'created_at',
  },
  {
    columns: FULL_POSITION,
    exportName: 'tripStatusEvents',
    table: 'trip_status_events',
    timeColumn: 'recorded_at',
  },
  {
    columns: FULL_POSITION,
    exportName: 'tripStopOccurrences',
    table: 'trip_stop_occurrences',
    timeColumn: 'created_at',
  },
  {
    columns: FULL_POSITION,
    exportName: 'tripDocumentOccurrences',
    table: 'trip_document_occurrences',
    timeColumn: 'created_at',
  },
] as const

function readTable(exportName: string): PgTable {
  const value: unknown = Reflect.get(tripExecutionSchema, exportName)
  if (!is(value, PgTable)) {
    throw new Error(`trip-execution.schema.ts não declara a tabela exportada como ${exportName}`)
  }
  return value
}

/**
 * Spec 196 D8: o expurgo varre as cinco tabelas de evento com ponto, e só consegue apagar a posição
 * de uma tabela que a cópia do schema do worker declara. Tabela ausente aqui é tabela que o
 * expurgo não enxerga — e a retenção de noventa dias prometida em `docs/SECURITY.md` não a alcança.
 */
describe('cópia do schema das cinco tabelas de evento com ponto (spec 196 D8)', () => {
  for (const expected of STAMPED_TABLES) {
    test(`${expected.table} declara id, ${expected.timeColumn} e a posição com os tipos da API`, () => {
      const config = getTableConfig(readTable(expected.exportName))
      const columnByName = new Map(config.columns.map((column) => [column.name, column]))

      expect(config.name).toBe(expected.table)
      expect(columnByName.get('id')?.getSQLType()).toBe('uuid')
      expect(columnByName.get(expected.timeColumn)?.getSQLType()).toBe('timestamp with time zone')
      expect(columnByName.get(expected.timeColumn)?.notNull).toBeTrue()

      for (const column of expected.columns) {
        expect(columnByName.get(column.name)?.getSQLType()).toBe(column.sqlType)
        expect(columnByName.get(column.name)?.notNull).toBeFalse()
      }
    })
  }
})
