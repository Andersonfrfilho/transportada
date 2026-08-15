/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  cteBatchEvents,
  cteBatches,
  cteBatchItems,
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuanceEvents,
} from '../../database/cte-issuance-execution.schema.js'
import { storedObjects } from '../../database/nfe.schema.js'
import type {
  CteIssuanceFiscalDocument,
  CteIssuanceWriteBack,
  CteIssuanceWriteBackKey,
  CteStoredXmlObject,
} from '../application/cte-issuance-consumer.effect.js'
import type {
  CteBatchProgressStatus,
  CteIssuanceItemStatus,
} from '../domain/cte-batch-progress.policy.js'
import {
  CTE_ISSUANCE_ITEM_STATUSES,
  isSettledCteIssuanceStatus,
  resolveCteBatchStatus,
} from '../domain/cte-batch-progress.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const CANCEL_OPERATION = 'cancel'
const DEFAULT_STORAGE_PROVIDER = 'minio'
const MISSING_AUTHORIZED_XML_REASON = 'authorized_xml_missing'
const MISSING_CANCELLATION_XML_REASON = 'cancellation_xml_missing'
const XML_MIME_TYPE = 'application/xml'

const NON_SETTLED_STATUSES: readonly CteIssuanceItemStatus[] = CTE_ISSUANCE_ITEM_STATUSES.filter(
  (status) => !isSettledCteIssuanceStatus(status),
)

type CteIssuanceSettlementInput = {
  readonly attemptId: string
  readonly batchItemId: string
  readonly cause: string
  readonly companyId: string
  readonly occurredAt: Date
}

type AttemptTransition = {
  readonly key: CteIssuanceWriteBackKey
  readonly eventPayload: Record<string, unknown>
  readonly lastErrorCause?: string
  readonly lastErrorCode?: string
  readonly settle?: (transaction: Transaction) => Promise<void>
  readonly status: CteIssuanceItemStatus
}

/**
 * Efeito de domínio observado **depois** do commit: notificar de dentro da transação é avisar de
 * algo que o banco ainda pode desfazer.
 */
export type CteBatchSettlementListener = (input: {
  readonly batchId: string
  readonly companyId: string
  readonly status: CteBatchProgressStatus
}) => Promise<void>

export class DrizzleCteIssuanceWriteBackRepository implements CteIssuanceWriteBack {
  readonly #database: Database
  readonly #onBatchSettled: CteBatchSettlementListener | undefined
  readonly #storageProvider: string

  constructor(
    database: Database,
    storageProvider: string = DEFAULT_STORAGE_PROVIDER,
    onBatchSettled?: CteBatchSettlementListener,
  ) {
    this.#database = database
    this.#onBatchSettled = onBatchSettled
    this.#storageProvider = storageProvider
  }

