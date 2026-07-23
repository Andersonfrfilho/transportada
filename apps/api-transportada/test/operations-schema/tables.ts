import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const OPERATIONS_SCHEMA_EXPORT_NAMES = ['processingJobs', 'auditLogs'] as const

export type OperationsSchemaExportName = (typeof OPERATIONS_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: OperationsSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: OperationsSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T003 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
