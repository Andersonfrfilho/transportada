/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, ne, sum } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatches } from '../../database/cte-batch.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import type {
  CteBatchPreviewDocument,
  CteBatchPreviewLink,
  CteBatchPreviewQuery,
} from '../application/cte-batch-preview.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type SelectionQueryable = Database | Transaction

type PartyLocation = {
  readonly city: string | null
  readonly state: string | null
  readonly taxId: string | null
}

type DocumentParties = {
  readonly recipient: PartyLocation
  readonly sender: PartyLocation
}

const EMPTY_PARTY: PartyLocation = { city: null, state: null, taxId: null }
const EMPTY_PARTIES: DocumentParties = { recipient: EMPTY_PARTY, sender: EMPTY_PARTY }
const SENDER_ROLE = 'emitter'
const RECIPIENT_ROLE = 'recipient'
const CANCELLED_STATUS = 'cancelled'
const COMPLETE_VARIANT = 'complete'

export async function findActiveBatchLinks(
  queryable: SelectionQueryable,
  { companyId, documentIds }: CteBatchPreviewQuery,
): Promise<readonly CteBatchPreviewLink[]> {
  if (documentIds.length === 0) return []

  return queryable
    .selectDistinctOn([cteBatchItemDocuments.nfeDocumentId], {
      batchId: cteBatchItemDocuments.batchId,
      documentId: cteBatchItemDocuments.nfeDocumentId,
    })
    .from(cteBatchItemDocuments)
    .innerJoin(
      cteBatches,
      and(
        eq(cteBatches.companyId, cteBatchItemDocuments.companyId),
        eq(cteBatches.id, cteBatchItemDocuments.batchId),
      ),
    )
    .where(
      and(
        eq(cteBatchItemDocuments.companyId, companyId),
        inArray(cteBatchItemDocuments.nfeDocumentId, [...documentIds]),
        ne(cteBatches.status, CANCELLED_STATUS),
      ),
    )
    .orderBy(cteBatchItemDocuments.nfeDocumentId)
}

export async function findSelectionDocuments(
  queryable: SelectionQueryable,
  { companyId, documentIds }: CteBatchPreviewQuery,
): Promise<readonly CteBatchPreviewDocument[]> {
  if (documentIds.length === 0) return []
  const [records, parties, weights] = await Promise.all([
    queryable
      .select({
        accessKey: nfeDocuments.accessKey,
        companyId: nfeDocuments.companyId,
        id: nfeDocuments.id,
        issuedAt: nfeDocuments.issuedAt,
        number: nfeDocuments.number,
        series: nfeDocuments.series,
        status: nfeDocuments.status,
        totalValue: nfeDocuments.totalValue,
      })
      .from(nfeDocuments)
      .where(
        and(eq(nfeDocuments.companyId, companyId), inArray(nfeDocuments.id, [...documentIds])),
      ),
    loadParties(queryable, companyId, documentIds),
    loadGrossWeights(queryable, companyId, documentIds),
  ])

  return records.map((record) => {
    const { recipient, sender } = parties.get(record.id) ?? EMPTY_PARTIES

    return {
      accessKey: record.accessKey,
      companyId: record.companyId,
      grossWeight: weights.get(record.id) ?? null,
      id: record.id,
      issuedAt: record.issuedAt.toISOString(),
      number: record.number,
      recipientCity: recipient.city,
      recipientState: recipient.state,
      recipientTaxId: recipient.taxId,
      senderCity: sender.city,
      senderState: sender.state,
      senderTaxId: sender.taxId,
      series: record.series,
      status: record.status,
      totalAmount: record.totalValue,
      variant: COMPLETE_VARIANT,
    }
  })
}

async function loadGrossWeights(
  queryable: SelectionQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, string>> {
  const rows = await queryable
    .select({
      documentId: nfeVolumes.documentId,
      grossWeight: sum(nfeVolumes.grossWeight),
    })
    .from(nfeVolumes)
    .where(
      and(eq(nfeVolumes.companyId, companyId), inArray(nfeVolumes.documentId, [...documentIds])),
    )
    .groupBy(nfeVolumes.documentId)

  return new Map(
    rows.flatMap((row) => (row.grossWeight === null ? [] : [[row.documentId, row.grossWeight]])),
  )
}

async function loadParties(
  queryable: SelectionQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, DocumentParties>> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      documentId: nfeParticipants.documentId,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
      taxId: nfeParticipants.taxId,
    })
    .from(nfeParticipants)
    .leftJoin(
      nfeAddresses,
      and(
        eq(nfeAddresses.companyId, nfeParticipants.companyId),
        eq(nfeAddresses.participantId, nfeParticipants.id),
      ),
    )
    .where(
      and(
        eq(nfeParticipants.companyId, companyId),
        inArray(nfeParticipants.documentId, [...documentIds]),
      ),
    )

  const parties = new Map<string, DocumentParties>()
  for (const row of rows) {
    if (row.role !== SENDER_ROLE && row.role !== RECIPIENT_ROLE) continue
    const current = parties.get(row.documentId) ?? EMPTY_PARTIES
    const party: PartyLocation = { city: row.city, state: row.state, taxId: row.taxId }
    parties.set(
      row.documentId,
      row.role === SENDER_ROLE ? { ...current, sender: party } : { ...current, recipient: party },
    )
  }

  return parties
}
