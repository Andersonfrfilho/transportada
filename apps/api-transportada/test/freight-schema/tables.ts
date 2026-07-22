import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const FREIGHT_SCHEMA_EXPORT_NAMES = [
  'freightRules',
  'freightRuleVersions',
  'freightCalculations',
] as const

export type FreightSchemaExportName = (typeof FREIGHT_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: FreightSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: FreightSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T003 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
