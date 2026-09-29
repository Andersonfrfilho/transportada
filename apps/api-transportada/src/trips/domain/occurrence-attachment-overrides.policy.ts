/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B2: o `attachmentMode` de um tipo de ocorrência ganha a mesma exceção de três
 * camadas do comprovante (RF-C3) — destinatário vence contratante vence a configuração do tipo
 * vence `'off'`. Mesma função de precedência de RF-D1, nenhuma reimplementação.
 */
import { resolveWithOverrides } from '../../shared/resolve-with-overrides.policy.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'

export type ResolveOccurrenceAttachmentModeParams = {
  readonly contractorOverride: DeliveryProofFieldMode | null
  readonly general: DeliveryProofFieldMode
  readonly recipientOverride: DeliveryProofFieldMode | null
}

/** A exceção mais específica vence a geral **por inteiro** — mesmo raciocínio de RF-C3. */
export function resolveOccurrenceAttachmentMode(
  params: ResolveOccurrenceAttachmentModeParams,
): DeliveryProofFieldMode {
  return resolveWithOverrides({
    contractorOverride: params.contractorOverride,
    fallback: 'off',
    general: params.general,
    recipientOverride: params.recipientOverride,
  })
}

export type OccurrenceAttachmentOverridesLookup = {
  readonly overridesByContractorId: ReadonlyMap<string, DeliveryProofFieldMode>
  readonly overridesByTaxId: ReadonlyMap<string, DeliveryProofFieldMode>
}

export type ResolveOccurrenceAttachmentModeForRecipientParams = {
  readonly attachmentMode: DeliveryProofFieldMode
  /** Ausente é "sem contratante resolvido" — cai na geral, mesmo tratamento de RF-C3. */
  readonly contractorId?: string | null
  readonly lookup: OccurrenceAttachmentOverridesLookup
  readonly recipientTaxId?: string | null
}

/**
 * O ponto único que os call sites (RF-B3/T9) chamam: dado o `attachmentMode` geral do tipo e as
 * duas tabelas de exceção já lidas (por `occurrenceTypeId`), resolve o valor efetivo para uma nota
 * de um contratante/destinatário específicos.
 */
export function resolveOccurrenceAttachmentModeForRecipient(
  params: ResolveOccurrenceAttachmentModeForRecipientParams,
): DeliveryProofFieldMode {
  const contractorId = params.contractorId ?? null
  const recipientTaxId = params.recipientTaxId ?? null

  const contractorOverride =
    contractorId === null ? null : (params.lookup.overridesByContractorId.get(contractorId) ?? null)
  const recipientOverride =
    recipientTaxId === null || recipientTaxId.length === 0
      ? null
      : (params.lookup.overridesByTaxId.get(recipientTaxId) ?? null)

  return resolveOccurrenceAttachmentMode({
    contractorOverride,
    general: params.attachmentMode,
    recipientOverride,
  })
}
