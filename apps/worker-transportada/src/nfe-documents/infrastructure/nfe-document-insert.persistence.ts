/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeXmlDocument } from '@adatechnology/fiscal-provider'
import { sql } from 'drizzle-orm'

import { type NfeImportSource, nfeDocuments } from '../../database/nfe.schema.js'
import { resolveRecipientEmail } from '../../nfe-imports/domain/recipient-email.policy.js'
import { writeDocumentChildren } from '../../nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import type {
  NfeDocumentStatusLogger,
  NfeStatusChangeRecord,
  NfeStatusProvenance,
} from '../types/nfe-document-status.types.js'
import type { NfeWriteTransaction } from '../types/nfe-write-transaction.types.js'
import {
  recordDocumentInsertChange,
  resolveInitialDocumentStatus,
} from './nfe-document-status-write.persistence.js'

export type InsertNfeDocumentParams = {
  readonly companyId: string
  readonly createdByUserId: string
  readonly document: NfeXmlDocument
  readonly importId: string
  readonly logger: NfeDocumentStatusLogger
  readonly provenance: NfeStatusProvenance
  readonly source: NfeImportSource
  readonly tx: NfeWriteTransaction
  readonly xmlObjectId: string
  readonly xmlSha256: string
}

export type InsertNfeDocumentResult = {
  readonly change: NfeStatusChangeRecord | null
  readonly id: string
}

/** `undefined` quando a nota já existia: o conflito não muda nada. */
export async function insertNfeDocument(
  params: InsertNfeDocumentParams,
): Promise<InsertNfeDocumentResult | undefined> {
  const { companyId, document, logger, tx } = params
  const recipientEmail = resolveRecipientEmail(document.recipient?.email)
  if (recipientEmail.wasRejected) {
    logger.warn('nfe_recipient_email_rejected', { companyId, rejectedRecipientEmailCount: 1 })
  }
  const initial = await resolveInitialDocumentStatus({
    accessKey: document.accessKey,
    companyId,
    tx,
    xmlStatus: document.status,
  })
  const [created] = await tx
    .insert(nfeDocuments)
    .values({
      accessKey: document.accessKey,
      additionalInformation: document.additionalInformation ?? null,
      authorizationProtocol: document.protocol?.number ?? null,
      companyId,
      createdByUserId: params.createdByUserId,
      discountValue: document.totals.discount ?? '0',
      freightValue: document.totals.freight ?? '0',
      importId: params.importId,
      insuranceValue: document.totals.insurance ?? '0',
      issuedAt: new Date(document.issuedAt),
      model: document.model,
      number: document.number,
      operationNature: document.operationNature,
      operationType: document.operationType,
      otherExpensesValue: document.totals.otherExpenses ?? '0',
      productsValue: document.totals.products,
      recipientEmail: recipientEmail.email,
      series: document.series,
      source: params.source,
      status: initial.status,
      totalValue: document.totals.invoice,
      xmlObjectId: params.xmlObjectId,
      xmlSha256: params.xmlSha256,
    })
    .onConflictDoNothing({ target: [nfeDocuments.companyId, nfeDocuments.accessKey] })
    .returning({ createdAt: sql<string>`${nfeDocuments.createdAt}::text`, id: nfeDocuments.id })
  if (created === undefined) return undefined

  const change = await recordDocumentInsertChange({
    companyId,
    createdAt: created.createdAt,
    documentId: created.id,
    pendingEventId: initial.pendingEventId,
    provenance: params.provenance,
    status: initial.status,
    tx,
    xmlStatus: document.status,
  })
  await writeDocumentChildren({ companyId, document, documentId: created.id, logger, tx })
  return { change, id: created.id }
}
