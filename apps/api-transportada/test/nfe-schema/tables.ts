import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const NFE_SCHEMA_EXPORT_NAMES = [
  'nfeImports',
  'nfeImportItems',
  'nfeDocuments',
  'nfeParticipants',
  'nfeAddresses',
  'nfeVolumes',
  'nfeProducts',
  'nfeEvents',
  'nfeDistributionCursors',
  'processingOutbox',
  'processedMessages',
  'storedObjects',
] as const

export type NfeSchemaExportName = (typeof NFE_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: NfeSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: NfeSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T011 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
