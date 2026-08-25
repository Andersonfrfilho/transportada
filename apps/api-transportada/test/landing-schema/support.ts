import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

export type SchemaTable = Parameters<typeof getTableConfig>[0]

const dialect = new PgDialect()

export const columnNames = (table: SchemaTable): readonly string[] =>
  getTableConfig(table).columns.map((column) => column.name)

export const requiredColumnNames = (table: SchemaTable): readonly string[] =>
  getTableConfig(table)
    .columns.filter((column) => column.notNull)
    .map((column) => column.name)

export const columnSqlTypes = (table: SchemaTable): Readonly<Record<string, string>> =>
  Object.fromEntries(
    getTableConfig(table).columns.map((column) => [column.name, column.getSQLType()]),
  )

export const checkSqlByName = (table: SchemaTable): Readonly<Record<string, string>> =>
  Object.fromEntries(
    getTableConfig(table).checks.map((constraint) => [
      constraint.name,
      dialect.sqlToQuery(constraint.value).sql,
    ]),
  )
