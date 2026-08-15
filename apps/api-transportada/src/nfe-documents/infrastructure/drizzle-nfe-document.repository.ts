/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, desc, eq, inArray, isNull, lt, ne, or, sum } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import { nfseServiceInvoiceDocuments, nfseServiceInvoices } from '../../database/nfse.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import { resolveDocumentBlock } from '../../cte-batches/domain/cte-batch-eligibility.policy.js'
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

const CANCELLED_BATCH_STATUS = 'cancelled'

type DocumentScope = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

/**
 * O número vem `null` enquanto a prefeitura não autoriza: a nota existe e já segura o documento,
 * mas ainda não tem numeração. Quem consome mostra o vínculo mesmo assim.
 */
type NfseInvoiceLink = {
  readonly id: string
  readonly number: string | null
}

type DocumentBlockContext = {
  readonly batchIdByDocumentId: ReadonlyMap<string, string>
  readonly grossWeightByDocumentId: ReadonlyMap<string, string>
  readonly nfseInvoiceByDocumentId: ReadonlyMap<string, NfseInvoiceLink>
}

const EMPTY_BLOCK_CONTEXT: DocumentBlockContext = {
  batchIdByDocumentId: new Map(),
  grossWeightByDocumentId: new Map(),
  nfseInvoiceByDocumentId: new Map(),
}

export function buildDocumentGrossWeightFilters({
  companyId,
  documentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(nfeVolumes.companyId, companyId),
    inArray(nfeVolumes.documentId, [...documentIds]),
  ] as const as readonly SQL[]
}

export function buildDocumentBatchLinkFilters({
  companyId,
  documentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(cteBatchItemDocuments.companyId, companyId),
    inArray(cteBatchItemDocuments.nfeDocumentId, [...documentIds]),
    ne(cteBatches.status, CANCELLED_BATCH_STATUS),
  ] as const as readonly SQL[]
}

/**
 * O vínculo com a nota de serviço é liberado marcando `cancelled_at` na mesma transação que cancela
 * a nota, então esse é o recorte de vínculo ativo — o mesmo que o índice parcial único guarda.
 */
export function buildDocumentNfseLinkFilters({
  companyId,
  documentIds,
}: DocumentScope): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceDocuments.companyId, companyId),
    inArray(nfseServiceInvoiceDocuments.nfeDocumentId, [...documentIds]),
    isNull(nfseServiceInvoiceDocuments.cancelledAt),
  ] as const as readonly SQL[]
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
    const scope: DocumentScope = {
      companyId: input.context.companyId,
      documentIds: pageRows.map((record) => record.id),
    }
    const [participantsByDocument, blockContext] = await Promise.all([
      this.loadParticipants(scope.companyId, scope.documentIds),
      this.loadBlockContext(scope),
    ])
    return {
      items: pageRows.map((record) =>
        mapSummary(record, participantsByDocument.get(record.id), blockContext),
      ),
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
    const scope: DocumentScope = {
      companyId: input.context.companyId,
      documentIds: [document.id],
    }
    const [participantsByDocument, blockContext] = await Promise.all([
      this.loadParticipants(scope.companyId, scope.documentIds),
      this.loadBlockContext(scope),
    ])
    return mapSummary(document, participantsByDocument.get(document.id), blockContext)
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

  private async loadBlockContext(scope: DocumentScope): Promise<DocumentBlockContext> {
    if (scope.documentIds.length === 0) return EMPTY_BLOCK_CONTEXT
    const [weightRows, linkRows, nfseLinkRows] = await Promise.all([
      this.database
        .select({ documentId: nfeVolumes.documentId, grossWeight: sum(nfeVolumes.grossWeight) })
        .from(nfeVolumes)
        .where(and(...buildDocumentGrossWeightFilters(scope)))
        .groupBy(nfeVolumes.documentId),
      this.database
        .selectDistinctOn([cteBatchItemDocuments.nfeDocumentId], {
          batchId: cteBatchItemDocuments.batchId,
          documentId: cteBatchItemDocuments.nfeDocumentId,
        })
        .from(cteBatchItemDocuments)
        .innerJoin(
          cteBatches,
          and(
            eq(cteBatches.companyId, cteBatchItemDocuments.companyId),
            eq(cteBatches.id, cteBatchItemDocuments.batchId),
          ),
        )
        .where(and(...buildDocumentBatchLinkFilters(scope)))
        .orderBy(cteBatchItemDocuments.nfeDocumentId),
      this.database
        .selectDistinctOn([nfseServiceInvoiceDocuments.nfeDocumentId], {
          documentId: nfseServiceInvoiceDocuments.nfeDocumentId,
          invoiceId: nfseServiceInvoiceDocuments.invoiceId,
          providerNumber: nfseServiceInvoices.providerNumber,
        })
        .from(nfseServiceInvoiceDocuments)
        .innerJoin(
          nfseServiceInvoices,
          and(
            eq(nfseServiceInvoices.companyId, nfseServiceInvoiceDocuments.companyId),
            eq(nfseServiceInvoices.id, nfseServiceInvoiceDocuments.invoiceId),
          ),
        )
        .where(and(...buildDocumentNfseLinkFilters(scope)))
        .orderBy(nfseServiceInvoiceDocuments.nfeDocumentId),
    ])

    return {
      batchIdByDocumentId: new Map(linkRows.map((row) => [row.documentId, row.batchId])),
      grossWeightByDocumentId: new Map(
        weightRows.flatMap((row) =>
          row.grossWeight === null ? [] : [[row.documentId, row.grossWeight]],
        ),
      ),
      nfseInvoiceByDocumentId: new Map(
        nfseLinkRows.map((row) => [
          row.documentId,
          { id: row.invoiceId, number: row.providerNumber },
        ]),
      ),
    }
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
  blockContext: DocumentBlockContext,
): NfeDocumentSummary {
  const emitter = participants?.emitter ?? EMPTY_PARTICIPANT
  const recipient = participants?.recipient ?? EMPTY_PARTICIPANT
  const nfseInvoice = blockContext.nfseInvoiceByDocumentId.get(document.id) ?? null
  const decision = resolveDocumentBlock({
    document: {
      grossWeight: blockContext.grossWeightByDocumentId.get(document.id) ?? null,
      recipientCity: recipient.city,
      recipientState: recipient.state,
      recipientTaxId: recipient.taxId,
      senderCity: emitter.city,
      senderState: emitter.state,
      senderTaxId: emitter.taxId,
      status: document.status,
      totalAmount: document.totalValue,
      variant: 'complete',
    },
    linkedBatchId: blockContext.batchIdByDocumentId.get(document.id) ?? null,
    linkedNfseInvoiceId: nfseInvoice?.id ?? null,
  })
  return {
    accessKey: document.accessKey,
    cteBlockReason: decision.blocked?.reason ?? null,
    emitterAddress: emitter.address,
    emitterCity: emitter.city,
    emitterCityCode: emitter.cityCode,
    emitterName: emitter.name,
    emitterState: emitter.state,
    emitterTaxId: emitter.taxId,
    id: document.id,
    issuedAt: document.issuedAt.toISOString(),
    nfseInvoiceId: nfseInvoice?.id ?? null,
    nfseInvoiceNumber: nfseInvoice?.number ?? null,
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
