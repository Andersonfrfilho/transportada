import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const BILLING_SCHEMA_EXPORT_NAMES = [
  'billingInvoices',
  'billingInvoiceItems',
  'billingInvoiceEvents',
  'billingInvoiceDocuments',
  'billingDescriptionTemplates',
] as const

export type BillingSchemaExportName = (typeof BILLING_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: BillingSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: BillingSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T002 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
