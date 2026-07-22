import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const CTE_BATCH_SCHEMA_EXPORT_NAMES = [
  'cteBatches',
  'cteBatchItems',
  'cteBatchEvents',
  'cteSubmissionRecords',
] as const

export type CteBatchSchemaExportName = (typeof CTE_BATCH_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: CteBatchSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: CteBatchSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T002 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
