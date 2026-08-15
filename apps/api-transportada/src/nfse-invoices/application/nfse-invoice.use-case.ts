/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightRuleSnapshot } from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import { NfseEmissionProfileNotFoundError } from '../../nfse-profiles/domain/nfse-profile.error.js'
import {
  NfseCredentialMissingError,
  NfseFiscalSettingsMissingError,
  NfseInvoiceCreateSpansMultipleTakersError,
} from '../domain/nfse-issuance.error.js'
import {
  assertNoNfseBlocks,
  assertProfileIsActive,
  resolveNfseCandidates,
} from './nfse-invoice-candidates.service.js'
import {
  type NfseInvoicePreview,
  type NfseInvoicePreviewItem,
  buildNfseInvoicePreview,
} from './nfse-invoice-preview.service.js'
import type {
  NfseInvoiceCompanyContext,
  NfseInvoiceCredential,
  NfseInvoiceProfile,
  NfseInvoiceReaderPort,
  NfseInvoiceRepositoryPort,
  NfseInvoiceTransactionPort,
} from './nfse-invoice.port.js'
import {
  type NfseInvoiceSummary,
  createInvoiceFingerprint,
  findReplaySummary,
  freezeNfseIssuancePayload,
  scheduleNfseIssuance,
} from './nfse-issuance-attempt.service.js'

const REQUESTED_STATUS = 'requested'

type ResolvedNfseInvoice = {
  readonly invoice: NfseInvoicePreviewItem
  readonly ruleSnapshot: FreightRuleSnapshot
}

export type PreviewNfseInvoiceInput = {
  readonly context: NfseInvoiceCompanyContext
  readonly descriptionTemplate?: string | undefined
  readonly documentIds: readonly string[]
  readonly profileId: string
}

