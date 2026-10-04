/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5b: a prévia propõe a chegada — contratante, dia planejado e as notas `matched` que
 * podem entrar numa chegada hoje, julgadas pela mesma política do registro (Fase 2). Nada é criado;
 * só o evento `arrival_proposed` fica na trilha — uma vez por conjunto de notas (revisão da Fase 4a,
 * L6): repetir a proposta sem mudança não polui a trilha append-only.
 */
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm'

import { cargoPreviewEvents } from '../../database/cargo-preview-event.schema.js'

import { cargoPreviewItems } from '../../database/cargo-preview-item.schema.js'
import { cargoPreviews } from '../../database/cargo-preview.schema.js'
import { contractors } from '../../database/delivery-client.schema.js'
import {
  CARGO_PREVIEW_EVENT_KIND,
  CARGO_PREVIEW_ITEM_STATE,
  CARGO_PREVIEW_STATUS,
} from '../../shared/cargo-preview.constant.js'
import type { CargoPreviewArrivalProposal } from '../application/cargo-preview.types.js'
import { findArrivalCandidateRefusals } from '../domain/cargo-arrival-candidate.policy.js'
import { sha256Hex } from '../domain/cargo-preview-upload.policy.js'
import type { Transaction } from './cargo-arrival-persistence.support.js'
import { selectArrivalCandidateRows } from './cargo-arrival-document.query.js'
import { buildPreviewFilters, insertOperatorEvents } from './cargo-preview-persistence.support.js'

type ProposalParams = {
  readonly actorUserId: string
  readonly companyId: string
  readonly now: Date
  readonly previewId: string
}

async function findMatchedDocumentIds(
  transaction: Transaction,
  params: ProposalParams,
): Promise<string[]> {
  const rows = await transaction
    .selectDistinct({ documentId: cargoPreviewItems.matchedDocumentId })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, params.companyId),
        eq(cargoPreviewItems.previewId, params.previewId),
        eq(cargoPreviewItems.matchState, CARGO_PREVIEW_ITEM_STATE.matched),
        isNotNull(cargoPreviewItems.matchedDocumentId),
      ),
    )
    .orderBy(asc(cargoPreviewItems.matchedDocumentId))
  return rows.flatMap((row) => (row.documentId === null ? [] : [row.documentId]))
}

/** Já há evento desta prévia para o mesmo conjunto (as notas propostas e as recusadas)? */
async function wasProposed(
  transaction: Transaction,
  params: ProposalParams & { readonly fingerprint: string },
): Promise<boolean> {
  const [event] = await transaction
    .select({ id: cargoPreviewEvents.id })
    .from(cargoPreviewEvents)
    .where(
      and(
        eq(cargoPreviewEvents.companyId, params.companyId),
        eq(cargoPreviewEvents.previewId, params.previewId),
        eq(cargoPreviewEvents.kind, CARGO_PREVIEW_EVENT_KIND.arrivalProposed),
        eq(sql`${cargoPreviewEvents.details} ->> 'proposalFingerprint'`, params.fingerprint),
      ),
    )
    .limit(1)
  return event !== undefined
}

function findProposalPreview(transaction: Transaction, params: ProposalParams) {
  return transaction
    .select({
      contractorId: cargoPreviews.contractorId,
      contractorTaxId: contractors.taxId,
      plannedDate: cargoPreviews.plannedDate,
      status: cargoPreviews.status,
    })
    .from(cargoPreviews)
    .innerJoin(
      contractors,
      and(
        eq(contractors.companyId, cargoPreviews.companyId),
        eq(contractors.id, cargoPreviews.contractorId),
      ),
    )
    .where(and(...buildPreviewFilters(params)))
    .for('update', { of: cargoPreviews })
}

async function recordProposal(
  transaction: Transaction,
  params: ProposalParams & {
    readonly proposedIds: readonly string[]
    readonly refusedIds: readonly string[]
  },
): Promise<void> {
  const fingerprint = sha256Hex(JSON.stringify([params.proposedIds, params.refusedIds]))
  if (await wasProposed(transaction, { ...params, fingerprint })) return
  await insertOperatorEvents(transaction, [
    {
      actorUserId: params.actorUserId,
      companyId: params.companyId,
      details: {
        documentCount: params.proposedIds.length,
        proposalFingerprint: fingerprint,
        refusedCount: params.refusedIds.length,
      },
      kind: CARGO_PREVIEW_EVENT_KIND.arrivalProposed,
      occurredAt: params.now,
      previewId: params.previewId,
    },
  ])
}

export async function proposeArrivalFromPreview(
  transaction: Transaction,
  params: ProposalParams,
): Promise<CargoPreviewArrivalProposal | 'not_found' | 'not_ready'> {
  const [preview] = await findProposalPreview(transaction, params)
  if (preview === undefined) return 'not_found'
  if (preview.status !== CARGO_PREVIEW_STATUS.ready) return 'not_ready'
  const documentIds = await findMatchedDocumentIds(transaction, params)
  const rows =
    documentIds.length === 0
      ? []
      : await selectArrivalCandidateRows(transaction, { companyId: params.companyId, documentIds })
  const refusals = findArrivalCandidateRefusals({
    contractorTaxId: preview.contractorTaxId,
    documentIds,
    rows,
  })
  const refused = new Set(refusals.map((refusal) => refusal.documentId))
  const proposedIds = documentIds.filter((documentId) => !refused.has(documentId))
  await recordProposal(transaction, { ...params, proposedIds, refusedIds: [...refused].sort() })
  return {
    contractorId: preview.contractorId,
    documentIds: proposedIds,
    plannedDate: preview.plannedDate,
    previewId: params.previewId,
    refused: refusals.map((refusal) => ({
      documentId: refusal.documentId,
      reason: refusal.reason,
    })),
  }
}
