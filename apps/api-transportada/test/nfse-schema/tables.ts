/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import * as databaseSchemaExports from '../../src/database/database.schema.js'

import type { SchemaTable } from '../fiscal-schema/support.js'

export const NFSE_SCHEMA_EXPORT_NAMES = [
  'nfseEmissionProfiles',
  'nfseProviderCredentials',
  'nfseServiceInvoices',
  'nfseServiceInvoiceDocuments',
  'nfseServiceInvoiceCharges',
  'nfseIssuanceAttempts',
  'nfseIssuanceEvents',
  'nfseIssuancePayloads',
  'nfseFiscalDocuments',
  'nfseProcessedMessages',
  'nfseIssuanceOutbox',
] as const

export type NfseSchemaExportName = (typeof NFSE_SCHEMA_EXPORT_NAMES)[number]

const schemaExports: Readonly<Record<string, unknown>> = databaseSchemaExports

export const readSchemaExport = (name: NfseSchemaExportName): unknown => schemaExports[name]

export const requireSchemaTable = (name: NfseSchemaExportName): SchemaTable => {
  const table = readSchemaExport(name)

  if (table === undefined) {
    throw new Error(`T005 schema implementation is missing database export: ${name}`)
  }

  return table as SchemaTable
}
