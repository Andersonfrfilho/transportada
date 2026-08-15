/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray } from 'drizzle-orm'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import {
  nfseFiscalDocuments,
  nfseIssuanceAttempts,
  nfseIssuanceEvents,
  nfseServiceInvoices,
  type NfseIssuanceStatus,
} from '../../database/nfse-issuance-execution.schema.js'
import type {
  NfseIssuanceWriteBack,
  NfseIssuanceWriteBackKey,
} from '../application/nfse-issuance-consumer.effect.js'
import { NFSE_NON_SETTLED_ATTEMPT_STATUSES } from '../domain/nfse-attempt-status.policy.js'
import {
  listNfseWriteBackSourceStatuses,
  resolveNfseWriteBackTargetStatus,
  type NfseWriteBackKind,
} from '../domain/nfse-write-back.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type InvoiceFields = {
  readonly cancelledAt?: Date
  readonly providerDocumentId?: string
  readonly rejectionCode?: string
  readonly rejectionMessage?: string
}

type AttemptTransition = {
  readonly eventPayload: Record<string, unknown>
  readonly invoiceFields?: InvoiceFields
  readonly invoiceKind?: NfseWriteBackKind
  readonly key: NfseIssuanceWriteBackKey
  readonly lastErrorCause?: string
  readonly lastErrorCode?: string
  readonly lastErrorMessage?: string
  readonly status: NfseIssuanceStatus
}

export class DrizzleNfseIssuanceWriteBackRepository implements NfseIssuanceWriteBack {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async recordInFlight(key: NfseIssuanceWriteBackKey): Promise<void> {
    await this.#apply({ eventPayload: {}, invoiceKind: 'inFlight', key, status: 'in_flight' })
  }

  async recordAccepted(
    input: NfseIssuanceWriteBackKey & { readonly providerDocumentId?: string },
  ): Promise<void> {
    const { providerDocumentId, ...key } = input
    await this.#apply({
      eventPayload: providerDocumentId === undefined ? {} : { providerDocumentId },
      ...(providerDocumentId === undefined ? {} : { invoiceFields: { providerDocumentId } }),
      invoiceKind: 'accepted',
      key,
      status: 'accepted',
    })
  }

  async recordCancellationConfirmed(key: NfseIssuanceWriteBackKey): Promise<void> {
    await this.#apply({
      eventPayload: {},
      invoiceFields: { cancelledAt: key.occurredAt },
      invoiceKind: 'cancelled',
      key,
      status: 'cancelled',
    })
  }

  /** A recusa da prefeitura fica na linha da tentativa e na nota: é o que o operador lê para corrigir. */
  async recordRejected(
    input: NfseIssuanceWriteBackKey & {
      readonly errorCode: string
      readonly errorMessage?: string
    },
  ): Promise<void> {
    const { errorCode, errorMessage, ...key } = input
    await this.#apply({
      eventPayload: { errorCode, ...(errorMessage === undefined ? {} : { errorMessage }) },
      invoiceFields: {
        rejectionCode: errorCode,
        ...(errorMessage === undefined ? {} : { rejectionMessage: errorMessage }),
      },
      invoiceKind: 'rejected',
      key,
      lastErrorCode: errorCode,
      ...(errorMessage === undefined ? {} : { lastErrorMessage: errorMessage }),
      status: 'rejected',
    })
  }

  /** Retry agendado não mexe na nota: ela segue `issuing` até a próxima entrega decidir. */
  async recordRetryScheduled(
    input: NfseIssuanceWriteBackKey & { readonly cause: string },
  ): Promise<void> {
    const { cause, ...key } = input
    await this.#apply({
      eventPayload: { cause },
      key,
      lastErrorCause: cause,
      status: 'retry_scheduled',
    })
  }

  async recordFailed(input: {
    readonly attemptId: string
    readonly cause: string
    readonly companyId: string
    readonly invoiceId: string
    readonly occurredAt: Date
  }): Promise<void> {
    const { cause, ...key } = input
    await this.#apply({
      eventPayload: { cause },
      invoiceKind: 'failed',
      key,
      lastErrorCause: cause,
      status: 'failed',
    })
  }

  async #apply(transition: AttemptTransition): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(nfseIssuanceAttempts)
        .set({
          status: transition.status,
          updatedAt: transition.key.occurredAt,
          ...(transition.lastErrorCause === undefined
            ? {}
            : { lastErrorCause: transition.lastErrorCause }),
          ...(transition.lastErrorCode === undefined
            ? {}
            : { lastErrorCode: transition.lastErrorCode }),
          ...(transition.lastErrorMessage === undefined
            ? {}
            : { lastErrorMessage: transition.lastErrorMessage }),
        })
        .where(
          and(
            eq(nfseIssuanceAttempts.companyId, transition.key.companyId),
            eq(nfseIssuanceAttempts.id, transition.key.attemptId),
            inArray(nfseIssuanceAttempts.status, NFSE_NON_SETTLED_ATTEMPT_STATUSES),
          ),
        )
        .returning({ id: nfseIssuanceAttempts.id })

      if (updated === undefined) {
        return
      }

      await insertIssuanceEvent(transaction, {
        eventName: transition.status,
        key: transition.key,
        payload: transition.eventPayload,
      })

      if (transition.invoiceKind === undefined) {
        return
      }

      if (transition.invoiceKind === 'cancelled') {
        await cancelFiscalDocument(transaction, transition.key)
      }

      await updateInvoiceStatus(transaction, {
        fields: transition.invoiceFields ?? {},
        key: transition.key,
        kind: transition.invoiceKind,
      })
    })
  }
}

