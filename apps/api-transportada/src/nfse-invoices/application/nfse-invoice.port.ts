/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ChargeComponentPricing } from '../../cte-profiles/domain/charge-composition.service.js'
import type {
  NfseAttemptKind,
  NfseEmissionProfileStatus,
  NfseFiscalEnvironment,
  NfseIssExigibility,
  NfseIssuanceEvent,
  NfseIssuanceOutboxEventType,
  NfseProvider,
  NfseServiceInvoiceStatus,
  NfseTaker,
} from '../../database/nfse.schema.js'
import type { NfseSelectionDocument } from '../domain/nfse-selection.policy.js'

export type NfseInvoiceCompanyContext = {
  readonly companyId: string
  readonly userId: string
}

export type NfseInvoiceSelectionQuery = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

/** Vínculo ativo de um documento, seja com lote de CT-e, seja com outra nota de serviço. */
export type NfseInvoiceDocumentLink = {
  readonly documentId: string
  readonly ownerId: string
}

/**
 * O que a emissão precisa do perfil. É menos que `NfseEmissionProfileDetail` de propósito: o
 * módulo lê o perfil pela própria consulta, dentro da transação da nota, sem passar pelo
 * repositório de perfis — que abriria uma segunda transação na mesma conexão.
 */
export type NfseInvoiceProfile = {
  readonly chargeComponentLabel: string
  readonly cnaeCode: string
  readonly descriptionMaxLength: number
  readonly descriptionTemplate: string
  readonly freightRuleId: string
  readonly id: string
  readonly issExigibility: NfseIssExigibility
  readonly issRate: string
  readonly issWithheld: boolean
  readonly municipalityIbgeCode: string
  readonly municipalityName: string
  readonly municipalTaxationCode: string
  readonly nbsCode: string
  readonly observations: string
  readonly serviceListItem: string
  readonly status: NfseEmissionProfileStatus
  readonly taker: NfseTaker
}

/** A versão publicada da regra de frete, congelada no momento da criação da nota. */
export type NfseFreightRuleVersion = {
  readonly freightRuleVersionId: string
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly ruleVersion: string
  readonly validFrom: string
  readonly validUntil: string | null
}

/**
 * A credencial sai daqui sem nenhum segredo: só o que identifica o prestador no provedor. O token
 * continua selado em `secret_envelope` e é o worker quem o abre na hora de transmitir.
 */
export type NfseInvoiceCredential = {
  readonly credentialId: string
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly municipalRegistration: string
  readonly provider: NfseProvider
  readonly taxId: string
}

export type NfseIssuanceAttemptRecord = {
  readonly attemptId: string
  readonly attemptNumber: number
  readonly createdAt: string
  readonly invoiceId: string
  readonly requestFingerprint: string
}

export type NfseInvoiceRecord = {
  readonly createdAt: string
  readonly invoiceId: string
  readonly status: NfseServiceInvoiceStatus
  readonly version: string
}

export type CreateNfseInvoiceRecordInput = {
  readonly calculationSnapshot: Readonly<Record<string, unknown>>
  readonly createdByUserId: string
  readonly description: string
  readonly emissionProfileId: string
  readonly issAmount: string
  readonly serviceAmount: string
  readonly takerLegalName: string
  readonly takerTaxId: string
}

export type LinkNfseInvoiceDocumentsInput = {
  readonly documentIds: readonly string[]
  readonly invoiceId: string
}

export type CreateNfseInvoiceChargesInput = {
  readonly charges: readonly ChargeComponentPricing[]
  readonly invoiceId: string
}

export type CreateNfseIssuanceAttemptInput = {
  readonly attemptKind: NfseAttemptKind
  readonly correlationId: string
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly idempotencyKey: string
  readonly invoiceId: string
  readonly requestFingerprint: string
}

