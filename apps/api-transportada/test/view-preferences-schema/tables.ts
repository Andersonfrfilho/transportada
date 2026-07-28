import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const VIEW_PREFERENCES_SCHEMA_EXPORT_NAMES = ['viewPreferences'] as const

export type ViewPreferencesSchemaExportName = (typeof VIEW_PREFERENCES_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: ViewPreferencesSchemaExportName): unknown =>
  schemaExports[name]

export const requireSchemaTable = (name: ViewPreferencesSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`view-preferences schema is missing database export: ${name}`)
  }

  return table as SchemaTable
}
