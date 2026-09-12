/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { DocumentOutputClassification } from '../../cte-profiles/domain/document-output.policy.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'
import { canonicalStringify } from './whatsapp-flow-graph-diff.policy.js'

export type PreviewDigestEntry = Readonly<{
  classification: DocumentOutputClassification
  documentId: string
  freightAmount: string | null
  nfseProfileId: string | null
  profileId: string | null
  takerTaxId: string | null
}>

export type PreviewProfileVersion = Readonly<{
  kind: 'cte' | 'nfse'
  profileId: string
  version: string
}>

export type PreviewDigestInput = Readonly<{
  dueDate: string | null
  entries: readonly PreviewDigestEntry[]
  period: string | null
  profileVersions: readonly PreviewProfileVersion[]
}>

/**
 * D5: o hash cobre **o que o usuário viu**, não só os ids. Mudar a regra de frete entre a prévia e o
 * toque produz os mesmos ids com outro valor — e emitir um número que ninguém viu é o que isto
 * impede. Fica de fora tudo o que não é decisão: `expires_at`, ids de mensagem, rótulos.
 *
 * Canônico: linhas ordenadas por documento, versões por perfil, chaves ordenadas no JSON e o
 * tomador sem máscara nem caixa baixa — duas grafias do mesmo CNPJ não são duas prévias.
 */
export function buildPreviewDigest(input: PreviewDigestInput): string {
  const documents = [...input.entries]
    .toSorted((left, right) => left.documentId.localeCompare(right.documentId))
    .map((entry) => [
      entry.documentId,
      entry.classification.output,
      entry.classification.output === 'blocked' || entry.classification.output === 'no_profile'
        ? entry.classification.reason
        : null,
      entry.profileId,
      entry.nfseProfileId,
      entry.takerTaxId === null ? null : normalizeTaxId(entry.takerTaxId),
      entry.freightAmount,
    ])
  const profiles = [...input.profileVersions]
    .toSorted((left, right) =>
      `${left.kind}:${left.profileId}`.localeCompare(`${right.kind}:${right.profileId}`),
    )
    .map((profile) => [profile.kind, profile.profileId, profile.version])
  const canonical = canonicalStringify({
    documents,
    dueDate: input.dueDate,
    period: input.period,
    profiles,
  })
  return createHash('sha256').update(canonical).digest('hex')
}