export type NfseInvoiceListFilters = {
  readonly createdFrom?: string | undefined
  readonly createdUntil?: string | undefined
  readonly statusIn?: readonly NfseServiceInvoiceStatus[] | undefined
  readonly takerTaxIdEq?: string | undefined
}

export type NfseInvoiceCursor = {
  readonly createdAt: string
  readonly id: string
}

/** O que a listagem mostra por linha. Nada de snapshot de cálculo nem de payload fiscal. */
export type NfseInvoiceListItem = {
  readonly authorizedAt: string | null
  readonly cancelledAt: string | null
  readonly createdAt: string
  readonly documentCount: number
  readonly emissionProfileId: string
  readonly id: string
  readonly issAmount: string
  readonly providerNumber: string | null
  readonly serviceAmount: string
  readonly status: NfseServiceInvoiceStatus
  readonly takerLegalName: string
  readonly takerTaxId: string
  readonly updatedAt: string
  readonly verificationCode: string | null
}

export type NfseInvoicePage = {
  readonly items: readonly NfseInvoiceListItem[]
  readonly nextCursor: string | null
}

export type NfseInvoiceChargeLine = {
  readonly amount: string
  readonly baseAmount: string
  readonly calculationType: string
  readonly label: string
  readonly ordinal: number
  readonly rate: string
}

export type NfseInvoiceDetail = NfseInvoiceListItem & {
  readonly cancellationReason: string | null
  readonly charges: readonly NfseInvoiceChargeLine[]
  readonly description: string
  readonly rejectionCode: string | null
  readonly rejectionMessage: string | null
  readonly version: string
}

/** `cancelledAt` preenchido é o vínculo que já voltou para a seleção; ele fica no detalhe como histórico. */
export type NfseInvoiceLinkedDocument = {
  readonly accessKey: string
  readonly cancelledAt: string | null
  readonly documentId: string
  readonly issuedAt: string
  readonly number: string
  readonly position: number
  readonly series: string
  readonly totalAmount: string
}

export const NFSE_FISCAL_DOCUMENT_KIND = {
  pdf: 'pdf',
  xml: 'xml',
} as const

export type NfseFiscalDocumentKind =
  (typeof NFSE_FISCAL_DOCUMENT_KIND)[keyof typeof NFSE_FISCAL_DOCUMENT_KIND]

/** Localização do objeto arquivado. O XML fiscal nunca atravessa a API: sai por URL assinada. */
export type NfseFiscalDocumentLocation = {
  readonly bucket: string
  readonly key: string
  readonly mimeType: string
  readonly sha256: string
}

export type NfseFiscalDocumentDownload = {
  readonly expiresAt: string
  readonly url: string
}

/** O arquivo sai por URL assinada de vida curta: o XML fiscal nunca passa pelo corpo da resposta. */
export type NfseFiscalDocumentArchivePort = {
  createDownloadUrl(input: {
    readonly bucket: string
    readonly fileName: string
    readonly key: string
  }): Promise<NfseFiscalDocumentDownload>
}

export type NfseInvoiceCancellationTarget = {
  readonly invoiceId: string
  readonly status: NfseServiceInvoiceStatus
  readonly version: string
}

export type ReleaseNfseInvoiceLinksInput = {
  readonly cancelledAt: string
  readonly invoiceId: string
}

export type MarkNfseInvoiceCancellationInput = {
  readonly cancellationReason: string
  readonly invoiceId: string
  readonly requestedAt: string
  readonly status: NfseServiceInvoiceStatus
}

export type AppendNfseIssuanceEventInput = {
  readonly attemptId: string
  readonly eventName: NfseIssuanceEvent
  readonly invoiceId: string
  readonly occurredAt: string
  readonly payload: Readonly<Record<string, unknown>>
}

export type SaveNfseIssuancePayloadInput = {
  readonly attemptId: string
  readonly invoiceId: string
  readonly payload: Readonly<Record<string, unknown>>
  readonly payloadSha256: string
  readonly providerConfig: Readonly<Record<string, unknown>>
}

