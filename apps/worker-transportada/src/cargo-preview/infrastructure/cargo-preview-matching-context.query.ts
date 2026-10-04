/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: o que o vínculo de um contratante lê antes de rodar a política — o perfil ligado
 * (janela, tolerância, padrão do `NroCarga` e o CNPJ do emitente), as prévias prontas da janela, da
 * mais antiga para a mais nova, e os aliases já firmados. Sempre dentro da transação com a trava.
 */
import { and, asc, eq, gte } from 'drizzle-orm'

import type { RecipientAlias } from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import {
  contractorReceivingProfiles,
  contractorRecipientAliases,
} from '../../database/cargo-preview-trail.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import { CARGO_PREVIEW_STATUS } from '../../shared/cargo-preview.constant.js'
import type { Transaction } from './cargo-preview-match.store.js'
import type { MatchContractorParams } from './cargo-preview-matching.writer.js'

const DAY_MS = 86_400_000

export type MatchingContext = {
  readonly arrivalReferenceLabel: string | null
  readonly matchWindowDays: number
  readonly taxId: string
  readonly weightTolerancePercent: number
}

export async function loadContext(
  tx: Transaction,
  params: MatchContractorParams,
): Promise<MatchingContext | undefined> {
  const [row] = await tx
    .select({
      arrivalReferenceLabel: contractorReceivingProfiles.arrivalReferenceLabel,
      matchWindowDays: contractorReceivingProfiles.matchWindowDays,
      taxId: contractors.taxId,
      weightTolerancePercent: contractorReceivingProfiles.weightTolerancePercent,
    })
    .from(contractors)
    .innerJoin(
      contractorReceivingProfiles,
      and(
        eq(contractorReceivingProfiles.companyId, contractors.companyId),
        eq(contractorReceivingProfiles.contractorId, contractors.id),
        eq(contractorReceivingProfiles.isEnabled, true),
        eq(contractorReceivingProfiles.previewEnabled, true),
      ),
    )
    .where(
      and(eq(contractors.companyId, params.companyId), eq(contractors.id, params.contractorId)),
    )
  return row === undefined
    ? undefined
    : { ...row, weightTolerancePercent: Number(row.weightTolerancePercent) }
}

/** Passada a janela, nota nova não é mais candidata: a prévia velha não é reavaliada à toa. */
export function selectPreviews(
  tx: Transaction,
  input: MatchContractorParams & { readonly windowDays: number },
) {
  return tx
    .select({ id: cargoPreviews.id, receivedAt: cargoPreviews.receivedAt })
    .from(cargoPreviews)
    .where(
      and(
        eq(cargoPreviews.companyId, input.companyId),
        eq(cargoPreviews.contractorId, input.contractorId),
        eq(cargoPreviews.status, CARGO_PREVIEW_STATUS.ready),
        gte(cargoPreviews.receivedAt, new Date(input.now.getTime() - input.windowDays * DAY_MS)),
      ),
    )
    .orderBy(asc(cargoPreviews.receivedAt), asc(cargoPreviews.id))
}

export async function loadAliases(
  tx: Transaction,
  params: MatchContractorParams,
): Promise<RecipientAlias[]> {
  return tx
    .select({
      recipientCode: contractorRecipientAliases.recipientCode,
      recipientTaxId: contractorRecipientAliases.recipientTaxId,
    })
    .from(contractorRecipientAliases)
    .where(
      and(
        eq(contractorRecipientAliases.companyId, params.companyId),
        eq(contractorRecipientAliases.contractorId, params.contractorId),
      ),
    )
}