/**
 * Nota cancelada na prefeitura não pode seguir `authorized` no registro fiscal — é a linha que a
 * auditoria lê. Mesmo recorte do job de reconciliação, que escreve isto quando quem confirma é ele.
 */
async function cancelFiscalDocument(
  transaction: Transaction,
  key: NfseIssuanceWriteBackKey,
): Promise<void> {
  await transaction
    .update(nfseFiscalDocuments)
    .set({ cancelledAt: key.occurredAt, status: 'cancelled', updatedAt: key.occurredAt })
    .where(
      and(
        eq(nfseFiscalDocuments.companyId, key.companyId),
        eq(nfseFiscalDocuments.invoiceId, key.invoiceId),
      ),
    )
}

/**
 * A decisão da transição é a linha do banco, e não o `status` que veio no envelope: o `inArray`
 * é o mesmo recorte da política, aplicado na própria escrita para não haver janela entre ler e escrever.
 */
async function updateInvoiceStatus(
  transaction: Transaction,
  input: {
    readonly fields: InvoiceFields
    readonly key: NfseIssuanceWriteBackKey
    readonly kind: NfseWriteBackKind
  },
): Promise<void> {
  await transaction
    .update(nfseServiceInvoices)
    .set({
      status: resolveNfseWriteBackTargetStatus(input.kind),
      updatedAt: input.key.occurredAt,
      ...input.fields,
    })
    .where(
      and(
        eq(nfseServiceInvoices.companyId, input.key.companyId),
        eq(nfseServiceInvoices.id, input.key.invoiceId),
        inArray(nfseServiceInvoices.status, listNfseWriteBackSourceStatuses(input.kind)),
      ),
    )
}

async function insertIssuanceEvent(
  transaction: Transaction,
  input: {
    readonly eventName: string
    readonly key: NfseIssuanceWriteBackKey
    readonly payload: Record<string, unknown>
  },
): Promise<void> {
  await transaction.insert(nfseIssuanceEvents).values({
    attemptId: input.key.attemptId,
    companyId: input.key.companyId,
    eventName: input.eventName,
    invoiceId: input.key.invoiceId,
    occurredAt: input.key.occurredAt,
    payload: input.payload,
  })
}
