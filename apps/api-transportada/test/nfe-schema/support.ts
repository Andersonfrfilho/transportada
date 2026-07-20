import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

import type { SchemaTable } from '../fiscal-schema/support.js'

const dialect = new PgDialect()

export type IndexDefinition = Readonly<{
  columns: readonly string[]
  isUnique: boolean
  where: string | undefined
}>

export const indexDefinitionsByName = (
  table: SchemaTable,
): Readonly<Record<string, IndexDefinition>> =>
  Object.fromEntries(
    getTableConfig(table).indexes.map((tableIndex) => [
      tableIndex.config.name ?? '',
      {
        columns: tableIndex.config.columns.map((column) => ('name' in column ? column.name : '')),
        isUnique: tableIndex.config.unique,
        where:
          tableIndex.config.where === undefined
            ? undefined
            : dialect.sqlToQuery(tableIndex.config.where).sql,
      },
    ]),
  )

export const primaryKeyColumns = (table: SchemaTable): readonly (readonly string[])[] =>
  getTableConfig(table).primaryKeys.map((primaryKey) =>
    primaryKey.columns.map((column) => column.name),
  )

export const sensitiveColumnNames = [
  'xml',
  'xml_content',
  'pfx',
  'password',
  'certificate',
  'private_key',
  'sefaz_response',
  'raw_error',
] as const
