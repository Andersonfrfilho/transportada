/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, sql } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { freightRuleVersions } from '../../database/freight.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  nfseEmissionProfiles,
  nfseFiscalDocuments,
  nfseIssuanceAttempts,
  nfseIssuanceEvents,
  nfseIssuanceOutbox,
  nfseIssuancePayloads,
  nfseProviderCredentials,
  nfseServiceInvoiceCharges,
  nfseServiceInvoiceDocuments,
  nfseServiceInvoices,
} from '../../database/nfse.schema.js'
import type { NfseFiscalEnvironment, NfseServiceInvoiceStatus } from '../../database/nfse.schema.js'
import { storedObjects } from '../../database/storage.schema.js'
import {
  buildActiveCredentialFilters,
  buildActiveCteBatchLinkFilters,
  buildActiveCteBatchLinkJoin,
  buildActiveFreightRuleVersionFilters,
  buildActiveInvoiceLinkFilters,
  buildAttemptIdempotencyFilters,
  buildFiscalEnvironmentFilters,
  buildNfseProfileFilters,
} from './nfse-invoice-issuance.query.js'
import {
  buildFiscalDocumentFilters,
  buildInvoiceChargeFilters,
  buildInvoiceDocumentCountExpression,
  buildInvoiceDocumentFilters,
  buildInvoiceDocumentJoin,
  buildInvoiceLinkReleaseFilters,
  buildInvoiceListFilters,
  buildInvoiceScopeFilters,
  buildLatestAttemptFilters,
  buildPendingOutboxFilters,
  buildStoredObjectFilters,
} from './nfse-invoice-query.query.js'
import type {
  AppendNfseIssuanceEventInput,
  CreateNfseInvoiceChargesInput,
  CreateNfseInvoiceRecordInput,
  CreateNfseIssuanceAttemptInput,
  LinkNfseInvoiceDocumentsInput,
  MarkNfseInvoiceCancellationInput,
  NfseFiscalDocumentKind,
  NfseFiscalDocumentLocation,
  NfseFreightRuleVersion,
  NfseInvoiceCancellationTarget,
  NfseInvoiceChargeLine,
  NfseInvoiceCredential,
  NfseInvoiceCursor,
  NfseInvoiceDelivery,
  NfseInvoiceDetail,
  NfseInvoiceDocumentLink,
  NfseInvoiceLinkedDocument,
  NfseInvoiceListFilters,
  NfseInvoiceListItem,
  NfseInvoicePage,
  NfseInvoiceProfile,
  NfseInvoiceRecord,
  NfseInvoiceRepositoryPort,
  NfseInvoiceSelectionQuery,
  NfseInvoiceTransactionPort,
  NfseIssuanceAttemptRecord,
  PushNfseIssuanceOutboxInput,
  ReleaseNfseInvoiceLinksInput,
  SaveNfseIssuancePayloadInput,
} from '../application/nfse-invoice.port.js'
import type { NfseSelectionDocument } from '../domain/nfse-selection.policy.js'
import { findNfseSelectionDocuments } from './nfse-invoice-selection.query.js'

type NfseDatabase = ReturnType<typeof createDrizzleProvider>['db']
type NfseTransaction = Parameters<Parameters<NfseDatabase['transaction']>[0]>[0]
type NfseQueryable = NfseDatabase | NfseTransaction

const AGGREGATE_TYPE = 'nfse_service_invoice'
const AGGREGATE_SUBTYPE = 'invoice'
const CURSOR_SEPARATOR = '::'
const PENDING_ATTEMPT_STATUS = 'pending'
const REQUESTED_OUTBOX_STATUS = 'requested'

/**
 * Toda leitura da emissão roda no mesmo handle da escrita. O módulo não chama o repositório de
 * perfis nem o de credenciais de propósito: eles abrem a própria transação, e uma transação dentro
 * da outra na mesma conexão trava o pool até o timeout.
 */
export class DrizzleNfseInvoiceRepository implements NfseInvoiceRepositoryPort {
  public constructor(private readonly database: NfseDatabase) {}

