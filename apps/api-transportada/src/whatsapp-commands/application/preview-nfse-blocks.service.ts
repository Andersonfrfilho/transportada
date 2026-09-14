/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T012 — o que derrubaria a NFS-e depois vira bloqueio **na prévia**: a credencial da
 * Nota RP pelo mesmo `loadNfseCredential` do `create`, e o endereço do tomador pela mesma prévia de
 * NFS-e que o painel mostra. Nenhuma das duas regras é reescrita aqui.
 */
import type { DocumentOutputClassification } from '../../cte-profiles/domain/document-output.policy.js'
import type { NfseInvoiceReaderPort } from '../../nfse-invoices/application/nfse-invoice.port.js'
import type { NfseInvoicePreview } from '../../nfse-invoices/application/nfse-invoice-preview.service.js'
import { loadNfseCredential } from '../../nfse-invoices/application/nfse-issuance-attempt.service.js'
import {
  NfseCredentialMissingError,
  NfseFiscalSettingsMissingError,
} from '../../nfse-invoices/domain/nfse-issuance.error.js'
import { NFSE_SELECTION_BLOCK_REASON } from '../../nfse-invoices/domain/nfse-selection.policy.js'
import { ApiError } from '../../shared/api.error.js'
import type { PreviewDigestEntry } from '../domain/issuance-preview-digest.policy.js'

export type PreviewEntry = PreviewDigestEntry &
  Readonly<{ number: string; profileVersion: string | null }>

export type PreviewNfseDependencies = Readonly<{
  /** O código do que falta para a Nota RP emitir, ou `undefined` quando a credencial está ativa. */
  findNfseCredentialGap: (input: { readonly companyId: string }) => Promise<string | undefined>
  previewNfseInvoices: (input: {
    readonly context: { readonly companyId: string; readonly userId: string }
    readonly documentIds: readonly string[]
    readonly period?: string | undefined
    readonly profileId: string
  }) => Promise<NfseInvoicePreview>
}>

type NfseScope = Readonly<{ companyId: string; period: string | undefined; userId: string }>

/** A falta de credencial devolvida como código, e não lançada: na prévia ela é bloqueio de nota. */
export function createNfseCredentialGapFinder(
  reader: NfseInvoiceReaderPort,
): PreviewNfseDependencies['findNfseCredentialGap'] {
  return async ({ companyId }) => {
    try {
      await loadNfseCredential(reader, companyId)
      return undefined
    } catch (error) {
      if (error instanceof NfseCredentialMissingError) return error.code
      if (error instanceof NfseFiscalSettingsMissingError) return error.code
      throw error
    }
  }
}

export async function applyNfseBlocks(input: {
  readonly deps: PreviewNfseDependencies
  readonly entries: readonly PreviewEntry[]
  readonly scope: NfseScope
}): Promise<readonly PreviewEntry[]> {
  const { deps, entries, scope } = input
  const groups = groupByNfseProfile(entries)
  if (groups.size === 0) return entries

  const gap = await deps.findNfseCredentialGap({ companyId: scope.companyId })
  if (gap !== undefined) {
    return entries.map((entry) =>
      entry.classification.output === 'nfse' ? block(entry, gap) : entry,
    )
  }

  const previewed = await Promise.all(
    [...groups].map(([profileId, group]) => previewNfseGroup({ deps, group, profileId, scope })),
  )
  const updated = new Map(previewed.flat().map((entry) => [entry.documentId, entry]))
  return entries.map((entry) => updated.get(entry.documentId) ?? entry)
}

export function block(entry: PreviewEntry, reason: string): PreviewEntry {
  const classification: DocumentOutputClassification = { output: 'blocked', reason }
  return { ...entry, classification, nfseProfileId: null }
}

/** Em branco é omitido, como na tela: ausente e `''` dizem a mesma coisa à NFS-e. */
export function normalizePeriod(period: string | undefined): string | undefined {
  const trimmed = period?.trim() ?? ''
  return trimmed === '' ? undefined : trimmed
}

function groupByNfseProfile(entries: readonly PreviewEntry[]): Map<string, PreviewEntry[]> {
  const groups = new Map<string, PreviewEntry[]>()
  for (const entry of entries) {
    if (entry.nfseProfileId === null || entry.classification.output !== 'nfse') continue
    const group = groups.get(entry.nfseProfileId) ?? []
    group.push(entry)
    groups.set(entry.nfseProfileId, group)
  }
  return groups
}

/** Tomador e valor da NFS-e saem da prévia dela: o perfil NFS-e tem `taker` e regra próprios (D3). */
async function previewNfseGroup(input: {
  readonly deps: PreviewNfseDependencies
  readonly group: readonly PreviewEntry[]
  readonly profileId: string
  readonly scope: NfseScope
}): Promise<readonly PreviewEntry[]> {
  const { companyId, period, userId } = input.scope
  let preview: NfseInvoicePreview
  try {
    preview = await input.deps.previewNfseInvoices({
      context: { companyId, userId },
      documentIds: input.group.map((entry) => entry.documentId),
      period: normalizePeriod(period),
      profileId: input.profileId,
    })
  } catch (error) {
    if (error instanceof ApiError) return input.group.map((entry) => block(entry, error.code))
    throw error
  }

  const reasonById = new Map(preview.blocked.map((item) => [item.documentId, item.reason]))
  const invoiceById = new Map(
    preview.invoices.flatMap((invoice) =>
      invoice.documents.map((document) => [document.documentId, invoice] as const),
    ),
  )
  return input.group.map((entry) => {
    const reason = reasonById.get(entry.documentId)
    if (reason !== undefined) return block(entry, reason)
    const invoice = invoiceById.get(entry.documentId)
    if (invoice === undefined) return block(entry, NFSE_SELECTION_BLOCK_REASON.notFound)
    return { ...entry, freightAmount: invoice.calculatedAmount, takerTaxId: invoice.takerTaxId }
  })
}
