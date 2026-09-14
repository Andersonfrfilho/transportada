/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 144 T014 — o estado de cada documento do pedido, lido pelo banco na hora de liquidar. Toda
 * consulta leva o `companyId` do pedido no `where`: o id do lote e o da NFS-e vêm do diário daquela
 * empresa, e o filtro repete a empresa para nenhum id alcançar a linha de outra.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, inArray, isNull, type SQL } from 'drizzle-orm'

import {
  billingInvoiceItems,
  billingInvoices,
  cteBatchItems,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  nfeDocuments,
  nfseServiceInvoices,
} from '../../database/database.schema.js'
import type {
  SettlementCteDocument,
  SettlementNfseInvoice,
  WhatsAppCommandSettlementReaderPort,
} from '../application/whatsapp-command-settlement.port.js'

type SettlementDatabase = ReturnType<typeof createDrizzleProvider>['db']

/** O cancelamento de um CT-e autorizado é tentativa também, e não diz nada sobre a emissão. */
const ISSUING_ATTEMPT_KINDS = ['issue', 'reprocess'] as const
const NO_ATTEMPT_STATUS = 'pending'

export function buildSettlementBatchItemFilters(input: {
  readonly batchIds: readonly string[]
  readonly companyId: string
}): readonly SQL[] {
  return [
    eq(cteBatchItems.companyId, input.companyId),
    inArray(cteBatchItems.batchId, [...input.batchIds]),
  ]
}

export function buildSettlementAttemptFilters(input: {
  readonly batchItemIds: readonly string[]
  readonly companyId: string
}): readonly SQL[] {
  return [
    eq(cteIssuanceAttempts.companyId, input.companyId),
    inArray(cteIssuanceAttempts.batchItemId, [...input.batchItemIds]),
    inArray(cteIssuanceAttempts.attemptKind, [...ISSUING_ATTEMPT_KINDS]),
  ]
}

export function buildSettlementFiscalDocumentFilters(input: {
  readonly batchItemIds: readonly string[]
  readonly companyId: string
}): readonly SQL[] {
  return [
    eq(cteFiscalDocuments.companyId, input.companyId),
    inArray(cteFiscalDocuments.batchItemId, [...input.batchItemIds]),
  ]
}

/** Só a linha ativa: a da fatura cancelada devolveu o CT-e (`buildActiveInvoiceItemJoin`). */
export function buildSettlementInvoiceItemFilters(input: {
  readonly companyId: string
  readonly cteDocumentIds: readonly string[]
}): readonly SQL[] {
  return [
    eq(billingInvoiceItems.companyId, input.companyId),
    inArray(billingInvoiceItems.cteDocumentId, [...input.cteDocumentIds]),
    isNull(billingInvoiceItems.cancelledAt),
  ]
}

export function buildSettlementNfseFilters(input: {
  readonly companyId: string
  readonly invoiceIds: readonly string[]
}): readonly SQL[] {
  return [
    eq(nfseServiceInvoices.companyId, input.companyId),
    inArray(nfseServiceInvoices.id, [...input.invoiceIds]),
  ]
}

type AttemptRow = Readonly<{
  batchItemId: string
  lastErrorCause: string | null
  lastErrorCode: string | null
  status: string
}>

