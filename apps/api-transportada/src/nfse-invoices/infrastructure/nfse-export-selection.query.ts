/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { nfseFiscalDocuments } from '../../database/nfse.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type {
  NfseExportDocument,
  NfseExportSelectionPort,
  NfseExportSelectionQuery,
} from '../application/export-nfse-documents.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const xmlObjects = alias(storedObjects, 'nfse_export_xml_objects')
const pdfObjects = alias(storedObjects, 'nfse_export_pdf_objects')

/** O objeto guarda XML fiscal: sem a empresa no join, a exportação levaria arquivo de outro tenant. */
const XML_OBJECT_JOIN = and(
  eq(xmlObjects.companyId, nfseFiscalDocuments.companyId),
  eq(xmlObjects.id, nfseFiscalDocuments.xmlObjectId),
)

/** O PDF é opcional na origem: `leftJoin` porque a nota sem ele ainda tem documento fiscal. */
const PDF_OBJECT_JOIN = and(
  eq(pdfObjects.companyId, nfseFiscalDocuments.companyId),
  eq(pdfObjects.id, nfseFiscalDocuments.pdfObjectId),
)

export function buildNfseExportFilters(input: {
  readonly companyId: string
  readonly invoiceIds: readonly string[]
}): SQL[] {
  return [
    eq(nfseFiscalDocuments.companyId, input.companyId),
    inArray(nfseFiscalDocuments.invoiceId, [...input.invoiceIds]),
  ]
}

export function createNfseExportSelection(database: Database): NfseExportSelectionPort {
  return {
    async listAuthorizedDocuments(
      query: NfseExportSelectionQuery,
    ): Promise<readonly NfseExportDocument[]> {
      const rows = await database
        .select({
          identifier: nfseFiscalDocuments.fiscalNumber,
          pdfBucket: pdfObjects.bucket,
          pdfObjectKey: pdfObjects.objectKey,
          xmlBucket: xmlObjects.bucket,
          xmlObjectKey: xmlObjects.objectKey,
        })
        .from(nfseFiscalDocuments)
        .innerJoin(xmlObjects, XML_OBJECT_JOIN)
        .leftJoin(pdfObjects, PDF_OBJECT_JOIN)
        .where(
          and(
            ...buildNfseExportFilters({
              companyId: query.companyId,
              invoiceIds: query.invoiceIds,
            }),
          ),
        )
        .orderBy(nfseFiscalDocuments.fiscalNumber)
        .limit(query.limit)

      return rows.map((row) => ({
        identifier: row.identifier,
        pdf:
          row.pdfBucket === null || row.pdfObjectKey === null
            ? null
            : { bucket: row.pdfBucket, objectKey: row.pdfObjectKey },
        xml: { bucket: row.xmlBucket, objectKey: row.xmlObjectKey },
      }))
    },
  }
}