export type CreateNfseInvoiceInput = PreviewNfseInvoiceInput & {
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type NfseInvoiceUseCase = {
  create(input: CreateNfseInvoiceInput): Promise<NfseInvoiceSummary>
  preview(input: PreviewNfseInvoiceInput): Promise<NfseInvoicePreview>
}

export function createNfseInvoiceUseCase(dependencies: {
  readonly now: () => Date
  readonly repository: NfseInvoiceRepositoryPort
}): NfseInvoiceUseCase {
  const { now, repository } = dependencies

  return {
    async create(input) {
      const requestFingerprint = createInvoiceFingerprint({
        descriptionTemplate: input.descriptionTemplate ?? '',
        documentIds: input.documentIds,
        profileId: input.profileId,
      })

      return repository.transaction({ companyId: input.context.companyId }, async (transaction) => {
        const replay = await findReplaySummary({
          idempotencyKey: input.idempotencyKey,
          requestFingerprint,
          status: REQUESTED_STATUS,
          transaction,
        })
        if (replay !== null) return replay

        const profile = assertProfileIsActive(await loadProfile(transaction, input))
        const credential = await loadCredential(transaction, input.context.companyId)
        const resolved = await resolveSingleInvoice({ input, profile, reader: transaction })

        return persistInvoice({
          credential,
          input,
          now,
          profile,
          requestFingerprint,
          transaction,
          ...resolved,
        })
      })
    },

    async preview(input) {
      const profile = await loadProfile(repository, input)
      const resolution = await resolveNfseCandidates({
        companyId: input.context.companyId,
        documentIds: input.documentIds,
        profile,
        reader: repository,
      })

      return buildNfseInvoicePreview({
        descriptionTemplate: input.descriptionTemplate,
        profile,
        resolution,
      })
    },
  }
}

async function loadProfile(
  reader: NfseInvoiceReaderPort,
  input: PreviewNfseInvoiceInput,
): Promise<NfseInvoiceProfile> {
  const profile = await reader.findProfile({
    companyId: input.context.companyId,
    profileId: input.profileId,
  })
  if (profile === null) throw new NfseEmissionProfileNotFoundError()
  return profile
}

async function loadCredential(
  reader: NfseInvoiceReaderPort,
  companyId: string,
): Promise<NfseInvoiceCredential> {
  const fiscalEnvironment = await reader.findFiscalEnvironment({ companyId })
  if (fiscalEnvironment === null) throw new NfseFiscalSettingsMissingError()

  const credential = await reader.findActiveCredential({ companyId, fiscalEnvironment })
  if (credential === null) throw new NfseCredentialMissingError()
  return credential
}

/** A criação recebe um grupo por vez: dois tomadores na mesma seleção seriam duas notas. */
async function resolveSingleInvoice({
  input,
  profile,
  reader,
}: {
  readonly input: CreateNfseInvoiceInput
  readonly profile: NfseInvoiceProfile
  readonly reader: NfseInvoiceReaderPort
}): Promise<ResolvedNfseInvoice> {
  const resolution = await resolveNfseCandidates({
    companyId: input.context.companyId,
    documentIds: input.documentIds,
    profile,
    reader,
  })
  assertNoNfseBlocks(resolution.blocked)

  const preview = buildNfseInvoicePreview({
    descriptionTemplate: input.descriptionTemplate,
    profile,
    resolution,
  })
  const [invoice] = preview.invoices
  if (invoice === undefined || preview.invoices.length > 1) {
    throw new NfseInvoiceCreateSpansMultipleTakersError()
  }
  return { invoice, ruleSnapshot: resolution.profile.ruleSnapshot }
}

async function persistInvoice({
  credential,
  input,
  invoice,
  now,
  profile,
  requestFingerprint,
  ruleSnapshot,
  transaction,
}: ResolvedNfseInvoice & {
  readonly credential: NfseInvoiceCredential
  readonly input: CreateNfseInvoiceInput
  readonly now: () => Date
  readonly profile: NfseInvoiceProfile
  readonly requestFingerprint: string
  readonly transaction: NfseInvoiceTransactionPort
}): Promise<NfseInvoiceSummary> {
  const documentIds = invoice.documents.map((document) => document.documentId)
  const record = await transaction.createInvoice({
    calculationSnapshot: {
      adjustments: invoice.adjustments,
      baseAmount: invoice.baseAmount,
      calculatedAmount: invoice.calculatedAmount,
      components: invoice.components,
      fiscalComponents: invoice.fiscalComponents,
      percentage: invoice.percentage,
      ruleSnapshot,
    },
    createdByUserId: input.context.userId,
    description: invoice.description,
    emissionProfileId: profile.id,
    issAmount: invoice.issAmount,
    serviceAmount: invoice.serviceAmount,
    takerLegalName: invoice.takerLegalName,
    takerTaxId: invoice.takerTaxId,
  })

  await transaction.linkDocuments({ documentIds, invoiceId: record.invoiceId })
  await transaction.createCharges({ charges: invoice.charges, invoiceId: record.invoiceId })

  const attempt = await transaction.createAttempt({
    attemptKind: 'issue',
    correlationId: input.correlationId,
    fiscalEnvironment: credential.fiscalEnvironment,
    idempotencyKey: input.idempotencyKey,
    invoiceId: record.invoiceId,
    requestFingerprint,
  })
  await transaction.savePayload(
    freezeNfseIssuancePayload({
      attemptId: attempt.attemptId,
      credential,
      invoice,
      invoiceId: record.invoiceId,
      profile,
    }),
  )

  const occurredAt = now().toISOString()
  await scheduleNfseIssuance({
    attemptId: attempt.attemptId,
    correlationId: input.correlationId,
    fiscalEnvironment: credential.fiscalEnvironment,
    invoiceId: record.invoiceId,
    occurredAt,
    requestFingerprint: attempt.requestFingerprint,
    transaction,
    userId: input.context.userId,
  })

  return {
    attemptId: attempt.attemptId,
    documentIds,
    invoiceId: record.invoiceId,
    replayed: false,
    requestedAt: occurredAt,
    status: record.status,
  }
}
