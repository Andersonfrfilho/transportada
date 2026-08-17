/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { buildNfseDescription } from '../domain/nfse-description.service.js'
import { type NfseProjection, projectNfseInvoices } from '../domain/nfse-projection.service.js'
import type { NfseSelectionBlock } from '../domain/nfse-selection.policy.js'
import type { NfseCandidateResolution } from './nfse-invoice-candidates.service.js'
import type { NfseInvoiceProfile } from './nfse-invoice.port.js'

export type NfseInvoicePreviewItem = NfseProjection & {
  readonly description: string
  readonly listedDocuments: number
  readonly omittedDocuments: number
}

export type NfseInvoicePreview = {
  readonly blocked: readonly NfseSelectionBlock[]
  readonly invoices: readonly NfseInvoicePreviewItem[]
}

export type BuildNfseInvoicePreviewParams = {
  readonly descriptionTemplate?: string | undefined
  readonly period?: string | undefined
  readonly profile: NfseInvoiceProfile
  readonly resolution: NfseCandidateResolution
}

/**
 * A prévia devolve os bloqueios como dado — quem seleciona precisa ver por que uma nota ficou de
 * fora antes de decidir emitir. Só a criação transforma o primeiro bloqueio em erro.
 */
export function buildNfseInvoicePreview({
  descriptionTemplate,
  period,
  profile,
  resolution,
}: BuildNfseInvoicePreviewParams): NfseInvoicePreview {
  const template = descriptionTemplate ?? profile.descriptionTemplate

  return {
    blocked: resolution.blocked,
    invoices: projectNfseInvoices(resolution.candidates).map((projection) =>
      describeProjection({ period, profile, projection, template }),
    ),
  }
}

function describeProjection({
  period,
  profile,
  projection,
  template,
}: {
  readonly period: string | undefined
  readonly profile: NfseInvoiceProfile
  readonly projection: NfseProjection
  readonly template: string
}): NfseInvoicePreviewItem {
  const description = buildNfseDescription({
    documents: projection.documents.map((document) => ({
      number: document.number,
      series: document.series,
    })),
    maxLength: profile.descriptionMaxLength,
    municipalityName: profile.municipalityName,
    observations: profile.observations,
    ...(period === undefined ? {} : { period }),
    template,
  })

  return { ...projection, ...description }
}
