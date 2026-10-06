/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: leituras e escritas do vínculo, sempre dentro da transação que já tem a trava do
 * contratante. Só item em aberto **decidido pela máquina** é lido para reavaliar: o que o operador
 * confirmou, desvinculou ou vinculou à mão nunca volta para a política.
 */
import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  cargoPreviewDocumentLinks,
  cargoPreviewItems,
  cargoPreviewRouteLoads,
} from '../../database/cargo-preview.schema.js'
import { cargoPreviewEvents } from '../../database/cargo-preview-trail.schema.js'
import type { CargoPreviewRoutePairing } from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import {
  CARGO_PREVIEW_CHANNEL,
  CARGO_PREVIEW_DECIDED_BY,
  CARGO_PREVIEW_ITEM_STATE,
  type CargoPreviewRouteLoadOrigin,
} from '../../shared/cargo-preview.constant.js'
import type { PreviewItemChange } from '../domain/cargo-preview-match-diff.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
export type PreviewScope = { readonly companyId: string; readonly previewId: string }

const OPEN_STATES = [
  CARGO_PREVIEW_ITEM_STATE.awaitingXml,
  CARGO_PREVIEW_ITEM_STATE.suggested,
  CARGO_PREVIEW_ITEM_STATE.ambiguous,
]

export async function lockContractorMatching(tx: Transaction, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`)
}

export function selectOpenItems(tx: Transaction, scope: PreviewScope) {
  return tx
    .select({
      city: cargoPreviewItems.city,
      id: cargoPreviewItems.id,
      matchEvidence: cargoPreviewItems.matchEvidence,
      matchState: cargoPreviewItems.matchState,
      postalCode: cargoPreviewItems.postalCode,
      recipientCode: cargoPreviewItems.recipientCode,
      recipientName: cargoPreviewItems.recipientName,
      routeName: cargoPreviewItems.routeName,
      value: cargoPreviewItems.value,
      weightKg: cargoPreviewItems.weightKg,
    })
    .from(cargoPreviewItems)
    .where(
      and(
        eq(cargoPreviewItems.companyId, scope.companyId),
        eq(cargoPreviewItems.previewId, scope.previewId),
        inArray(cargoPreviewItems.matchState, OPEN_STATES),
        or(
          isNull(cargoPreviewItems.matchedBy),
          eq(cargoPreviewItems.matchedBy, CARGO_PREVIEW_DECIDED_BY.system),
        ),
      ),
    )
    .orderBy(cargoPreviewItems.rowNumber)
}

export async function selectRoutePairs(tx: Transaction, scope: PreviewScope) {
  return tx
    .select({
      loadReference: cargoPreviewRouteLoads.loadReference,
      routeName: cargoPreviewRouteLoads.routeName,
    })
    .from(cargoPreviewRouteLoads)
    .where(
      and(
        eq(cargoPreviewRouteLoads.companyId, scope.companyId),
        eq(cargoPreviewRouteLoads.previewId, scope.previewId),
      ),
    )
}

const LOAD_REFERENCE_MAX_LENGTH = 200

/** Par já firmado não é regravado; carga com texto longo demais para a coluna não pareia. */
export async function insertRoutePairs(
  tx: Transaction,
  input: PreviewScope & { readonly pairs: readonly CargoPreviewRoutePairing[] },
): Promise<void> {
  const rows = input.pairs.flatMap((pair) =>
    pair.source === 'known' || pair.loadReference.length > LOAD_REFERENCE_MAX_LENGTH
      ? []
      : [
          {
            companyId: input.companyId,
            loadReference: pair.loadReference,
            origin: pair.source satisfies CargoPreviewRouteLoadOrigin,
            previewId: input.previewId,
            routeName: pair.routeName,
          },
        ],
  )
  if (rows.length > 0) await tx.insert(cargoPreviewRouteLoads).values(rows).onConflictDoNothing()
}

/** O vínculo novo é `insert` puro: a nota já ligada a outra prévia viola o unique e desfaz tudo. */
export async function writeItemChanges(
  tx: Transaction,
  input: PreviewScope & { readonly changes: readonly PreviewItemChange[]; readonly now: Date },
): Promise<void> {
  const linked = new Set(
    input.changes.flatMap((change) =>
      change.state === CARGO_PREVIEW_ITEM_STATE.matched && change.groupDocumentId !== null
        ? [change.groupDocumentId]
        : [],
    ),
  )
  if (linked.size > 0) {
    await tx.insert(cargoPreviewDocumentLinks).values(
      [...linked].map((documentId) => ({
        ...input,
        documentId,
        linkedBy: CARGO_PREVIEW_DECIDED_BY.system,
      })),
    )
  }
  await Promise.all(input.changes.map((change) => updateItem(tx, { ...input, change })))
  const events = input.changes.flatMap((change) =>
    change.eventKind === null
      ? []
      : [
          {
            channel: CARGO_PREVIEW_CHANNEL.worker,
            companyId: input.companyId,
            details: { documentIds: change.candidateDocumentIds, evidence: change.evidence },
            itemId: change.itemId,
            kind: change.eventKind,
            occurredAt: input.now,
            previewId: input.previewId,
          },
        ],
  )
  if (events.length > 0) await tx.insert(cargoPreviewEvents).values(events)
}

async function updateItem(
  tx: Transaction,
  input: PreviewScope & { readonly change: PreviewItemChange; readonly now: Date },
): Promise<void> {
  const { change } = input
  const isWaiting = change.state === CARGO_PREVIEW_ITEM_STATE.awaitingXml
  const isMatched = change.state === CARGO_PREVIEW_ITEM_STATE.matched
  await tx
    .update(cargoPreviewItems)
    .set({
      matchEvidence: isWaiting
        ? null
        : { candidateDocumentIds: change.candidateDocumentIds, evidence: change.evidence },
      matchGroupKey: change.groupDocumentId,
      matchState: change.state,
      matchedAt: isWaiting ? null : input.now,
      matchedBy: isWaiting ? null : CARGO_PREVIEW_DECIDED_BY.system,
      matchedDocumentId: isMatched ? change.groupDocumentId : null,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(cargoPreviewItems.companyId, input.companyId),
        eq(cargoPreviewItems.id, change.itemId),
      ),
    )
}
