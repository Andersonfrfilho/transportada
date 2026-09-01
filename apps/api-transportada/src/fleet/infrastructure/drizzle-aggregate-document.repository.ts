/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { aggregateApplications, aggregateDocuments } from '../../database/database.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type {
  AggregateDocumentDeclaredFields,
  AggregateDocumentRepositoryPort,
} from '../application/aggregate-document.port.js'
import { listAggregateDocumentDivergences } from '../domain/aggregate-document-ocr.policy.js'

function readDeclaredText(declaredData: unknown, path: readonly [string, string]): string | null {
  if (typeof declaredData !== 'object' || declaredData === null) return null
  const group = (declaredData as Record<string, unknown>)[path[0]]
  if (typeof group !== 'object' || group === null) return null
  const value = (group as Record<string, unknown>)[path[1]]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

export type AggregateDocumentDatabase = ReturnType<typeof createDrizzleProvider>['db']

/** O que foi gravado é `Record<string, string | null>`; qualquer outra coisa não é leitura de OCR. */
function readExtractedFields(value: unknown): Readonly<Record<string, string | null>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string | null] => typeof entry[1] === 'string' || entry[1] === null,
  )
  return entries.length === 0 ? null : Object.fromEntries(entries)
}

const DOCUMENT_FIELDS = {
  createdAt: aggregateDocuments.createdAt,
  id: aggregateDocuments.id,
  rejectionReason: aggregateDocuments.rejectionReason,
  status: aggregateDocuments.status,
  type: aggregateDocuments.type,
  updatedAt: aggregateDocuments.updatedAt,
} as const

async function queryDeclaredFields(input: {
  readonly companyId: string
  readonly database: AggregateDocumentDatabase
  readonly taxId: string
}): Promise<AggregateDocumentDeclaredFields> {
  const { companyId, database, taxId } = input
  const [row] = await database
    .select({
      declaredData: aggregateApplications.declaredData,
      name: aggregateApplications.name,
    })
    .from(aggregateApplications)
    .where(
      and(eq(aggregateApplications.companyId, companyId), eq(aggregateApplications.taxId, taxId)),
    )
    .limit(1)

  if (row === undefined) {
    return {
      licenseCategory: null,
      licenseNumber: null,
      name: null,
      plate: null,
      renavam: null,
    }
  }

  return {
    licenseCategory: readDeclaredText(row.declaredData, ['driver', 'licenseCategory']),
    licenseNumber: readDeclaredText(row.declaredData, ['driver', 'licenseNumber']),
    name: row.name.trim().length > 0 ? row.name : null,
    plate: readDeclaredText(row.declaredData, ['vehicle', 'plate']),
    renavam: readDeclaredText(row.declaredData, ['vehicle', 'renavam']),
  }
}

export function createDrizzleAggregateDocumentRepository(
  database: AggregateDocumentDatabase,
): AggregateDocumentRepositoryPort {
  return {
    findDeclaredFields({ companyId, taxId }) {
      return queryDeclaredFields({ companyId, database, taxId })
    },

    async findDownloadLocation({ companyId, id }) {
      const [row] = await database
        .select({ bucket: storedObjects.bucket, objectKey: storedObjects.objectKey })
        .from(aggregateDocuments)
        .innerJoin(
          storedObjects,
          and(
            eq(storedObjects.companyId, aggregateDocuments.companyId),
            eq(storedObjects.id, aggregateDocuments.storedObjectId),
          ),
        )
        .where(and(eq(aggregateDocuments.companyId, companyId), eq(aggregateDocuments.id, id)))
        .limit(1)
      return row ?? null
    },

    async listByTaxId({ companyId, taxId }) {
      return database
        .select(DOCUMENT_FIELDS)
        .from(aggregateDocuments)
        .where(
          and(eq(aggregateDocuments.companyId, companyId), eq(aggregateDocuments.taxId, taxId)),
        )
    },

    async listPendingByCompany({ companyId }) {
      const rows = await database
        .select({
          ...DOCUMENT_FIELDS,
          extractedFields: aggregateDocuments.extractedFields,
          taxId: aggregateDocuments.taxId,
        })
        .from(aggregateDocuments)
        .where(
          and(
            eq(aggregateDocuments.companyId, companyId),
            eq(aggregateDocuments.status, 'pending'),
          ),
        )

      // A ficha só é lida quando há leitura de OCR para comparar — sem ela não há divergência
      // possível, e a fila de revisão não paga consulta que não vai usar.
      return Promise.all(
        rows.map(async ({ extractedFields, ...document }) => {
          const extracted = readExtractedFields(extractedFields)
          if (extracted === null) {
            return { ...document, divergences: [], hasExtraction: false }
          }

          const declared = await queryDeclaredFields({ companyId, database, taxId: document.taxId })
          return {
            ...document,
            divergences: listAggregateDocumentDivergences({ declared, extracted }),
            hasExtraction: true,
          }
        }),
      )
    },

    async saveExtractedFields({ companyId, extractedFields, id }) {
      await database
        .update(aggregateDocuments)
        .set({ extractedFields, updatedAt: new Date() })
        .where(and(eq(aggregateDocuments.companyId, companyId), eq(aggregateDocuments.id, id)))
    },

    async markAutoApproved({ companyId, id }) {
      await database
        .update(aggregateDocuments)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(and(eq(aggregateDocuments.companyId, companyId), eq(aggregateDocuments.id, id)))
    },

    async review({ companyId, id, rejectionReason, reviewedBy, status }) {
      const [row] = await database
        .update(aggregateDocuments)
        .set({ rejectionReason, reviewedAt: new Date(), reviewedBy, status, updatedAt: new Date() })
        .where(and(eq(aggregateDocuments.companyId, companyId), eq(aggregateDocuments.id, id)))
        .returning(DOCUMENT_FIELDS)
      return row ?? null
    },

    async upsert({
      bucket,
      companyId,
      mimeType,
      objectKey,
      provider,
      sha256,
      sizeBytes,
      storedObjectId,
      taxId,
      type,
    }) {
      return database.transaction(async (transaction) => {
        await transaction.insert(storedObjects).values({
          bucket,
          companyId,
          id: storedObjectId,
          mimeType,
          objectKey,
          provider,
          purpose: 'aggregate_document',
          sha256,
          sizeBytes: BigInt(sizeBytes),
          status: 'final',
        })

        const [row] = await transaction
          .insert(aggregateDocuments)
          .values({ companyId, storedObjectId, taxId, type })
          .onConflictDoUpdate({
            set: {
              rejectionReason: '',
              reviewedAt: null,
              reviewedBy: null,
              status: 'pending',
              storedObjectId,
              updatedAt: new Date(),
            },
            target: [
              aggregateDocuments.companyId,
              aggregateDocuments.taxId,
              aggregateDocuments.type,
            ],
          })
          .returning(DOCUMENT_FIELDS)

        if (row === undefined) throw new Error('aggregate document upsert did not return a row')
        return row
      })
    },
  }
}
