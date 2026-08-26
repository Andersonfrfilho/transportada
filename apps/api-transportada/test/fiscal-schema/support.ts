import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { expect } from 'bun:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'

export type SchemaTable = Parameters<typeof getTableConfig>[0]

const dialect = new PgDialect()
const migrationsDirectory = new URL('../../drizzle/', import.meta.url)

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

/**
 * O mesmo CHECK, com o nome da tabela removido de cada coluna. O dialeto qualifica tudo
 * (`"trip_stops"."latitude"`), e uma asserção que carrega o prefixo passa a falhar quando a tabela é
 * renomeada — o que não é o que ela quer dizer.
 */
export const unqualifiedCheckSqlByName = (table: SchemaTable): Readonly<Record<string, string>> => {
  const tableName = getTableConfig(table).name
  return Object.fromEntries(
    Object.entries(checkSqlByName(table)).map(([name, sql]) => [
      name,
      sql.replaceAll(`"${tableName}".`, ''),
    ]),
  )
}

export const uniqueColumnsByName = (
  table: SchemaTable,
): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(
    getTableConfig(table).uniqueConstraints.map((constraint) => [
      constraint.name,
      constraint.columns.map((column) => column.name),
    ]),
  )

export const indexColumnsByName = (
  table: SchemaTable,
): Readonly<Record<string, readonly string[]>> =>
  Object.fromEntries(
    getTableConfig(table).indexes.map((tableIndex) => [
      tableIndex.config.name ?? '',
      tableIndex.config.columns.map((column) => ('name' in column ? column.name : '')),
    ]),
  )

export const uniqueIndexWhereSqlByName = (table: SchemaTable): Readonly<Record<string, string>> =>
  Object.fromEntries(
    getTableConfig(table)
      .indexes.filter((tableIndex) => tableIndex.config.unique)
      .map((tableIndex) => [
        tableIndex.config.name ?? '',
        tableIndex.config.where === undefined
          ? ''
          : dialect.sqlToQuery(tableIndex.config.where).sql,
      ]),
  )

export const foreignKeys = (
  table: SchemaTable,
): readonly Readonly<{
  columns: readonly string[]
  foreignColumns: readonly string[]
  foreignTable: string
  name: string
  onDelete: string | undefined
  onUpdate: string | undefined
}>[] =>
  getTableConfig(table).foreignKeys.map((foreignKey) => {
    const reference = foreignKey.reference()

    return {
      columns: reference.columns.map((column) => column.name),
      foreignColumns: reference.foreignColumns.map((column) => column.name),
      foreignTable: getTableConfig(reference.foreignTable).name,
      name: foreignKey.getName(),
      onDelete: foreignKey.onDelete,
      onUpdate: foreignKey.onUpdate,
    }
  })

export const expectGeneratedUuidPrimaryKey = (table: SchemaTable): void => {
  const idColumn = getTableConfig(table).columns.find((column) => column.name === 'id')

  expect(idColumn?.getSQLType()).toBe('uuid')
  expect(idColumn?.primary).toBeTrue()
  expect(idColumn?.notNull).toBeTrue()
  expect(idColumn?.hasDefault).toBeTrue()
}

export const expectRequiredUtcTimestamps = (table: SchemaTable): void => {
  const timestampColumns = getTableConfig(table).columns.filter((column) =>
    ['created_at', 'updated_at'].includes(column.name),
  )

  expect(timestampColumns.length).toBeGreaterThan(0)
  for (const column of timestampColumns) {
    expect(column.getSQLType()).toBe('timestamp with time zone')
    expect(column.notNull).toBeTrue()
    expect(column.hasDefault).toBeTrue()
  }
}

export const readFiscalMigrationSql = async (): Promise<string> => {
  const migrationDirectories = await readdir(migrationsDirectory, { withFileTypes: true })
  const migrationSqlFiles = await Promise.all(
    migrationDirectories
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) =>
        Bun.file(join(migrationsDirectory.pathname, entry.name, 'migration.sql')).text(),
      ),
  )
  const fiscalMigrations = migrationSqlFiles.filter((sql) =>
    sql.includes('CREATE TABLE "audit_logs"'),
  )

  expect(fiscalMigrations).toHaveLength(1)
  return fiscalMigrations[0] ?? ''
}
