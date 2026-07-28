import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const CTE_ISSUANCE_SCHEMA_EXPORT_NAMES = [
  'cteIssuanceAttempts',
  'cteFiscalDocuments',
  'cteIssuanceEvents',
  'cteRetrySchedules',
  'cteIssuancePayloads',
  'cteProcessedMessages',
] as const

export type CteIssuanceSchemaExportName = (typeof CTE_ISSUANCE_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: CteIssuanceSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: CteIssuanceSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T004 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