export type PushNfseIssuanceOutboxInput = {
  readonly actorUserId: string
  readonly attemptFingerprint: string
  readonly attemptId: string
  readonly attemptKind: NfseAttemptKind
  readonly correlationId: string
  readonly eventType: NfseIssuanceOutboxEventType
  readonly invoiceId: string
  readonly payload: Readonly<Record<string, unknown>>
}

/** Toda leitura já nasce no escopo de uma empresa — nenhuma recebe `companyId` do cliente. */
export type NfseInvoiceReaderPort = {
  findActiveCteBatchLinks(
    query: NfseInvoiceSelectionQuery,
  ): Promise<readonly NfseInvoiceDocumentLink[]>
  findActiveCredential(input: {
    readonly companyId: string
    readonly fiscalEnvironment: NfseFiscalEnvironment
  }): Promise<NfseInvoiceCredential | null>
  findActiveInvoiceLinks(
    query: NfseInvoiceSelectionQuery,
  ): Promise<readonly NfseInvoiceDocumentLink[]>
  findFiscalEnvironment(input: {
    readonly companyId: string
  }): Promise<NfseFiscalEnvironment | null>
  findFiscalDocumentLocation(input: {
    readonly companyId: string
    readonly invoiceId: string
    readonly kind: NfseFiscalDocumentKind
  }): Promise<NfseFiscalDocumentLocation | null>
  findFreightRuleVersion(input: {
    readonly companyId: string
    readonly freightRuleId: string
  }): Promise<NfseFreightRuleVersion | null>
  findInvoiceDetail(input: {
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<NfseInvoiceDetail | null>
  findInvoiceDocuments(input: {
    readonly companyId: string
    readonly invoiceId: string
  }): Promise<readonly NfseInvoiceLinkedDocument[]>
  findProfile(input: {
    readonly companyId: string
    readonly profileId: string
  }): Promise<NfseInvoiceProfile | null>
  findSelectionDocuments(
    query: NfseInvoiceSelectionQuery,
  ): Promise<readonly NfseSelectionDocument[]>
  listInvoices(input: {
    readonly companyId: string
    readonly cursor: NfseInvoiceCursor | null
    readonly filters?: NfseInvoiceListFilters | undefined
    readonly limit: number
  }): Promise<NfseInvoicePage>
}

export type NfseInvoiceTransactionPort = NfseInvoiceReaderPort & {
  appendEvent(input: AppendNfseIssuanceEventInput): Promise<void>
  createAttempt(input: CreateNfseIssuanceAttemptInput): Promise<NfseIssuanceAttemptRecord>
  createCharges(input: CreateNfseInvoiceChargesInput): Promise<void>
  createInvoice(input: CreateNfseInvoiceRecordInput): Promise<NfseInvoiceRecord>
  findAttemptByIdempotencyKey(input: {
    readonly idempotencyKey: string
  }): Promise<NfseIssuanceAttemptRecord | null>
  findInvoiceForUpdate(input: {
    readonly invoiceId: string
  }): Promise<NfseInvoiceCancellationTarget | null>
  linkDocuments(input: LinkNfseInvoiceDocumentsInput): Promise<void>
  markCancellationRequested(input: MarkNfseInvoiceCancellationInput): Promise<void>
  pushOutbox(input: PushNfseIssuanceOutboxInput): Promise<void>
  releaseDocumentLinks(input: ReleaseNfseInvoiceLinksInput): Promise<readonly string[]>
  savePayload(input: SaveNfseIssuancePayloadInput): Promise<void>
}

export type NfseInvoiceRepositoryPort = NfseInvoiceReaderPort & {
  transaction<TResult>(
    scope: { readonly companyId: string },
    handler: (transaction: NfseInvoiceTransactionPort) => Promise<TResult>,
  ): Promise<TResult>
}
