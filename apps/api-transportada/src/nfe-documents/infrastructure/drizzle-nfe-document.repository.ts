/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray, lt, or } from 'drizzle-orm'

import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
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

type ParticipantDetail = {
  readonly address: string | null
  readonly city: string | null
  readonly cityCode: string | null
  readonly name: string
  readonly state: string | null
  readonly taxId: string | null
}

type DocumentParticipants = {
  readonly emitter: ParticipantDetail
  readonly recipient: ParticipantDetail
}

const EMPTY_PARTICIPANT: ParticipantDetail = {
  address: null,
  city: null,
  cityCode: null,
  name: '',
  state: null,
  taxId: null,
}

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
    const participantsByDocument = await this.loadParticipants(
      input.context.companyId,
      pageRows.map((record) => record.id),
    )
    return {
      items: pageRows.map((record) => mapSummary(record, participantsByDocument.get(record.id))),
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
    const participantsByDocument = await this.loadParticipants(input.context.companyId, [
      document.id,
    ])
    return mapSummary(document, participantsByDocument.get(document.id))
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

  private async loadParticipants(
    companyId: string,
    documentIds: readonly string[],
  ): Promise<Map<string, DocumentParticipants>> {
    const result = new Map<string, DocumentParticipants>()
    if (documentIds.length === 0) return result
    const rows = await this.database
      .select({
        documentId: nfeParticipants.documentId,
        role: nfeParticipants.role,
        legalName: nfeParticipants.legalName,
        taxId: nfeParticipants.taxId,
        city: nfeAddresses.city,
        cityCode: nfeAddresses.cityCode,
        district: nfeAddresses.district,
        number: nfeAddresses.number,
        state: nfeAddresses.state,
        street: nfeAddresses.street,
      })
      .from(nfeParticipants)
      .leftJoin(
        nfeAddresses,
        and(
          eq(nfeAddresses.companyId, nfeParticipants.companyId),
          eq(nfeAddresses.participantId, nfeParticipants.id),
        ),
      )
      .where(
        and(
          eq(nfeParticipants.companyId, companyId),
          inArray(nfeParticipants.documentId, [...documentIds]),
        ),
      )
    for (const row of rows) {
      const detail: ParticipantDetail = {
        address: composeAddress(row.street, row.number, row.district),
        city: row.city,
        cityCode: row.cityCode,
        name: row.legalName ?? '',
        state: row.state,
        taxId: row.taxId,
      }
      const current = result.get(row.documentId) ?? {
        emitter: EMPTY_PARTICIPANT,
        recipient: EMPTY_PARTICIPANT,
      }
      result.set(
        row.documentId,
        row.role === 'emitter'
          ? { ...current, emitter: detail }
          : row.role === 'recipient'
            ? { ...current, recipient: detail }
            : current,
      )
    }
    return result
  }
}

function mapSummary(
  document: DocumentRecord,
  participants: DocumentParticipants | undefined,
): NfeDocumentSummary {
  const emitter = participants?.emitter ?? EMPTY_PARTICIPANT
  const recipient = participants?.recipient ?? EMPTY_PARTICIPANT
  return {
    accessKey: document.accessKey,
    emitterAddress: emitter.address,
    emitterCity: emitter.city,
    emitterCityCode: emitter.cityCode,
    emitterName: emitter.name,
    emitterState: emitter.state,
    emitterTaxId: emitter.taxId,
    id: document.id,
    issuedAt: document.issuedAt.toISOString(),
    number: document.number,
    recipientAddress: recipient.address,
    recipientCity: recipient.city,
    recipientCityCode: recipient.cityCode,
    recipientName: recipient.name,
    recipientState: recipient.state,
    recipientTaxId: recipient.taxId,
    series: document.series,
    status: document.status,
    totalAmount: document.totalValue,
    variant: 'complete',
  }
}

function composeAddress(
  street: string | null,
  number: string | null,
  district: string | null,
): string | null {
  const line = [street, number].filter((part) => part !== null && part.length > 0).join(', ')
  const full = [line, district].filter((part) => part !== null && part.length > 0).join(' - ')
  return full.length > 0 ? full : null
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