  async #announceBatchSettlement(
    companyId: string,
    settled: { readonly batchId: string; readonly status: CteBatchProgressStatus } | undefined,
  ): Promise<void> {
    if (settled === undefined || this.#onBatchSettled === undefined) {
      return
    }

    await this.#onBatchSettled({ batchId: settled.batchId, companyId, status: settled.status })
  }

  async recordInFlight(key: CteIssuanceWriteBackKey): Promise<void> {
    await this.#apply({ key, eventPayload: {}, status: 'in_flight' })
  }

  async recordAuthorized(
    input: CteIssuanceWriteBackKey & {
      readonly accessKey?: string
      readonly fiscalDocument?: CteIssuanceFiscalDocument
      readonly protocol?: string
    },
  ): Promise<void> {
    const { accessKey, fiscalDocument, protocol, ...key } = input
    await this.#apply({
      key,
      eventPayload: {
        ...(accessKey === undefined ? {} : { accessKey }),
        ...(protocol === undefined ? {} : { protocol }),
      },
      settle: async (transaction) => {
        if (fiscalDocument === undefined) {
          await insertIssuanceEvent(transaction, {
            key,
            eventName: 'reconciliation_required',
            payload: { reason: MISSING_AUTHORIZED_XML_REASON },
          })
          return
        }

        await persistFiscalDocument(transaction, {
          document: fiscalDocument,
          key,
          storageProvider: this.#storageProvider,
        })
      },
      status: 'authorized',
    })
  }

  async recordCancelled(
    input: CteIssuanceWriteBackKey & {
      readonly accessKey: string
      readonly cancellationProtocol: string
      readonly xml?: CteStoredXmlObject
    },
  ): Promise<void> {
    const { accessKey, cancellationProtocol, xml, ...key } = input
    await this.#apply({
      key,
      eventPayload: { accessKey, cancellationProtocol },
      settle: async (transaction) => {
        if (xml === undefined) {
          await insertIssuanceEvent(transaction, {
            key,
            eventName: 'reconciliation_required',
            payload: { reason: MISSING_CANCELLATION_XML_REASON },
          })
        }

        const cancellationXmlObjectId =
          xml === undefined
            ? undefined
            : await upsertStoredObject(transaction, {
                companyId: key.companyId,
                storageProvider: this.#storageProvider,
                xml,
              })

        await transaction
          .update(cteFiscalDocuments)
          .set({
            cancellationProtocol,
            cancelledAt: key.occurredAt,
            status: 'cancelled',
            ...(cancellationXmlObjectId === undefined
              ? {}
              : { cancellationXmlObjectId, cancellationXmlSha256: xml?.sha256 }),
          })
          .where(
            and(
              eq(cteFiscalDocuments.companyId, key.companyId),
              eq(cteFiscalDocuments.batchItemId, key.batchItemId),
            ),
          )
      },
      status: 'cancelled',
    })
  }

  /** SEFAZ recusou o 110111: libera a intenção para que uma nova solicitação seja possível. */
  async recordCancellationRejected(
    input: CteIssuanceWriteBackKey & { readonly errorCode: string },
  ): Promise<void> {
    const { errorCode, ...key } = input
    await this.#apply({
      key,
      eventPayload: { errorCode, operation: CANCEL_OPERATION },
      lastErrorCode: errorCode,
      settle: async (transaction) => {
        await transaction
          .update(cteFiscalDocuments)
          .set({ cancellationJustification: null, cancellationRequestedAt: null })
          .where(
            and(
              eq(cteFiscalDocuments.companyId, key.companyId),
              eq(cteFiscalDocuments.batchItemId, key.batchItemId),
            ),
          )
      },
      status: 'rejected',
    })
  }

  async recordRejected(
    input: CteIssuanceWriteBackKey & { readonly errorCode: string },
  ): Promise<void> {
    const { errorCode, ...key } = input
    await this.#apply({
      key,
      eventPayload: { errorCode },
      lastErrorCode: errorCode,
      status: 'rejected',
    })
  }

  async recordRetryScheduled(
    input: CteIssuanceWriteBackKey & { readonly cause: string },
  ): Promise<void> {
    const { cause, ...key } = input
    await this.#apply({
      key,
      eventPayload: { cause },
      lastErrorCause: cause,
      status: 'retry_scheduled',
    })
  }

  async recordFailed(input: CteIssuanceSettlementInput): Promise<void> {
    await this.#settleWithCause({ ...input, status: 'failed' })
  }

  /** Erro sem desfecho conhecido: a emissão pode ter chegado à SEFAZ, então o item vai a conciliação. */
  async recordReconciliationRequired(input: CteIssuanceSettlementInput): Promise<void> {
    await this.#settleWithCause({ ...input, status: 'reconciliation_required' })
  }

  async #settleWithCause(
    input: CteIssuanceSettlementInput & { readonly status: CteIssuanceItemStatus },
  ): Promise<void> {
    const settled = await this.#database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(cteIssuanceAttempts)
        .set({ lastErrorCause: input.cause, status: input.status, updatedAt: input.occurredAt })
        .where(
          and(
            eq(cteIssuanceAttempts.companyId, input.companyId),
            eq(cteIssuanceAttempts.id, input.attemptId),
            inArray(cteIssuanceAttempts.status, NON_SETTLED_STATUSES),
          ),
        )
        .returning({ batchId: cteIssuanceAttempts.batchId })

      if (updated === undefined) {
        return undefined
      }

      const key: CteIssuanceWriteBackKey = {
        attemptId: input.attemptId,
        batchId: updated.batchId,
        batchItemId: input.batchItemId,
        companyId: input.companyId,
        occurredAt: input.occurredAt,
      }

      await insertIssuanceEvent(transaction, {
        key,
        eventName: input.status,
        payload: { cause: input.cause },
      })

      const status = await synchronizeBatchStatus(transaction, key)

      return status === undefined ? undefined : { batchId: key.batchId, status }
    })

    await this.#announceBatchSettlement(input.companyId, settled)
  }

  async #apply(transition: AttemptTransition): Promise<void> {
    const settled = await this.#database.transaction(async (transaction) => {
      // Guarda a tentativa já liquidada: reentrega não pode sobrescrever autorização com rejeição.
      const [updated] = await transaction
        .update(cteIssuanceAttempts)
        .set({
          status: transition.status,
          updatedAt: transition.key.occurredAt,
          ...(transition.lastErrorCause === undefined
            ? {}
            : { lastErrorCause: transition.lastErrorCause }),
          ...(transition.lastErrorCode === undefined
            ? {}
            : { lastErrorCode: transition.lastErrorCode }),
        })
        .where(
          and(
            eq(cteIssuanceAttempts.companyId, transition.key.companyId),
            eq(cteIssuanceAttempts.id, transition.key.attemptId),
            inArray(cteIssuanceAttempts.status, NON_SETTLED_STATUSES),
          ),
        )
        .returning({ id: cteIssuanceAttempts.id })

      if (updated === undefined) {
        return undefined
      }

      await insertIssuanceEvent(transaction, {
        key: transition.key,
        eventName: transition.status,
        payload: transition.eventPayload,
      })

      await transition.settle?.(transaction)

      const status = await synchronizeBatchStatus(transaction, transition.key)

      return status === undefined ? undefined : { batchId: transition.key.batchId, status }
    })

    await this.#announceBatchSettlement(transition.key.companyId, settled)
  }
}