export class DrizzleWhatsAppCommandSettlementRepository
  implements WhatsAppCommandSettlementReaderPort
{
  public constructor(private readonly database: SettlementDatabase) {}

  public async readCteDocuments(input: {
    readonly batchIds: readonly string[]
    readonly companyId: string
  }): Promise<readonly SettlementCteDocument[]> {
    if (input.batchIds.length === 0) return []
    const items = await this.database
      .select({
        id: cteBatchItems.id,
        nfeDocumentId: cteBatchItems.nfeDocumentId,
        nfeNumber: nfeDocuments.number,
      })
      .from(cteBatchItems)
      .leftJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, cteBatchItems.companyId),
          eq(nfeDocuments.id, cteBatchItems.nfeDocumentId),
        ),
      )
      .where(and(...buildSettlementBatchItemFilters(input)))
      .orderBy(asc(cteBatchItems.batchId), asc(cteBatchItems.position))
    if (items.length === 0) return []

    const batchItemIds = items.map((item) => item.id)
    const [attempts, fiscalDocuments] = await Promise.all([
      this.readLatestAttempts({ batchItemIds, companyId: input.companyId }),
      this.database
        .select({
          batchItemId: cteFiscalDocuments.batchItemId,
          id: cteFiscalDocuments.id,
          status: cteFiscalDocuments.status,
        })
        .from(cteFiscalDocuments)
        .where(and(...buildSettlementFiscalDocumentFilters({ ...input, batchItemIds }))),
    ])
    const invoiceKeys = await this.readActiveInvoiceKeys({
      companyId: input.companyId,
      cteDocumentIds: fiscalDocuments.map((document) => document.id),
    })
    const fiscalByItem = new Map(
      fiscalDocuments.map((document) => [document.batchItemId, document]),
    )

    return items.map((item) => {
      const fiscal = fiscalByItem.get(item.id)
      const attempt = attempts.get(item.id)
      return {
        cteDocumentId: fiscal?.id,
        errorCause: attempt?.lastErrorCause ?? undefined,
        errorCode: attempt?.lastErrorCode ?? undefined,
        invoiceIdempotencyKey: fiscal === undefined ? undefined : invoiceKeys.get(fiscal.id),
        nfeDocumentId: item.nfeDocumentId,
        nfeNumber: item.nfeNumber ?? '',
        status: fiscal?.status ?? attempt?.status ?? NO_ATTEMPT_STATUS,
      }
    })
  }

  public async readNfseInvoices(input: {
    readonly companyId: string
    readonly invoiceIds: readonly string[]
  }): Promise<readonly SettlementNfseInvoice[]> {
    if (input.invoiceIds.length === 0) return []
    const rows = await this.database
      .select({
        id: nfseServiceInvoices.id,
        rejectionCode: nfseServiceInvoices.rejectionCode,
        rejectionMessage: nfseServiceInvoices.rejectionMessage,
        status: nfseServiceInvoices.status,
        takerTaxId: nfseServiceInvoices.takerTaxId,
      })
      .from(nfseServiceInvoices)
      .where(and(...buildSettlementNfseFilters(input)))
      .orderBy(asc(nfseServiceInvoices.id))
    return rows.map((row) => ({
      id: row.id,
      rejectionCode: row.rejectionCode ?? undefined,
      rejectionMessage: row.rejectionMessage ?? undefined,
      status: row.status,
      takerTaxId: row.takerTaxId,
    }))
  }

  /** A última tentativa de emissão de cada nota: `attempt_number` cresce a cada reprocesso. */
  private async readLatestAttempts(input: {
    readonly batchItemIds: readonly string[]
    readonly companyId: string
  }): Promise<ReadonlyMap<string, AttemptRow>> {
    const rows = await this.database
      .select({
        batchItemId: cteIssuanceAttempts.batchItemId,
        lastErrorCause: cteIssuanceAttempts.lastErrorCause,
        lastErrorCode: cteIssuanceAttempts.lastErrorCode,
        status: cteIssuanceAttempts.status,
      })
      .from(cteIssuanceAttempts)
      .where(and(...buildSettlementAttemptFilters(input)))
      .orderBy(asc(cteIssuanceAttempts.batchItemId), desc(cteIssuanceAttempts.attemptNumber))
    const latest = new Map<string, AttemptRow>()
    for (const row of rows) if (!latest.has(row.batchItemId)) latest.set(row.batchItemId, row)
    return latest
  }

  private async readActiveInvoiceKeys(input: {
    readonly companyId: string
    readonly cteDocumentIds: readonly string[]
  }): Promise<ReadonlyMap<string, string>> {
    if (input.cteDocumentIds.length === 0) return new Map()
    const rows = await this.database
      .select({
        cteDocumentId: billingInvoiceItems.cteDocumentId,
        idempotencyKey: billingInvoices.idempotencyKey,
      })
      .from(billingInvoiceItems)
      .innerJoin(
        billingInvoices,
        and(
          eq(billingInvoices.companyId, billingInvoiceItems.companyId),
          eq(billingInvoices.id, billingInvoiceItems.invoiceId),
        ),
      )
      .where(and(...buildSettlementInvoiceItemFilters(input)))
    return new Map(rows.map((row) => [row.cteDocumentId, row.idempotencyKey]))
  }
}
