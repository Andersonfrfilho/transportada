/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  NfseFiscalEnvironment,
  NfseServiceInvoiceStatus,
} from '../../src/database/nfse.schema'
import type {
  AppendNfseIssuanceEventInput,
  CreateNfseInvoiceChargesInput,
  CreateNfseInvoiceRecordInput,
  CreateNfseIssuanceAttemptInput,
  LinkNfseInvoiceDocumentsInput,
  MarkNfseInvoiceCancellationInput,
  MarkNfseInvoiceDiscardedInput,
  MarkNfseInvoiceIssuingInput,
  NfseFiscalDocumentLocation,
  NfseFrozenIssuancePayload,
  NfseFreightRuleVersion,
  NfseInvoiceCredential,
  NfseInvoiceDetail,
  NfseInvoiceDocumentLink,
  NfseInvoiceLinkedDocument,
  NfseInvoicePage,
  NfseInvoiceProfile,
  NfseInvoiceRepositoryPort,
  NfseInvoiceTransactionPort,
  PushNfseIssuanceOutboxInput,
  ReleaseNfseInvoiceLinksInput,
  SaveNfseIssuancePayloadInput,
} from '../../src/nfse-invoices/application/nfse-invoice.port'
import type { NfseSelectionDocument } from '../../src/nfse-invoices/domain/nfse-selection.policy'
import type { NfsePartyAddress } from '../../src/nfse-invoices/domain/nfse-taker-address.policy'

export const COMPANY_ID = '00000000-0000-4000-8000-0000000000d1'
export const USER_ID = '00000000-0000-4000-8000-0000000000d2'
export const PROFILE_ID = '00000000-0000-4000-8000-0000000000d3'
export const FREIGHT_RULE_ID = '00000000-0000-4000-8000-0000000000d4'
export const RULE_VERSION_ID = '00000000-0000-4000-8000-0000000000d5'
export const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d6'
export const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d7'
export const CREDENTIAL_ID = '00000000-0000-4000-8000-0000000000d8'
export const INVOICE_ID = '00000000-0000-4000-8000-0000000000d9'
export const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000da'
export const CORRELATION_ID = 'nfse-invoice-application-correlation'
export const IDEMPOTENCY_KEY = 'nfse-invoice-application-key-0001'
export const NOW = '2026-08-12T12:00:00.000Z'

export const CONTEXT = { companyId: COMPANY_ID, userId: USER_ID } as const

export const PROFILE: NfseInvoiceProfile = {
  chargeComponentLabel: 'Frete',
  cnaeCode: '4930202',
  descriptionMaxLength: 2000,
  descriptionTemplate: 'Transporte rodoviário de cargas referente às notas {{notas}}.',
  freightRuleId: FREIGHT_RULE_ID,
  id: PROFILE_ID,
  issExigibility: '1',
  issRate: '0.050000',
  issWithheld: false,
  municipalTaxationCode: '',
  municipalityIbgeCode: '3543402',
  municipalityName: 'Ribeirão Preto',
  nbsCode: '',
  observations: '',
  serviceListItem: '16.01',
  status: 'active',
  taker: '3',
}

export const RULE_VERSION: NfseFreightRuleVersion = {
  freightRuleVersionId: RULE_VERSION_ID,
  maximumAmount: null,
  minimumAmount: null,
  percentage: '0.085000',
  ruleVersion: '2',
  validFrom: '2020-01-01T00:00:00.000Z',
  validUntil: null,
}

export const CREDENTIAL: NfseInvoiceCredential = {
  credentialId: CREDENTIAL_ID,
  fiscalEnvironment: 'homologation',
  municipalRegistration: '123456',
  provider: 'notarp',
  taxId: '12345678000199',
}

export const RECIPIENT_ADDRESS: NfsePartyAddress = {
  city: 'Ribeirão Preto',
  complement: 'Sala 12',
  district: 'Centro',
  number: '1500',
  phone: '1633334444',
  postalCode: '14010100',
  state: 'SP',
  street: 'Avenida Nove de Julho',
}

