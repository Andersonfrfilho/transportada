/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readdir, readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import * as purgeConstants from '../../src/trip-location-purge/domain/trip-location-purge.constant.js'

const API_DATABASE_DIRECTORY = new URL('../../../api-transportada/src/database/', import.meta.url)

type ApiTable = {
  readonly block: string
  readonly hasPosition: boolean
  readonly name: string
}

const TABLE_DECLARATION = /pgTable\(\s*'([a-z0-9_]+)'/g
/** Coluna `latitude` própria ou o conjunto das cinco colunas de posição do evento (spread). */
const POSITION_COLUMN = /\blatitude: numeric\(|\.\.\.buildEventLocationColumns\(\)/

const EXPECTED_STAMPED_TABLES = [
  { table: 'trip_delivery_proofs', timeColumn: 'created_at' },
  { table: 'trip_document_occurrences', timeColumn: 'created_at' },
  { table: 'trip_status_events', timeColumn: 'recorded_at' },
  { table: 'trip_stop_events', timeColumn: 'created_at' },
  { table: 'trip_stop_occurrences', timeColumn: 'created_at' },
]

const EXPECTED_UNSTAMPED_TABLES = [
  'client_delivery_addresses',
  'geocoded_address_corrections',
  'geocoded_addresses',
  'municipality_centroids',
  'toll_booths',
  'trip_location_pings',
  'trip_stops',
]

function parseApiTables(source: string): ApiTable[] {
  const declarations = [...source.matchAll(TABLE_DECLARATION)]

  return declarations.map((declaration, index) => {
    const block = source.slice(
      declaration.index ?? 0,
      declarations[index + 1]?.index ?? source.length,
    )
    return { block, hasPosition: POSITION_COLUMN.test(block), name: declaration[1] ?? '' }
  })
}

async function readApiTables(): Promise<ApiTable[]> {
  const fileNames = (await readdir(API_DATABASE_DIRECTORY)).filter((fileName) =>
    fileName.endsWith('.schema.ts'),
  )
  const sources = await Promise.all(
    fileNames.map((fileName) => readFile(new URL(fileName, API_DATABASE_DIRECTORY), 'utf8')),
  )
  return sources.flatMap(parseApiTables)
}

function readExportedList(exportName: string): readonly Record<string, unknown>[] {
  const value: unknown = Reflect.get(purgeConstants, exportName)
  if (!Array.isArray(value)) {
    throw new Error(`trip-location-purge.constant.ts não exporta a lista ${exportName}`)
  }
  return value as Record<string, unknown>[]
}

function sortedNames(names: readonly unknown[]): string[] {
  return names.map(String).sort()
}

/** O detector é o que dá peso ao contrato de paridade: detector cego faria o contrato passar vazio. */
describe('detector de tabela com posição no schema da API', () => {
  const SYNTHETIC_SCHEMA = `
    export const withOwnColumn = pgTable(
      'with_own_column',
      { latitude: numeric({ precision: 10, scale: 7 }).notNull() },
    )
    export const withSpread = pgTable(
      'with_spread',
      { id: uuid().primaryKey(), ...buildEventLocationColumns() },
    )
    export const withHomeCoordinate = pgTable(
      'with_home_coordinate',
      { homeLatitude: numeric('home_latitude', { precision: 10, scale: 7 }) },
    )
    export const withoutPosition = pgTable('without_position', { id: uuid().primaryKey() })
  `

  test('enxerga coluna própria e o spread das colunas de posição, e só eles', () => {
    const positioned = parseApiTables(SYNTHETIC_SCHEMA)
      .filter((table) => table.hasPosition)
      .map((table) => table.name)

    expect(positioned).toEqual(['with_own_column', 'with_spread'])
  })

  test('enxerga as tabelas reais: as cinco de evento, o ping e os cadastros com coordenada', async () => {
    const positioned = (await readApiTables())
      .filter((table) => table.hasPosition)
      .map((table) => table.name)

    for (const table of [
      ...EXPECTED_STAMPED_TABLES.map((entry) => entry.table),
      'trip_location_pings',
      'client_delivery_addresses',
      'geocoded_addresses',
      'municipality_centroids',
      'toll_booths',
    ]) {
      expect(positioned).toContain(table)
    }
  })
})

/**
 * Spec 196 D8: o expurgo é um job com uma lista de tabelas. Tabela nova com `latitude` que ninguém
 * pôs na lista é coordenada de pessoa que o prazo de noventa dias nunca alcança — e nada falha para
 * avisar. As duas listas são cópia por valor do que o worker enxerga; a API não é importada.
 */
describe('listas do expurgo de posição (spec 196 D8)', () => {
  test('TRIP_LOCATION_STAMPED_TABLES lista as cinco tabelas, cada uma com a sua coluna de tempo', () => {
    const stamped = readExportedList('TRIP_LOCATION_STAMPED_TABLES')

    expect(
      [...stamped].sort((left, right) => String(left.table).localeCompare(String(right.table))),
    ).toEqual(EXPECTED_STAMPED_TABLES)
  })

  test('TRIP_LOCATION_UNSTAMPED_TABLES lista as exclusões, cada uma com o motivo escrito', () => {
    const unstamped = readExportedList('TRIP_LOCATION_UNSTAMPED_TABLES')

    expect(sortedNames(unstamped.map((entry) => entry.table))).toEqual(EXPECTED_UNSTAMPED_TABLES)
    for (const entry of unstamped) {
      expect(typeof entry.reason).toBe('string')
      expect(String(entry.reason).trim().length).toBeGreaterThan(0)
    }
  })

  test('nenhuma tabela está nas duas listas', () => {
    const stamped = readExportedList('TRIP_LOCATION_STAMPED_TABLES').map((entry) => entry.table)
    const unstamped = readExportedList('TRIP_LOCATION_UNSTAMPED_TABLES').map((entry) => entry.table)

    expect(stamped.filter((table) => unstamped.includes(table))).toEqual([])
  })

  test('toda tabela com `latitude` no schema da API está numa das duas listas', async () => {
    const covered = [
      ...readExportedList('TRIP_LOCATION_STAMPED_TABLES'),
      ...readExportedList('TRIP_LOCATION_UNSTAMPED_TABLES'),
    ].map((entry) => entry.table)
    const uncovered = (await readApiTables())
      .filter((table) => table.hasPosition && !covered.includes(table.name))
      .map((table) => table.name)

    expect(uncovered).toEqual([])
  })

  /** Lista que cita tabela renomeada ou removida na API deixa o expurgo varrendo o que não existe. */
  test('toda tabela das listas existe no schema da API', async () => {
    const apiTables = (await readApiTables()).map((table) => table.name)
    const listed = [
      ...readExportedList('TRIP_LOCATION_STAMPED_TABLES'),
      ...readExportedList('TRIP_LOCATION_UNSTAMPED_TABLES'),
    ].map((entry) => String(entry.table))

    expect(listed.filter((table) => !apiTables.includes(table))).toEqual([])
  })

  test('toda tabela carimbada tem na API a coluna de tempo que o expurgo varre e a posição', async () => {
    const apiTables = await readApiTables()

    for (const entry of readExportedList('TRIP_LOCATION_STAMPED_TABLES')) {
      const apiTable = apiTables.find((candidate) => candidate.name === entry.table)

      expect(apiTable?.hasPosition).toBeTrue()
      expect(apiTable?.block).toContain(`timestamp('${String(entry.timeColumn)}'`)
    }
  })
})
