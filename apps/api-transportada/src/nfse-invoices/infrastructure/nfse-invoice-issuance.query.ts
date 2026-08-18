/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { type SQL, and, eq, inArray, isNull, ne } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { freightRuleVersions } from '../../database/freight.schema.js'
import type { NfseFiscalEnvironment } from '../../database/nfse.schema.js'
import {
  nfseEmissionProfiles,
  nfseIssuanceAttempts,
  nfseIssuancePayloads,
  nfseProviderCredentials,
  nfseServiceInvoiceDocuments,
} from '../../database/nfse.schema.js'

export const NFSE_CANCELLED_BATCH_STATUS = 'cancelled'
export const NFSE_ACTIVE_STATUS = 'active'

export type NfseInvoiceLinkQuery = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

/** Lote cancelado devolve a nota para a seleção — é o mesmo recorte que a prévia do CT-e lê. */
export function buildActiveCteBatchLinkFilters(query: NfseInvoiceLinkQuery): readonly SQL[] {
  return [
    eq(cteBatchItemDocuments.companyId, query.companyId),
    inArray(cteBatchItemDocuments.nfeDocumentId, [...query.documentIds]),
    ne(cteBatches.status, NFSE_CANCELLED_BATCH_STATUS),
  ]
}

/** Sem o `company_id` na condição, o join alcançaria lote de outra empresa pelo batchId sozinho. */
export function buildActiveCteBatchLinkJoin(): SQL {
  return and(
    eq(cteBatches.companyId, cteBatchItemDocuments.companyId),
    eq(cteBatches.id, cteBatchItemDocuments.batchId),
  )!
}

/**
 * `cancelled_at is null` é o mesmo recorte do índice parcial único de
 * `nfse_service_invoice_documents`: cancelar a nota devolve o documento para a seleção.
 */
export function buildActiveInvoiceLinkFilters(query: NfseInvoiceLinkQuery): readonly SQL[] {
  return [
    eq(nfseServiceInvoiceDocuments.companyId, query.companyId),
    inArray(nfseServiceInvoiceDocuments.nfeDocumentId, [...query.documentIds]),
    isNull(nfseServiceInvoiceDocuments.cancelledAt),
  ]
}

export function buildNfseProfileFilters(input: {
  readonly companyId: string
  readonly profileId: string
}): readonly SQL[] {
  return [
    eq(nfseEmissionProfiles.companyId, input.companyId),
    eq(nfseEmissionProfiles.id, input.profileId),
  ]
}

/** A versão publicada da regra é o percentual que a nota congela — nunca a regra viva. */
export function buildActiveFreightRuleVersionFilters(input: {
  readonly companyId: string
  readonly freightRuleId: string
}): readonly SQL[] {
  return [
    eq(freightRuleVersions.companyId, input.companyId),
    eq(freightRuleVersions.freightRuleId, input.freightRuleId),
    eq(freightRuleVersions.status, NFSE_ACTIVE_STATUS),
  ]
}

export function buildFiscalEnvironmentFilters(input: {
  readonly companyId: string
}): readonly SQL[] {
  return [eq(companyFiscalProfiles.companyId, input.companyId)]
}

/** Ambiente fiscal entra na condição: homologação e produção têm credenciais distintas. */
export function buildActiveCredentialFilters(input: {
  readonly companyId: string
  readonly fiscalEnvironment: NfseFiscalEnvironment
}): readonly SQL[] {
  return [
    eq(nfseProviderCredentials.companyId, input.companyId),
    eq(nfseProviderCredentials.fiscalEnvironment, input.fiscalEnvironment),
    eq(nfseProviderCredentials.status, NFSE_ACTIVE_STATUS),
  ]
}

/**
 * A chave de idempotência é escolhida pelo cliente: sem o `company_id` na condição, uma chave
 * repetida por outra transportadora devolveria a tentativa dela como replay.
 */
export function buildAttemptIdempotencyFilters(input: {
  readonly companyId: string
  readonly idempotencyKey: string
}): readonly SQL[] {
  return [
    eq(nfseIssuanceAttempts.companyId, input.companyId),
    eq(nfseIssuanceAttempts.idempotencyKey, input.idempotencyKey),
  ]
}

/** O RPS congelado da tentativa mais recente — o que a reemissão retransmite sem recalcular. */
export function buildLatestPayloadFilters(input: {
  readonly companyId: string
  readonly invoiceId: string
}): readonly SQL[] {
  return [
    eq(nfseIssuancePayloads.companyId, input.companyId),
    eq(nfseIssuancePayloads.invoiceId, input.invoiceId),
  ]
}

/** Sem o `company_id` na condição, o join alcançaria a tentativa de outra empresa pelo attemptId. */
export function buildLatestPayloadAttemptJoin(): SQL {
  return and(
    eq(nfseIssuanceAttempts.companyId, nfseIssuancePayloads.companyId),
    eq(nfseIssuanceAttempts.id, nfseIssuancePayloads.attemptId),
  )!
}