export const SENDER_ADDRESS: NfsePartyAddress = {
  city: 'Campinas',
  complement: null,
  district: 'Cambuí',
  number: '210',
  phone: null,
  postalCode: '13024000',
  state: 'SP',
  street: 'Rua do Depósito',
}

export function selectionDocument(
  overrides: Partial<NfseSelectionDocument> = {},
): NfseSelectionDocument {
  return {
    accessKey: '35260812345678000199550010000001231000000123',
    documentId: DOCUMENT_ID,
    issuedAt: '2026-08-01T10:00:00.000Z',
    number: '000000123',
    recipientAddress: RECIPIENT_ADDRESS,
    recipientCity: 'Ribeirão Preto',
    recipientLegalName: 'Cliente Sintético Ltda',
    recipientState: 'SP',
    recipientTaxId: '98765432000188',
    senderAddress: SENDER_ADDRESS,
    senderCity: 'Campinas',
    senderLegalName: 'Remetente Sintético Ltda',
    senderState: 'SP',
    senderTaxId: '12345678000199',
    series: '001',
    status: 'authorized',
    totalAmount: '10000.0000',
    variant: 'complete',
    ...overrides,
  }
}

export const INVOICE_DETAIL: NfseInvoiceDetail = {
  authorizedAt: '2026-08-02T10:00:00.000Z',
  cancellationReason: null,
  cancelledAt: null,
  charges: [
    {
      amount: '850.0000',
      baseAmount: '10000.0000',
      calculationType: 'percentage',
      label: 'Frete',
      ordinal: 1,
      rate: '0.085000',
    },
  ],
  createdAt: '2026-08-01T12:00:00.000Z',
  delivery: {
    attemptCount: 1,
    lastErrorCause: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    nextAttemptAt: null,
    status: 'authorized',
    updatedAt: '2026-08-02T10:00:00.000Z',
  },
  description: 'Transporte rodoviário de cargas referente às notas 000000123.',
  documentCount: 1,
  emissionProfileId: PROFILE_ID,
  id: INVOICE_ID,
  issAmount: '42.5000',
  providerNumber: '2026000123',
  rejectionCode: null,
  rejectionMessage: null,
  serviceAmount: '850.0000',
  status: 'authorized',
  takerLegalName: 'Cliente Sintético Ltda',
  takerTaxId: '98765432000188',
  updatedAt: '2026-08-02T10:00:00.000Z',
  verificationCode: 'ABC123',
  version: '3',
}

export const LINKED_DOCUMENT: NfseInvoiceLinkedDocument = {
  accessKey: '35260812345678000199550010000001231000000123',
  cancelledAt: null,
  documentId: DOCUMENT_ID,
  issuedAt: '2026-08-01T10:00:00.000Z',
  number: '000000123',
  position: 1,
  series: '001',
  totalAmount: '10000.0000',
}

/** O RPS que a primeira tentativa congelou: é ele que a reemissão retransmite, com o mesmo hash. */
export const FROZEN_PAYLOAD: NfseFrozenIssuancePayload = {
  payload: { description: 'Servicos de transporte', serviceAmount: '10000.0000' },
  payloadSha256: 'b'.repeat(64),
}

/**
 * Mesma forma que `freezeNfseIssuancePayload` grava de verdade — os nove campos corrigíveis mais
 * `serviceAmount`/`issAmount`/`taker`/`documents`, é o que o detalhe da fatura passa a expor em
 * `lastPayload` para o diálogo de reemissão pré-preencher.
 */
export const FULL_FROZEN_PAYLOAD: NfseFrozenIssuancePayload = {
  payload: {
    cnaeCode: PROFILE.cnaeCode,
    description: INVOICE_DETAIL.description,
    documents: [
      {
        accessKey: LINKED_DOCUMENT.accessKey,
        documentId: LINKED_DOCUMENT.documentId,
        number: LINKED_DOCUMENT.number,
        series: LINKED_DOCUMENT.series,
        totalAmount: LINKED_DOCUMENT.totalAmount,
      },
    ],
    issAmount: INVOICE_DETAIL.issAmount,
    issExigibility: PROFILE.issExigibility,
    issRate: PROFILE.issRate,
    issWithheld: PROFILE.issWithheld,
    municipalityIbgeCode: PROFILE.municipalityIbgeCode,
    municipalTaxationCode: PROFILE.municipalTaxationCode,
    nbsCode: PROFILE.nbsCode,
    serviceAmount: INVOICE_DETAIL.serviceAmount,
    serviceListItem: PROFILE.serviceListItem,
    taker: { legalName: INVOICE_DETAIL.takerLegalName, taxId: INVOICE_DETAIL.takerTaxId },
  },
  payloadSha256: 'c'.repeat(64),
}

