/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, inArray } from 'drizzle-orm'

import {
  cteBatchItemCharges,
  cteBatchItemDocuments,
  cteBatchItems,
  cteBatches,
} from '../../database/cte-batch.schema.js'
import { cteFiscalDocuments, cteIssuanceAttempts } from '../../database/cte-issuance.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  CTE_BATCH_ITEM_PENDING_STATUS,
  type CteBatchItem,
  type CteBatchItemCharge,
  type CteBatchItemDocument,
  type CteBatchItemQuery,
  type CteBatchItemReaderPort,
} from '../application/cte-batch-item.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type AttemptState = {
  readonly fiscalNumber: string
  readonly fiscalSeries: string
  readonly lastErrorCode: string | null
  readonly status: string
}

export class DrizzleCteBatchItemRepository implements CteBatchItemReaderPort {
  public constructor(private readonly database: Database) {}

  public async findBatch(query: CteBatchItemQuery): Promise<{ readonly id: string } | null> {
    const [record] = await this.database
      .select({ id: cteBatches.id })
      .from(cteBatches)
      .where(and(eq(cteBatches.companyId, query.companyId), eq(cteBatches.id, query.batchId)))
      .limit(1)

    return record ?? null
  }

  public async listItems(query: CteBatchItemQuery): Promise<readonly CteBatchItem[]> {
    const records = await this.database
      .select({
        accessKey: cteFiscalDocuments.accessKey,
        authorizationProtocol: cteFiscalDocuments.authorizationProtocol,
        authorizedAt: cteFiscalDocuments.authorizedAt,
        calculationSnapshot: cteBatchItems.calculationSnapshot,
        fiscalDocumentId: cteFiscalDocuments.id,
        id: cteBatchItems.id,
        position: cteBatchItems.position,
      })
      .from(cteBatchItems)
      .leftJoin(
        cteFiscalDocuments,
        and(
          eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
          eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
        ),
      )
      .where(
        and(eq(cteBatchItems.companyId, query.companyId), eq(cteBatchItems.batchId, query.batchId)),
      )
      .orderBy(cteBatchItems.position)
    if (records.length === 0) return []

    const itemIds = records.map((record) => record.id)
    const [attempts, charges, documents] = await Promise.all([
      loadLatestAttempts(this.database, query.companyId, itemIds),
      loadCharges(this.database, query.companyId, itemIds),
      loadDocuments(this.database, query),
    ])

    return records.map((record) => {
      const attempt = attempts.get(record.id)
      const snapshot = record.calculationSnapshot

      return {
        accessKey: record.accessKey,
        authorizationProtocol: record.authorizationProtocol,
        authorizedAt: record.authorizedAt?.toISOString() ?? null,
        baseAmount: requiredSnapshotAmount(snapshot, 'baseAmount'),
        charges: charges.get(record.id) ?? [],
        documents: documents.get(record.id) ?? [],
        fiscalAmount: requiredSnapshotAmount(snapshot, 'fiscalAmount'),
        fiscalDocumentId: record.fiscalDocumentId,
        fiscalNumber: attempt?.fiscalNumber ?? null,
        fiscalSeries: attempt?.fiscalSeries ?? null,
        id: record.id,
        lastErrorCode: attempt?.lastErrorCode ?? null,
        position: record.position.toString(),
        status: attempt?.status ?? CTE_BATCH_ITEM_PENDING_STATUS,
        totalAmount: requiredSnapshotAmount(snapshot, 'calculatedAmount'),
      }
    })
  }
}

/** A última tentativa é o estado corrente do CT-e — as anteriores são histórico. */
async function loadLatestAttempts(
  database: Database,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, AttemptState>> {
  const rows = await database
    .selectDistinctOn([cteIssuanceAttempts.batchItemId], {
      batchItemId: cteIssuanceAttempts.batchItemId,
      fiscalNumber: cteIssuanceAttempts.fiscalNumber,
      fiscalSeries: cteIssuanceAttempts.fiscalSeries,
      lastErrorCode: cteIssuanceAttempts.lastErrorCode,
      status: cteIssuanceAttempts.status,
    })
    .from(cteIssuanceAttempts)
    .where(
      and(
        eq(cteIssuanceAttempts.companyId, companyId),
        inArray(cteIssuanceAttempts.batchItemId, [...itemIds]),
      ),
    )
    .orderBy(cteIssuanceAttempts.batchItemId, desc(cteIssuanceAttempts.attemptNumber))

  return new Map(
    rows.map((row) => [
      row.batchItemId,
      {
        fiscalNumber: row.fiscalNumber.toString(),
        fiscalSeries: row.fiscalSeries,
        lastErrorCode: row.lastErrorCode,
        status: row.status,
      },
    ]),
  )
}

async function loadCharges(
  database: Database,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, CteBatchItemCharge[]>> {
  const rows = await database
    .select({
      amount: cteBatchItemCharges.amount,
      baseAmount: cteBatchItemCharges.baseAmount,
      calculationType: cteBatchItemCharges.calculationType,
      itemId: cteBatchItemCharges.itemId,
      label: cteBatchItemCharges.label,
      ordinal: cteBatchItemCharges.ordinal,
      rate: cteBatchItemCharges.rate,
    })
    .from(cteBatchItemCharges)
    .where(
      and(
        eq(cteBatchItemCharges.companyId, companyId),
        inArray(cteBatchItemCharges.itemId, [...itemIds]),
      ),
    )
    .orderBy(cteBatchItemCharges.itemId, cteBatchItemCharges.ordinal)

  const charges = new Map<string, CteBatchItemCharge[]>()
  for (const row of rows) {
    const current = charges.get(row.itemId) ?? []
    current.push({
      amount: row.amount,
      baseAmount: row.baseAmount,
      calculationType: row.calculationType,
      label: row.label,
      ordinal: row.ordinal.toString(),
      rate: row.rate,
    })
    charges.set(row.itemId, current)
  }

  return charges
}

async function loadDocuments(
  database: Database,
  query: CteBatchItemQuery,
): Promise<Map<string, CteBatchItemDocument[]>> {
  const rows = await database
    .select({
      accessKey: nfeDocuments.accessKey,
      id: nfeDocuments.id,
      itemId: cteBatchItemDocuments.itemId,
      number: nfeDocuments.number,
      position: cteBatchItemDocuments.position,
      series: nfeDocuments.series,
      totalAmount: nfeDocuments.totalValue,
    })
    .from(cteBatchItemDocuments)
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, cteBatchItemDocuments.companyId),
        eq(nfeDocuments.id, cteBatchItemDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(cteBatchItemDocuments.companyId, query.companyId),
        eq(cteBatchItemDocuments.batchId, query.batchId),
      ),
    )
    .orderBy(cteBatchItemDocuments.itemId, cteBatchItemDocuments.position)

  const documents = new Map<string, CteBatchItemDocument[]>()
  for (const row of rows) {
    const current = documents.get(row.itemId) ?? []
    current.push({
      accessKey: row.accessKey,
      id: row.id,
      number: row.number,
      position: row.position.toString(),
      series: row.series,
      totalAmount: row.totalAmount,
    })
    documents.set(row.itemId, current)
  }

  return documents
}

function requiredSnapshotAmount(snapshot: unknown, key: string): string {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('CTE_BATCH_ITEM_SNAPSHOT_INVALID')
  }
  const value = (snapshot as Record<string, unknown>)[key]
  if (typeof value !== 'string') throw new Error('CTE_BATCH_ITEM_SNAPSHOT_INVALID')

  return value
}