async function persistFiscalDocument(
  transaction: Transaction,
  input: {
    readonly document: CteIssuanceFiscalDocument
    readonly key: CteIssuanceWriteBackKey
    readonly storageProvider: string
  },
): Promise<void> {
  const xmlObjectId = await upsertStoredObject(transaction, {
    companyId: input.key.companyId,
    storageProvider: input.storageProvider,
    xml: input.document.xml,
  })

  await transaction
    .insert(cteFiscalDocuments)
    .values({
      accessKey: input.document.accessKey,
      attemptId: input.key.attemptId,
      authorizationProtocol: input.document.authorizationProtocol,
      authorizedAt: input.key.occurredAt,
      batchItemId: input.key.batchItemId,
      companyId: input.key.companyId,
      fiscalEnvironment: input.document.fiscalEnvironment,
      fiscalNumber: input.document.fiscalNumber,
      fiscalSeries: input.document.fiscalSeries,
      id: crypto.randomUUID(),
      status: 'authorized',
      xmlObjectId,
      xmlSha256: input.document.xml.sha256,
    })
    .onConflictDoNothing({
      target: [cteFiscalDocuments.companyId, cteFiscalDocuments.batchItemId],
    })
}

async function upsertStoredObject(
  transaction: Transaction,
  input: {
    readonly companyId: string
    readonly storageProvider: string
    readonly xml: CteStoredXmlObject
  },
): Promise<string> {
  const [inserted] = await transaction
    .insert(storedObjects)
    .values({
      bucket: input.xml.bucket,
      companyId: input.companyId,
      id: input.xml.objectId,
      mimeType: XML_MIME_TYPE,
      objectKey: input.xml.key,
      provider: input.storageProvider,
      purpose: 'cte_document',
      sha256: input.xml.sha256,
      sizeBytes: BigInt(input.xml.sizeBytes),
      status: 'final',
    })
    .onConflictDoNothing({
      target: [
        storedObjects.companyId,
        storedObjects.provider,
        storedObjects.bucket,
        storedObjects.objectKey,
      ],
    })
    .returning({ id: storedObjects.id })

  if (inserted !== undefined) {
    return inserted.id
  }

  const [existing] = await transaction
    .select({ id: storedObjects.id })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, input.companyId),
        eq(storedObjects.provider, input.storageProvider),
        eq(storedObjects.bucket, input.xml.bucket),
        eq(storedObjects.objectKey, input.xml.key),
      ),
    )
    .limit(1)

  if (existing === undefined) {
    throw new Error('CTE_AUTHORIZED_XML_OBJECT_NOT_FOUND')
  }

  return existing.id
}