export const FISCAL_DOCUMENT_LOCATION: NfseFiscalDocumentLocation = {
  bucket: 'transportada-fiscal',
  key: `nfse/${COMPANY_ID}/${INVOICE_ID}.xml`,
  mimeType: 'application/xml',
  sha256: 'a'.repeat(64),
}

export type NfseRepositoryState = {
  readonly attemptByKey: Map<
    string,
    { attemptNumber: number; createdAt: string; id: string; requestFingerprint: string }
  >
  readonly credential: NfseInvoiceCredential | null
  readonly cteBatchLinks: readonly NfseInvoiceDocumentLink[]
  readonly documents: readonly NfseSelectionDocument[]
  readonly fiscalDocumentLocation: NfseFiscalDocumentLocation | null
  readonly fiscalEnvironment: NfseFiscalEnvironment | null
  readonly frozenPayload: NfseFrozenIssuancePayload | null
  readonly invoiceDetail: NfseInvoiceDetail | null
  readonly invoiceDocuments: readonly NfseInvoiceLinkedDocument[]
  readonly invoiceLinks: readonly NfseInvoiceDocumentLink[]
  readonly invoicePage: NfseInvoicePage
  readonly invoiceStatus: NfseServiceInvoiceStatus
  readonly linkedDocumentIds: readonly string[]
  readonly profile: NfseInvoiceProfile | null
  readonly ruleVersion: NfseFreightRuleVersion | null
}

export type NfseRepositoryRecording = {
  readonly attempts: CreateNfseIssuanceAttemptInput[]
  readonly cancellations: MarkNfseInvoiceCancellationInput[]
  readonly charges: CreateNfseInvoiceChargesInput[]
  readonly discards: MarkNfseInvoiceDiscardedInput[]
  readonly events: AppendNfseIssuanceEventInput[]
  readonly invoices: CreateNfseInvoiceRecordInput[]
  readonly issuings: MarkNfseInvoiceIssuingInput[]
  readonly links: LinkNfseInvoiceDocumentsInput[]
  readonly outbox: PushNfseIssuanceOutboxInput[]
  readonly payloads: SaveNfseIssuancePayloadInput[]
  readonly queries: { input: unknown; name: string }[]
  readonly releases: ReleaseNfseInvoiceLinksInput[]
  readonly steps: string[]
  readonly transactionScopes: string[]
}

