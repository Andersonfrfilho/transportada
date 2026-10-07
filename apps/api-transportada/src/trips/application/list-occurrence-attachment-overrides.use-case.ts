/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 T5.3-api (RF11c): `GET /company-settings/occurrence-types/attachment-overrides` — as
 * exceções de contratante e de destinatário de TODOS os tipos da empresa numa resposta, agrupadas por
 * tipo. Três consultas, quantos forem os tipos: os ids, e as duas tabelas de exceção em lote. Cada
 * item tem o mesmo formato da rota por tipo (sem o `occurrenceTypeId`, que vira a chave do grupo).
 */
import type {
  OccurrenceAttachmentContractorOverride,
  OccurrenceAttachmentRecipientOverride,
  OccurrenceTypeOverridesByType,
} from '../infrastructure/drizzle-occurrence-attachment-overrides.repository.js'

export type OccurrenceTypeAttachmentOverrides = {
  readonly contractorOverrides: readonly OccurrenceAttachmentContractorOverride[]
  readonly occurrenceTypeId: string
  readonly recipientOverrides: readonly OccurrenceAttachmentRecipientOverride[]
}

export type ListOccurrenceAttachmentOverridesResult = {
  readonly overridesByType: readonly OccurrenceTypeAttachmentOverrides[]
}

export type ListOccurrenceAttachmentOverridesPort = {
  readonly listOccurrenceTypeIds: (input: {
    readonly companyId: string
  }) => Promise<readonly string[]>
  readonly listOverridesForTypes: (input: {
    readonly companyId: string
    readonly occurrenceTypeIds: readonly string[]
  }) => Promise<OccurrenceTypeOverridesByType>
}

export type ListOccurrenceAttachmentOverridesParams = {
  readonly companyId: string
  readonly port: ListOccurrenceAttachmentOverridesPort
}

function groupByType<TRow extends { readonly occurrenceTypeId: string }>(
  rows: readonly TRow[],
): Map<string, Omit<TRow, 'occurrenceTypeId'>[]> {
  const groups = new Map<string, Omit<TRow, 'occurrenceTypeId'>[]>()
  for (const { occurrenceTypeId, ...override } of rows) {
    const group = groups.get(occurrenceTypeId) ?? []
    group.push(override)
    groups.set(occurrenceTypeId, group)
  }
  return groups
}

export async function listOccurrenceAttachmentOverridesByType({
  companyId,
  port,
}: ListOccurrenceAttachmentOverridesParams): Promise<ListOccurrenceAttachmentOverridesResult> {
  const occurrenceTypeIds = await port.listOccurrenceTypeIds({ companyId })
  const { contractorOverrides, recipientOverrides } = await port.listOverridesForTypes({
    companyId,
    occurrenceTypeIds,
  })
  const contractorsByType = groupByType(contractorOverrides)
  const recipientsByType = groupByType(recipientOverrides)

  return {
    overridesByType: occurrenceTypeIds.map((occurrenceTypeId) => ({
      contractorOverrides: (contractorsByType.get(occurrenceTypeId) ?? []).sort((left, right) =>
        left.contractorId.localeCompare(right.contractorId),
      ),
      occurrenceTypeId,
      recipientOverrides: (recipientsByType.get(occurrenceTypeId) ?? []).sort((left, right) =>
        left.taxId.localeCompare(right.taxId),
      ),
    })),
  }
}