  public findActiveCteBatchLinks(
    query: NfseInvoiceSelectionQuery,
  ): Promise<readonly NfseInvoiceDocumentLink[]> {
    return findActiveCteBatchLinks(this.database, query)
  }

  public findActiveCredential(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<NfseInvoiceCredential | null> {
    return findActiveCredential(this.database, input)
  }

  public findActiveInvoiceLinks(
    query: NfseInvoiceSelectionQuery,
  ): Promise<readonly NfseInvoiceDocumentLink[]> {
    return findActiveInvoiceLinks(this.database, query)
  }

  public findFiscalDocumentLocation(input: {
    readonly companyId: string
    readonly invoiceId: string
    readonly kind: NfseFiscalDocumentKind
  }): Promise<NfseFiscalDocumentLocation | null> {
    return findFiscalDocumentLocation(this.database, input)
  }

  public findFiscalEnvironment(input: {
    readonly companyId: string
  }): Promise<NfseFiscalEnvironment | null> {
    return findFiscalEnvironment(this.database, input)
  }

  public findInvoiceDetail(input: {
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<NfseInvoiceDetail | null> {
    return findInvoiceDetail(this.database, input)
  }

  public findInvoiceDocuments(input: {
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<readonly NfseInvoiceLinkedDocument[]> {
    return findInvoiceDocuments(this.database, input)
  }

  public listInvoices(input: {
    readonly companyId: string
    readonly cursor: NfseInvoiceCursor | null
    readonly filters?: NfseInvoiceListFilters | undefined
    readonly limit: number
  }): Promise<NfseInvoicePage> {
    return listInvoices(this.database, input)
  }

  public findFreightRuleVersion(input: {
    readonly companyId: string
    readonly freightRuleId: string
  }): Promise<NfseFreightRuleVersion | null> {
    return findFreightRuleVersion(this.database, input)
  }

  public findProfile(input: {
    readonly companyId: string
    readonly profileId: string
  }): Promise<NfseInvoiceProfile | null> {
    return findProfile(this.database, input)
  }

  public findSelectionDocuments(
    query: NfseInvoiceSelectionQuery,
  ): Promise<readonly NfseSelectionDocument[]> {
    return findNfseSelectionDocuments(this.database, query)
  }

  public async transaction<TResult>(
    scope: { readonly companyId: string },
    handler: (transaction: NfseInvoiceTransactionPort) => Promise<TResult>,
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) =>
      handler(createScopedTransaction(transaction, scope.companyId)),
    )
  }
}

function createScopedTransaction(
  transaction: NfseTransaction,
  companyId: string,
): NfseInvoiceTransactionPort {
  return {
    async appendEvent(input) {
      await appendEvent(transaction, companyId, input)
    },
    async createAttempt(input) {
      return createAttempt(transaction, companyId, input)
    },
    async createCharges(input) {
      await createCharges(transaction, companyId, input)
    },
    async createInvoice(input) {
      return createInvoice(transaction, companyId, input)
    },
    async findActiveCteBatchLinks(query) {
      return findActiveCteBatchLinks(transaction, query)
    },
    async findActiveCredential(input) {
      return findActiveCredential(transaction, input)
    },
    async findActiveInvoiceLinks(query) {
      return findActiveInvoiceLinks(transaction, query)
    },
    async findAttemptByIdempotencyKey(input) {
      return findAttemptByIdempotencyKey(transaction, companyId, input.idempotencyKey)
    },
    async findFiscalDocumentLocation(input) {
      return findFiscalDocumentLocation(transaction, input)
    },
    async findFiscalEnvironment(input) {
      return findFiscalEnvironment(transaction, input)
    },
    async findFreightRuleVersion(input) {
      return findFreightRuleVersion(transaction, input)
    },
    async findInvoiceDetail(input) {
      return findInvoiceDetail(transaction, input)
    },
    async findInvoiceDocuments(input) {
      return findInvoiceDocuments(transaction, input)
    },
    async findInvoiceForUpdate(input) {
      return findInvoiceForUpdate(transaction, companyId, input.invoiceId)
    },
    async findProfile(input) {
      return findProfile(transaction, input)
    },
    async findSelectionDocuments(query) {
      return findNfseSelectionDocuments(transaction, query)
    },
    async linkDocuments(input) {
      await linkDocuments(transaction, companyId, input)
    },
    async listInvoices(input) {
      return listInvoices(transaction, input)
    },
    async markCancellationRequested(input) {
      await markCancellationRequested(transaction, companyId, input)
    },
    async pushOutbox(input) {
      await pushOutbox(transaction, companyId, input)
    },
    async releaseDocumentLinks(input) {
      return releaseDocumentLinks(transaction, companyId, input)
    },
    async savePayload(input) {
      await savePayload(transaction, companyId, input)
    },
  }
}

const DOCUMENT_COUNT = buildInvoiceDocumentCountExpression()

const INVOICE_LIST_COLUMNS = {
  authorizedAt: nfseServiceInvoices.authorizedAt,
  cancelledAt: nfseServiceInvoices.cancelledAt,
  createdAt: nfseServiceInvoices.createdAt,
  documentCount: DOCUMENT_COUNT,
  emissionProfileId: nfseServiceInvoices.emissionProfileId,
  id: nfseServiceInvoices.id,
  issAmount: nfseServiceInvoices.issAmount,
  providerNumber: nfseServiceInvoices.providerNumber,
  serviceAmount: nfseServiceInvoices.serviceAmount,
  status: nfseServiceInvoices.status,
  takerLegalName: nfseServiceInvoices.takerLegalName,
  takerTaxId: nfseServiceInvoices.takerTaxId,
  updatedAt: nfseServiceInvoices.updatedAt,
  verificationCode: nfseServiceInvoices.verificationCode,
} as const

type InvoiceListRow = {
  readonly authorizedAt: Date | null
  readonly cancelledAt: Date | null
  readonly createdAt: Date
  readonly documentCount: bigint
  readonly emissionProfileId: string
  readonly id: string
  readonly issAmount: string
  readonly providerNumber: string | null
  readonly serviceAmount: string
  readonly status: NfseServiceInvoiceStatus
  readonly takerLegalName: string
  readonly takerTaxId: string
  readonly updatedAt: Date
  readonly verificationCode: string | null
}

function mapInvoiceListItem(row: InvoiceListRow): NfseInvoiceListItem {
  return {
    authorizedAt: row.authorizedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    documentCount: Number(row.documentCount),
    emissionProfileId: row.emissionProfileId,
    id: row.id,
    issAmount: row.issAmount,
    providerNumber: row.providerNumber,
    serviceAmount: row.serviceAmount,
    status: row.status,
    takerLegalName: row.takerLegalName,
    takerTaxId: row.takerTaxId,
    updatedAt: row.updatedAt.toISOString(),
    verificationCode: row.verificationCode,
  }
}

async function listInvoices(
  queryable: NfseQueryable,
  input: {
    readonly companyId: string
    readonly cursor: NfseInvoiceCursor | null
    readonly filters?: NfseInvoiceListFilters | undefined
    readonly limit: number
  },
): Promise<NfseInvoicePage> {
  const rows = await queryable
    .select(INVOICE_LIST_COLUMNS)
    .from(nfseServiceInvoices)
    .where(and(...buildInvoiceListFilters(input)))
    .orderBy(desc(nfseServiceInvoices.createdAt), desc(nfseServiceInvoices.id))
    .limit(input.limit + 1)

  const page = rows.slice(0, input.limit).map(mapInvoiceListItem)
  const last = page[page.length - 1]
  const hasMore = rows.length > input.limit && last !== undefined

  return {
    items: page,
    nextCursor: hasMore ? `${last.createdAt}${CURSOR_SEPARATOR}${last.id}` : null,
  }
}

async function findInvoiceDetail(
  queryable: NfseQueryable,
  input: { readonly companyId: string; readonly invoiceId: string },
): Promise<NfseInvoiceDetail | null> {
  const [record] = await queryable
    .select({
      ...INVOICE_LIST_COLUMNS,
      cancellationReason: nfseServiceInvoices.cancellationReason,
      description: nfseServiceInvoices.description,
      rejectionCode: nfseServiceInvoices.rejectionCode,
      rejectionMessage: nfseServiceInvoices.rejectionMessage,
      version: nfseServiceInvoices.version,
    })
    .from(nfseServiceInvoices)
    .where(and(...buildInvoiceScopeFilters(input)))
    .limit(1)
  if (record === undefined) return null

  return {
    ...mapInvoiceListItem(record),
    cancellationReason: record.cancellationReason,
    charges: await findInvoiceCharges(queryable, input),
    delivery: await findInvoiceDelivery(queryable, input),
    description: record.description,
    rejectionCode: record.rejectionCode,
    rejectionMessage: record.rejectionMessage,
    version: record.version.toString(),
  }
}

/**
 * A emissão é automática: quando ela não anda, a tela precisa dizer em que tentativa está, o que a
 * última falha disse e quando vem a próxima. Sem isso a nota parada é indistinguível de uma nota
 * esquecida.
 */
async function findInvoiceDelivery(
  queryable: NfseQueryable,
  scope: { readonly companyId: string; readonly invoiceId: string },
): Promise<NfseInvoiceDelivery | null> {
  const [attempt] = await queryable
    .select({
      attemptNumber: nfseIssuanceAttempts.attemptNumber,
      id: nfseIssuanceAttempts.id,
      lastErrorCause: nfseIssuanceAttempts.lastErrorCause,
      lastErrorCode: nfseIssuanceAttempts.lastErrorCode,
      lastErrorMessage: nfseIssuanceAttempts.lastErrorMessage,
      status: nfseIssuanceAttempts.status,
      updatedAt: nfseIssuanceAttempts.updatedAt,
    })
    .from(nfseIssuanceAttempts)
    .where(and(...buildLatestAttemptFilters(scope)))
    .orderBy(desc(nfseIssuanceAttempts.attemptNumber), desc(nfseIssuanceAttempts.createdAt))
    .limit(1)
  if (attempt === undefined) return null

  const [pending] = await queryable
    .select({ nextAttemptAt: nfseIssuanceOutbox.nextAttemptAt })
    .from(nfseIssuanceOutbox)
    .where(and(...buildPendingOutboxFilters({ attemptId: attempt.id, companyId: scope.companyId })))
    .orderBy(asc(nfseIssuanceOutbox.nextAttemptAt))
    .limit(1)

  return {
    attemptCount: Number(attempt.attemptNumber),
    lastErrorCause: attempt.lastErrorCause,
    lastErrorCode: attempt.lastErrorCode,
    lastErrorMessage: attempt.lastErrorMessage,
    nextAttemptAt: pending?.nextAttemptAt?.toISOString() ?? null,
    status: attempt.status,
    updatedAt: attempt.updatedAt.toISOString(),
  }
}

async function findInvoiceCharges(
  queryable: NfseQueryable,
  scope: { readonly companyId: string; readonly invoiceId: string },
): Promise<readonly NfseInvoiceChargeLine[]> {
  const rows = await queryable
    .select({
      amount: nfseServiceInvoiceCharges.amount,
      baseAmount: nfseServiceInvoiceCharges.baseAmount,
      calculationType: nfseServiceInvoiceCharges.calculationType,
      label: nfseServiceInvoiceCharges.label,
      ordinal: nfseServiceInvoiceCharges.ordinal,
      rate: nfseServiceInvoiceCharges.rate,
    })
    .from(nfseServiceInvoiceCharges)
    .where(and(...buildInvoiceChargeFilters(scope)))
    .orderBy(asc(nfseServiceInvoiceCharges.ordinal))

  return rows.map((row) => ({
    amount: row.amount,
    baseAmount: row.baseAmount,
    calculationType: row.calculationType,
    label: row.label,
    ordinal: Number(row.ordinal),
    rate: row.rate ?? '0',
  }))
}

async function findInvoiceDocuments(
  queryable: NfseQueryable,
  scope: { readonly companyId: string; readonly invoiceId: string },
): Promise<readonly NfseInvoiceLinkedDocument[]> {
  const rows = await queryable
    .select({
      accessKey: nfeDocuments.accessKey,
      cancelledAt: nfseServiceInvoiceDocuments.cancelledAt,
      documentId: nfseServiceInvoiceDocuments.nfeDocumentId,
      issuedAt: nfeDocuments.issuedAt,
      number: nfeDocuments.number,
      position: nfseServiceInvoiceDocuments.position,
      series: nfeDocuments.series,
      totalValue: nfeDocuments.totalValue,
    })
    .from(nfseServiceInvoiceDocuments)
    .innerJoin(nfeDocuments, buildInvoiceDocumentJoin())
    .where(and(...buildInvoiceDocumentFilters(scope)))
    .orderBy(asc(nfseServiceInvoiceDocuments.position))

  return rows.map((row) => ({
    accessKey: row.accessKey,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    documentId: row.documentId,
    issuedAt: row.issuedAt.toISOString(),
    number: row.number,
    position: Number(row.position),
    series: row.series,
    totalAmount: row.totalValue,
  }))
}

async function findFiscalDocumentLocation(
  queryable: NfseQueryable,
  input: {
    readonly companyId: string
    readonly invoiceId: string
    readonly kind: NfseFiscalDocumentKind
  },
): Promise<NfseFiscalDocumentLocation | null> {
  const [document] = await queryable
    .select({
      pdfObjectId: nfseFiscalDocuments.pdfObjectId,
      xmlObjectId: nfseFiscalDocuments.xmlObjectId,
    })
    .from(nfseFiscalDocuments)
    .where(and(...buildFiscalDocumentFilters(input)))
    .limit(1)
  if (document === undefined) return null

  const objectId = input.kind === 'pdf' ? document.pdfObjectId : document.xmlObjectId
  if (objectId === null) return null

  const [object] = await queryable
    .select({
      bucket: storedObjects.bucket,
      mimeType: storedObjects.mimeType,
      objectKey: storedObjects.objectKey,
      sha256: storedObjects.sha256,
    })
    .from(storedObjects)
    .where(and(...buildStoredObjectFilters({ companyId: input.companyId, objectId })))
    .limit(1)
  if (object === undefined) return null

  return {
    bucket: object.bucket,
    key: object.objectKey,
    mimeType: object.mimeType,
    sha256: object.sha256,
  }
}

/** Trava a linha antes de cancelar: dois pedidos simultâneos liberariam os vínculos duas vezes. */
async function findInvoiceForUpdate(
  transaction: NfseTransaction,
  companyId: string,
  invoiceId: string,
): Promise<NfseInvoiceCancellationTarget | null> {
  const [record] = await transaction
    .select({
      id: nfseServiceInvoices.id,
      status: nfseServiceInvoices.status,
      version: nfseServiceInvoices.version,
    })
    .from(nfseServiceInvoices)
    .where(and(...buildInvoiceScopeFilters({ companyId, invoiceId })))
    .limit(1)
    .for('update')
  if (record === undefined) return null

  return { invoiceId: record.id, status: record.status, version: record.version.toString() }
}

/** Devolve as NF-e para a seleção na mesma transação do pedido de cancelamento. */
async function releaseDocumentLinks(
  transaction: NfseTransaction,
  companyId: string,
  input: ReleaseNfseInvoiceLinksInput,
): Promise<readonly string[]> {
  const released = await transaction
    .update(nfseServiceInvoiceDocuments)
    .set({ cancelledAt: new Date(input.cancelledAt), updatedAt: new Date(input.cancelledAt) })
    .where(and(...buildInvoiceLinkReleaseFilters({ companyId, invoiceId: input.invoiceId })))
    .returning({ documentId: nfseServiceInvoiceDocuments.nfeDocumentId })

  return released.map((row) => row.documentId)
}

/**
 * O status continua `authorized` até o write-back: quem cancela um documento fiscal é a prefeitura,
 * e a API só registra que o pedido saiu.
 */
async function markCancellationRequested(
  transaction: NfseTransaction,
  companyId: string,
  input: MarkNfseInvoiceCancellationInput,
): Promise<void> {
  await transaction
    .update(nfseServiceInvoices)
    .set({
      cancellationReason: input.cancellationReason,
      status: input.status,
      updatedAt: new Date(input.requestedAt),
      version: sql`${nfseServiceInvoices.version} + 1`,
    })
    .where(and(...buildInvoiceScopeFilters({ companyId, invoiceId: input.invoiceId })))
}

async function findActiveCteBatchLinks(
  queryable: NfseQueryable,
  query: NfseInvoiceSelectionQuery,
): Promise<readonly NfseInvoiceDocumentLink[]> {
  if (query.documentIds.length === 0) return []

  const rows = await queryable
    .selectDistinctOn([cteBatchItemDocuments.nfeDocumentId], {
      documentId: cteBatchItemDocuments.nfeDocumentId,
      ownerId: cteBatchItemDocuments.batchId,
    })
    .from(cteBatchItemDocuments)
    .innerJoin(cteBatches, buildActiveCteBatchLinkJoin())
    .where(and(...buildActiveCteBatchLinkFilters(query)))
    .orderBy(cteBatchItemDocuments.nfeDocumentId)

  return rows
}

async function findActiveInvoiceLinks(
  queryable: NfseQueryable,
  query: NfseInvoiceSelectionQuery,
): Promise<readonly NfseInvoiceDocumentLink[]> {
  if (query.documentIds.length === 0) return []

  const rows = await queryable
    .selectDistinctOn([nfseServiceInvoiceDocuments.nfeDocumentId], {
      documentId: nfseServiceInvoiceDocuments.nfeDocumentId,
      ownerId: nfseServiceInvoiceDocuments.invoiceId,
    })
    .from(nfseServiceInvoiceDocuments)
    .where(and(...buildActiveInvoiceLinkFilters(query)))
    .orderBy(nfseServiceInvoiceDocuments.nfeDocumentId)

  return rows
}

async function findProfile(
  queryable: NfseQueryable,
  input: { readonly companyId: string; readonly profileId: string },
): Promise<NfseInvoiceProfile | null> {
  const [record] = await queryable
    .select({
      chargeComponentLabel: nfseEmissionProfiles.chargeComponentLabel,
      cnaeCode: nfseEmissionProfiles.cnaeCode,
      descriptionMaxLength: nfseEmissionProfiles.descriptionMaxLength,
      descriptionTemplate: nfseEmissionProfiles.descriptionTemplate,
      freightRuleId: nfseEmissionProfiles.freightRuleId,
      id: nfseEmissionProfiles.id,
      issExigibility: nfseEmissionProfiles.issExigibility,
      issRate: nfseEmissionProfiles.issRate,
      issWithheld: nfseEmissionProfiles.issWithheld,
      municipalTaxationCode: nfseEmissionProfiles.municipalTaxationCode,
      municipalityIbgeCode: nfseEmissionProfiles.municipalityIbgeCode,
      municipalityName: nfseEmissionProfiles.municipalityName,
      nbsCode: nfseEmissionProfiles.nbsCode,
      observations: nfseEmissionProfiles.observations,
      serviceListItem: nfseEmissionProfiles.serviceListItem,
      status: nfseEmissionProfiles.status,
      taker: nfseEmissionProfiles.taker,
    })
    .from(nfseEmissionProfiles)
    .where(and(...buildNfseProfileFilters(input)))
    .limit(1)
  if (record === undefined) return null

  return { ...record, descriptionMaxLength: Number(record.descriptionMaxLength) }
}

async function findFreightRuleVersion(
  queryable: NfseQueryable,
  input: { readonly companyId: string; readonly freightRuleId: string },
): Promise<NfseFreightRuleVersion | null> {
  const [record] = await queryable
    .select({
      id: freightRuleVersions.id,
      maximumAmount: freightRuleVersions.maximumAmount,
      minimumAmount: freightRuleVersions.minimumAmount,
      percentage: freightRuleVersions.percentage,
      validFrom: freightRuleVersions.validFrom,
      validUntil: freightRuleVersions.validUntil,
      version: freightRuleVersions.version,
    })
    .from(freightRuleVersions)
    .where(and(...buildActiveFreightRuleVersionFilters(input)))
    .orderBy(desc(freightRuleVersions.version))
    .limit(1)
  if (record === undefined) return null

  return {
    freightRuleVersionId: record.id,
    maximumAmount: record.maximumAmount,
    minimumAmount: record.minimumAmount,
    percentage: record.percentage,
    ruleVersion: record.version.toString(),
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil?.toISOString() ?? null,
  }
}

async function findFiscalEnvironment(
  queryable: NfseQueryable,
  input: { readonly companyId: string },
): Promise<NfseFiscalEnvironment | null> {
  const [record] = await queryable
    .select({ environment: companyFiscalProfiles.environment })
    .from(companyFiscalProfiles)
    .where(and(...buildFiscalEnvironmentFilters(input)))
    .limit(1)
  return record?.environment ?? null
}

async function findActiveCredential(
  queryable: NfseQueryable,
  input: { readonly companyId: string; readonly fiscalEnvironment: NfseFiscalEnvironment },
): Promise<NfseInvoiceCredential | null> {
  const [record] = await queryable
    .select({
      fiscalEnvironment: nfseProviderCredentials.fiscalEnvironment,
      id: nfseProviderCredentials.id,
      municipalRegistration: nfseProviderCredentials.municipalRegistration,
      provider: nfseProviderCredentials.provider,
      taxId: nfseProviderCredentials.taxId,
    })
    .from(nfseProviderCredentials)
    .where(and(...buildActiveCredentialFilters(input)))
    .limit(1)
  if (record === undefined) return null

  return {
    credentialId: record.id,
    fiscalEnvironment: record.fiscalEnvironment,
    municipalRegistration: record.municipalRegistration,
    provider: record.provider,
    taxId: record.taxId,
  }
}

async function createInvoice(
  transaction: NfseTransaction,
  companyId: string,
  input: CreateNfseInvoiceRecordInput,
): Promise<NfseInvoiceRecord> {
  const [record] = await transaction
    .insert(nfseServiceInvoices)
    .values({
      calculationSnapshot: input.calculationSnapshot,
      companyId,
      createdByUserId: input.createdByUserId,
      description: input.description,
      emissionProfileId: input.emissionProfileId,
      issAmount: input.issAmount,
      serviceAmount: input.serviceAmount,
      status: 'requested',
      takerLegalName: input.takerLegalName,
      takerTaxId: input.takerTaxId,
    })
    .returning({
      createdAt: nfseServiceInvoices.createdAt,
      id: nfseServiceInvoices.id,
      status: nfseServiceInvoices.status,
      version: nfseServiceInvoices.version,
    })
  if (record === undefined) throw new Error('NFS-e service invoice insert returned no row')

  return {
    createdAt: record.createdAt.toISOString(),
    invoiceId: record.id,
    status: record.status,
    version: record.version.toString(),
  }
}

async function linkDocuments(
  transaction: NfseTransaction,
  companyId: string,
  input: LinkNfseInvoiceDocumentsInput,
): Promise<void> {
  if (input.documentIds.length === 0) return

  await transaction.insert(nfseServiceInvoiceDocuments).values(
    input.documentIds.map((nfeDocumentId, index) => ({
      companyId,
      invoiceId: input.invoiceId,
      nfeDocumentId,
      position: BigInt(index + 1),
    })),
  )
}

async function createCharges(
  transaction: NfseTransaction,
  companyId: string,
  input: CreateNfseInvoiceChargesInput,
): Promise<void> {
  if (input.charges.length === 0) return

  await transaction.insert(nfseServiceInvoiceCharges).values(
    input.charges.map((charge, index) => ({
      amount: charge.amount,
      baseAmount: charge.baseAmount,
      calculationType: charge.calculationType,
      companyId,
      invoiceId: input.invoiceId,
      label: charge.label,
      ordinal: BigInt(index + 1),
      rate: charge.rate,
    })),
  )
}

const ATTEMPT_COLUMNS = {
  attemptNumber: nfseIssuanceAttempts.attemptNumber,
  createdAt: nfseIssuanceAttempts.createdAt,
  id: nfseIssuanceAttempts.id,
  invoiceId: nfseIssuanceAttempts.invoiceId,
  requestFingerprint: nfseIssuanceAttempts.requestFingerprint,
} as const

type AttemptRow = {
  readonly attemptNumber: bigint
  readonly createdAt: Date
  readonly id: string
  readonly invoiceId: string
  readonly requestFingerprint: string
}

function mapAttempt(row: AttemptRow): NfseIssuanceAttemptRecord {
  return {
    attemptId: row.id,
    attemptNumber: Number(row.attemptNumber),
    createdAt: row.createdAt.toISOString(),
    invoiceId: row.invoiceId,
    requestFingerprint: row.requestFingerprint,
  }
}

async function findAttemptByIdempotencyKey(
  transaction: NfseTransaction,
  companyId: string,
  idempotencyKey: string,
): Promise<NfseIssuanceAttemptRecord | null> {
  const [record] = await transaction
    .select(ATTEMPT_COLUMNS)
    .from(nfseIssuanceAttempts)
    .where(and(...buildAttemptIdempotencyFilters({ companyId, idempotencyKey })))
    .limit(1)
  return record === undefined ? null : mapAttempt(record)
}

async function createAttempt(
  transaction: NfseTransaction,
  companyId: string,
  input: CreateNfseIssuanceAttemptInput,
): Promise<NfseIssuanceAttemptRecord> {
  const [record] = await transaction
    .insert(nfseIssuanceAttempts)
    .values({
      attemptKind: input.attemptKind,
      attemptNumber: sql`coalesce((select max(${nfseIssuanceAttempts.attemptNumber}) from ${nfseIssuanceAttempts} where ${nfseIssuanceAttempts.companyId} = ${companyId} and ${nfseIssuanceAttempts.invoiceId} = ${input.invoiceId}), 0) + 1`,
      companyId,
      correlationId: input.correlationId,
      fiscalEnvironment: input.fiscalEnvironment,
      idempotencyFingerprint: input.requestFingerprint,
      idempotencyKey: input.idempotencyKey,
      invoiceId: input.invoiceId,
      requestFingerprint: input.requestFingerprint,
      status: PENDING_ATTEMPT_STATUS,
    })
    .returning(ATTEMPT_COLUMNS)
  if (record === undefined) throw new Error('NFS-e issuance attempt insert returned no row')
  return mapAttempt(record)
}

async function savePayload(
  transaction: NfseTransaction,
  companyId: string,
  input: SaveNfseIssuancePayloadInput,
): Promise<void> {
  await transaction.insert(nfseIssuancePayloads).values({
    attemptId: input.attemptId,
    companyId,
    invoiceId: input.invoiceId,
    payload: input.payload,
    payloadSha256: input.payloadSha256,
    providerConfig: input.providerConfig,
  })
}

async function appendEvent(
  transaction: NfseTransaction,
  companyId: string,
  input: AppendNfseIssuanceEventInput,
): Promise<void> {
  await transaction.insert(nfseIssuanceEvents).values({
    attemptId: input.attemptId,
    companyId,
    eventName: input.eventName,
    invoiceId: input.invoiceId,
    occurredAt: new Date(input.occurredAt),
    payload: input.payload,
  })
}

async function pushOutbox(
  transaction: NfseTransaction,
  companyId: string,
  input: PushNfseIssuanceOutboxInput,
): Promise<void> {
  await transaction.insert(nfseIssuanceOutbox).values({
    actorUserId: input.actorUserId,
    aggregateId: input.invoiceId,
    aggregateSubtype: AGGREGATE_SUBTYPE,
    aggregateType: AGGREGATE_TYPE,
    attemptFingerprint: input.attemptFingerprint,
    attemptId: input.attemptId,
    attemptKind: input.attemptKind,
    companyId,
    correlationId: input.correlationId,
    eventType: input.eventType,
    eventVersion: 1n,
    invoiceId: input.invoiceId,
    payload: input.payload,
    status: REQUESTED_OUTBOX_STATUS,
  })
}