export function createNfseRepositoryFixture(overrides: Partial<NfseRepositoryState> = {}): {
  readonly recording: NfseRepositoryRecording
  readonly repository: NfseInvoiceRepositoryPort
  readonly state: NfseRepositoryState
} {
  const state: NfseRepositoryState = {
    attemptByKey: new Map(),
    credential: CREDENTIAL,
    cteBatchLinks: [],
    documents: [selectionDocument()],
    fiscalDocumentLocation: FISCAL_DOCUMENT_LOCATION,
    fiscalEnvironment: 'homologation',
    frozenPayload: FULL_FROZEN_PAYLOAD,
    invoiceDetail: INVOICE_DETAIL,
    invoiceDocuments: [LINKED_DOCUMENT],
    invoiceLinks: [],
    invoicePage: { items: [INVOICE_DETAIL], nextCursor: null },
    invoiceStatus: 'authorized',
    linkedDocumentIds: [DOCUMENT_ID],
    profile: PROFILE,
    ruleVersion: RULE_VERSION,
    ...overrides,
  }

  const recording: NfseRepositoryRecording = {
    attempts: [],
    cancellations: [],
    charges: [],
    discards: [],
    events: [],
    invoices: [],
    issuings: [],
    links: [],
    outbox: [],
    payloads: [],
    queries: [],
    releases: [],
    steps: [],
    transactionScopes: [],
  }

  const reader = {
    async findActiveCredential() {
      return state.credential
    },
    async findActiveCteBatchLinks() {
      return state.cteBatchLinks
    },
    async findActiveInvoiceLinks() {
      return state.invoiceLinks
    },
    async findFiscalDocumentLocation(input: unknown) {
      recording.queries.push({ input, name: 'findFiscalDocumentLocation' })
      return state.fiscalDocumentLocation
    },
    async findFiscalEnvironment() {
      return state.fiscalEnvironment
    },
    async findFreightRuleVersion() {
      return state.ruleVersion
    },
    async findInvoiceDetail(input: unknown) {
      recording.queries.push({ input, name: 'findInvoiceDetail' })
      return state.invoiceDetail
    },
    async findInvoiceDocuments(input: unknown) {
      recording.queries.push({ input, name: 'findInvoiceDocuments' })
      return state.invoiceDocuments
    },
    async findLatestPayload() {
      return state.frozenPayload
    },
    async findProfile() {
      return state.profile
    },
    async findSelectionDocuments() {
      return state.documents
    },
    async listInvoices(input: unknown) {
      recording.queries.push({ input, name: 'listInvoices' })
      return state.invoicePage
    },
  }

  const transaction: NfseInvoiceTransactionPort = {
    ...reader,
    async appendEvent(input) {
      recording.steps.push('appendEvent')
      recording.events.push(input)
    },
    async createAttempt(input) {
      recording.steps.push('createAttempt')
      recording.attempts.push(input)
      // No banco quem numera é o `max(attempt_number) + 1` do repositório; aqui, a contagem.
      const attemptNumber = recording.attempts.length
      state.attemptByKey.set(input.idempotencyKey, {
        attemptNumber,
        createdAt: NOW,
        id: ATTEMPT_ID,
        requestFingerprint: input.requestFingerprint,
      })
      return {
        attemptId: ATTEMPT_ID,
        attemptNumber,
        createdAt: NOW,
        invoiceId: input.invoiceId,
        requestFingerprint: input.requestFingerprint,
      }
    },
    async createCharges(input) {
      recording.steps.push('createCharges')
      recording.charges.push(input)
    },
    async createInvoice(input) {
      recording.steps.push('createInvoice')
      recording.invoices.push(input)
      return { createdAt: NOW, invoiceId: INVOICE_ID, status: 'requested', version: '1' }
    },
    async findAttemptByIdempotencyKey(input) {
      const attempt = state.attemptByKey.get(input.idempotencyKey)
      if (attempt === undefined) return null
      return {
        attemptId: attempt.id,
        attemptNumber: attempt.attemptNumber,
        createdAt: attempt.createdAt,
        invoiceId: INVOICE_ID,
        requestFingerprint: attempt.requestFingerprint,
      }
    },
    async findInvoiceForUpdate(input) {
      if (state.invoiceDetail === null) return null
      return { invoiceId: input.invoiceId, status: state.invoiceStatus, version: '3' }
    },
    async linkDocuments(input) {
      recording.steps.push('linkDocuments')
      recording.links.push(input)
    },
    async markCancellationRequested(input) {
      recording.steps.push('markCancellationRequested')
      recording.cancellations.push(input)
    },
    async markDiscarded(input) {
      recording.steps.push('markDiscarded')
      recording.discards.push(input)
    },
    async markIssuing(input) {
      recording.steps.push('markIssuing')
      recording.issuings.push(input)
    },
    async pushOutbox(input) {
      recording.steps.push('pushOutbox')
      recording.outbox.push(input)
    },
    async releaseDocumentLinks(input) {
      recording.steps.push('releaseDocumentLinks')
      recording.releases.push(input)
      return state.linkedDocumentIds
    },
    async savePayload(input) {
      recording.steps.push('savePayload')
      recording.payloads.push(input)
    },
  }

  const repository: NfseInvoiceRepositoryPort = {
    ...reader,
    async transaction(scope, handler) {
      recording.transactionScopes.push(scope.companyId)
      return handler(transaction)
    },
  }

  return { recording, repository, state }
}
