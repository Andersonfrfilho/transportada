/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, lt, or } from 'drizzle-orm'

import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  DownloadNfeDocumentXmlResult,
  NfeDocumentDetail,
  NfeDocumentEligibility,
  NfeDocumentPage,
  NfeDocumentRepositoryPort,
  NfeDocumentSummary,
} from '../application/nfe-document.types.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type DocumentRecord = typeof nfeDocuments.$inferSelect
type StoredObjectRecord = typeof storedObjects.$inferSelect

export class DrizzleNfeDocumentRepository implements NfeDocumentRepositoryPort {
  public constructor(
    private readonly database: Database,
    private readonly storage: NfeStorageGateway,
  ) {}

  public async list(input: {
    readonly context: CompanyContext
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeDocumentPage> {
    const cursor = decodeCursor(input.cursor)
    const condition =
      cursor === null
        ? eq(nfeDocuments.companyId, input.context.companyId)
        : and(
            eq(nfeDocuments.companyId, input.context.companyId),
            or(
              lt(nfeDocuments.issuedAt, cursor.createdAt),
              and(eq(nfeDocuments.issuedAt, cursor.createdAt), lt(nfeDocuments.id, cursor.id)),
            ),
          )
    const rows = await this.database
      .select()
      .from(nfeDocuments)
      .where(condition)
      .orderBy(desc(nfeDocuments.issuedAt), desc(nfeDocuments.id))
      .limit(input.limit + 1)
    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    return {
      items: await Promise.all(pageRows.map((record) => this.mapSummary(record))),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? `${last.issuedAt.toISOString()}::${last.id}`
          : null,
    }
  }

  public async get(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentDetail> {
    const document = await this.findDocument(input.context.companyId, input.documentId)
    if (document === null) throw notFound()
    return this.mapSummary(document)
  }

  public async getEligibility(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<NfeDocumentEligibility> {
    const document = await this.findDocument(input.context.companyId, input.documentId)
    if (document === null) throw notFound()
    return {
      authorizedDocument: document.status === 'authorized',
      companyRelated: true,
      decision: 'PENDING_FREIGHT_AND_CTE_RULES',
      hasOriginalXml: true,
    }
  }

  public async downloadXml(input: {
    readonly context: CompanyContext
    readonly documentId: string
  }): Promise<DownloadNfeDocumentXmlResult> {
    const row = await this.findDocumentWithObject(input.context.companyId, input.documentId)
    if (row === null) throw notFound()
    return {
      accessKey: row.document.accessKey,
      content: await this.storage.getObjectStream({
        bucket: row.object.bucket,
        key: row.object.objectKey,
      }),
      contentType: row.object.mimeType,
      fileName: `${row.document.accessKey}.xml`,
    }
  }

  private async findDocument(
    companyId: string,
    documentId: string,
  ): Promise<DocumentRecord | null> {
    const [record] = await this.database
      .select()
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.id, documentId)))
      .limit(1)
    return record ?? null
  }

  private async findDocumentWithObject(
    companyId: string,
    documentId: string,
  ): Promise<{
    readonly document: DocumentRecord
    readonly object: StoredObjectRecord
  } | null> {
    const [row] = await this.database
      .select({ document: nfeDocuments, object: storedObjects })
      .from(nfeDocuments)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.companyId, nfeDocuments.companyId),
          eq(storedObjects.id, nfeDocuments.xmlObjectId),
        ),
      )
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.id, documentId)))
      .limit(1)
    return row ?? null
  }

  private async mapSummary(document: DocumentRecord): Promise<NfeDocumentSummary> {
    const names = await this.findParticipantNames(document.companyId, document.id)
    return {
      accessKey: document.accessKey,
      emitterName: names.emitterName,
      id: document.id,
      issuedAt: document.issuedAt.toISOString(),
      recipientName: names.recipientName,
      status: document.status,
      totalAmount: document.totalValue,
      variant: 'complete',
    }
  }

  private async findParticipantNames(
    companyId: string,
    documentId: string,
  ): Promise<{
    readonly emitterName: string
    readonly recipientName: string
  }> {
    const rows = await this.database
      .select()
      .from(nfeParticipants)
      .where(
        and(eq(nfeParticipants.companyId, companyId), eq(nfeParticipants.documentId, documentId)),
      )
    return {
      emitterName: rows.find((participant) => participant.role === 'emitter')?.legalName ?? '',
      recipientName: rows.find((participant) => participant.role === 'recipient')?.legalName ?? '',
    }
  }
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

function notFound(): ApiError {
  return new ApiError({
    code: 'NFE_DOCUMENT_NOT_FOUND',
    message: 'NF-e document not found',
    status: 404,
  })
}