async function insertIssuanceEvent(
  transaction: Transaction,
  input: {
    readonly eventName: string
    readonly key: CteIssuanceWriteBackKey
    readonly payload: Record<string, unknown>
  },
): Promise<void> {
  await transaction.insert(cteIssuanceEvents).values({
    attemptId: input.key.attemptId,
    batchItemId: input.key.batchItemId,
    companyId: input.key.companyId,
    eventName: input.eventName,
    id: crypto.randomUUID(),
    occurredAt: input.key.occurredAt,
    payload: input.payload,
  })
}

/** Devolve o status novo do lote quando ele mudou — é esse retorno que acorda o aviso pós-commit. */
async function synchronizeBatchStatus(
  transaction: Transaction,
  key: CteIssuanceWriteBackKey,
): Promise<CteBatchProgressStatus | undefined> {
  const nextStatus = resolveCteBatchStatus(await collectItemStatuses(transaction, key))

  const [current] = await transaction
    .select({ status: cteBatches.status })
    .from(cteBatches)
    .where(and(eq(cteBatches.companyId, key.companyId), eq(cteBatches.id, key.batchId)))
    .limit(1)

  if (current === undefined || current.status === nextStatus) {
    return undefined
  }

  await transaction
    .update(cteBatches)
    .set({ status: nextStatus, updatedAt: key.occurredAt })
    .where(and(eq(cteBatches.companyId, key.companyId), eq(cteBatches.id, key.batchId)))

  await transaction.insert(cteBatchEvents).values({
    batchId: key.batchId,
    companyId: key.companyId,
    eventName: nextStatus,
    id: crypto.randomUUID(),
    occurredAt: key.occurredAt,
    payload: { previousStatus: current.status },
  })

  return nextStatus
}

async function collectItemStatuses(
  transaction: Transaction,
  key: CteIssuanceWriteBackKey,
): Promise<readonly CteIssuanceItemStatus[]> {
  const items = await transaction
    .select({ id: cteBatchItems.id })
    .from(cteBatchItems)
    .where(and(eq(cteBatchItems.companyId, key.companyId), eq(cteBatchItems.batchId, key.batchId)))

  const attempts = await transaction
    .select({ batchItemId: cteIssuanceAttempts.batchItemId, status: cteIssuanceAttempts.status })
    .from(cteIssuanceAttempts)
    .where(
      and(
        eq(cteIssuanceAttempts.companyId, key.companyId),
        eq(cteIssuanceAttempts.batchId, key.batchId),
      ),
    )
    .orderBy(asc(cteIssuanceAttempts.createdAt))

  const latestByItem = new Map<string, CteIssuanceItemStatus>()
  for (const attempt of attempts) {
    latestByItem.set(attempt.batchItemId, attempt.status)
  }

  return items.map((item) => latestByItem.get(item.id) ?? 'pending')
}
