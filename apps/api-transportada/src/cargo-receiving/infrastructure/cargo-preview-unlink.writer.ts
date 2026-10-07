/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (correção da revisão da Fase 4a, M2 e L5): o que desvincular desfaz além do item. O
 * alias `Company → CNPJ` que esta prévia aprendeu daquele vínculo sai — o operador acabou de dizer
 * que a nota não era daquele cliente —, salvo se outro item da prévia, do mesmo código, segue ligado
 * a uma nota do mesmo destinatário. E o contratante é reavaliado: a nota solta pode ser de outra prévia.
 */
import { and, eq, inArray, notExists, sql } from 'drizzle-orm'

import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import { cargoPreviewOutbox } from '../../database/cargo-preview-outbox.schema.js'
import { contractorRecipientAliases } from '../../database/contractor-recipient-alias.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import {
  CARGO_PREVIEW_ITEM_STATE,
  CARGO_PREVIEW_OUTBOX_EVENT,
} from '../../shared/cargo-preview.constant.js'
import { RECIPIENT_ROLE } from './cargo-arrival-document.query.js'
import type { Transaction } from './cargo-arrival-persistence.support.js'

export type UnlinkSideEffectsInput = {
  readonly companyId: string
  readonly contractorId: string
  readonly correlationId: string
  readonly documentId: string
  readonly itemIds: readonly string[]
  readonly previewId: string
}

function stillSupported(transaction: Transaction, input: UnlinkSideEffectsInput) {
  return transaction
    .select({ one: sql`1` })
    .from(cargoPreviewItems)
    .innerJoin(
      nfeParticipants,
      and(
        eq(nfeParticipants.companyId, cargoPreviewItems.companyId),
        eq(nfeParticipants.documentId, cargoPreviewItems.matchedDocumentId),
        eq(nfeParticipants.role, RECIPIENT_ROLE),
      ),
    )
    .where(
      and(
        eq(cargoPreviewItems.companyId, input.companyId),
        eq(cargoPreviewItems.previewId, input.previewId),
        eq(cargoPreviewItems.matchState, CARGO_PREVIEW_ITEM_STATE.matched),
        eq(cargoPreviewItems.recipientCode, contractorRecipientAliases.recipientCode),
        eq(nfeParticipants.taxId, contractorRecipientAliases.recipientTaxId),
      ),
    )
}

/** Roda depois de os itens voltarem a esperar o XML: o que ainda os sustenta é o que sobrou. */
async function revokeLearnedAliases(
  transaction: Transaction,
  input: UnlinkSideEffectsInput,
): Promise<void> {
  const codes = transaction
    .select({ code: cargoPreviewItems.recipientCode })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, input.companyId),
        inArray(cargoPreviewItems.id, [...input.itemIds]),
      ),
    )
  const releasedRecipient = transaction
    .select({ taxId: nfeParticipants.taxId })
    .from(nfeParticipants)
    .where(
      and(
        eq(nfeParticipants.companyId, input.companyId),
        eq(nfeParticipants.documentId, input.documentId),
        eq(nfeParticipants.role, RECIPIENT_ROLE),
      ),
    )
  await transaction
    .delete(contractorRecipientAliases)
    .where(
      and(
        eq(contractorRecipientAliases.companyId, input.companyId),
        eq(contractorRecipientAliases.contractorId, input.contractorId),
        eq(contractorRecipientAliases.learnedFromPreviewId, input.previewId),
        inArray(contractorRecipientAliases.recipientCode, codes),
        inArray(contractorRecipientAliases.recipientTaxId, releasedRecipient),
        notExists(stillSupported(transaction, input)),
      ),
    )
}

export async function applyUnlinkSideEffects(
  transaction: Transaction,
  input: UnlinkSideEffectsInput,
): Promise<void> {
  await revokeLearnedAliases(transaction, input)
  await transaction.insert(cargoPreviewOutbox).values({
    companyId: input.companyId,
    contractorId: input.contractorId,
    correlationId: input.correlationId,
    eventType: CARGO_PREVIEW_OUTBOX_EVENT.reevaluate,
    payload: { contractorId: input.contractorId },
  })
}
