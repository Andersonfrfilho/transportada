/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Leitura e liquidação da reconciliação de NFS-e. Duas invariantes moram aqui:
 *
 * 1. **A transição é decidida pelo banco.** Todo `UPDATE` projeta o status de origem permitido no
 *    próprio `WHERE`; se nada volta do `RETURNING`, a nota já foi liquidada por outro caminho e a
 *    escrita inteira é abandonada sem efeito — é o que torna o ciclo repetível.
 * 2. **Uma transação por nota.** Objeto arquivado, documento fiscal, evento e nota mudam juntos.
 */
import { and, desc, eq, inArray } from 'drizzle-orm'

import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { storedObjects } from '../../database/nfe.schema.js'
import {
  nfseFiscalDocuments,
  nfseIssuanceAttempts,
  nfseIssuanceEvents,
  nfseProviderCredentials,
  nfseServiceInvoices,
  type NfseAttemptKind,
  type NfseFiscalEnvironment,
  type NfseIssuanceStatus,
  type NfseServiceInvoiceStatus,
} from '../../database/nfse-issuance-execution.schema.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { buildDueInvoiceOrdering } from './nfse-reconciliation.query.js'
import type { NfseStoredDocument } from '../application/nfse-document-storage.port.js'
import type { NfseReconciliationWriteBackPort } from '../application/nfse-reconciliation-write-back.port.js'
import type {
  NfseReconciliationCandidate,
  NfseReconciliationCandidateSourcePort,
  NfseReconciliationCredential,
  NfseReconciliationInvoiceStatus,
} from '../application/select-due-invoices.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

const POLLABLE_INVOICE_STATUSES = ['pending_authorization', 'cancellation_requested'] as const

const NON_SETTLED_ATTEMPT_STATUSES: readonly NfseIssuanceStatus[] = [
  'pending',
  'in_flight',
  'accepted',
  'retry_scheduled',
  'reconciliation_required',
]

const STORAGE_MIME_TYPE = {
  pdf: 'application/pdf',
  xml: 'application/xml',
} as const

const NFSE_STORAGE_PURPOSE = 'nfse_document'
const FINAL_OBJECT_STATUS = 'final'

const DEFAULT_STORAGE_PROVIDER = 'minio'

export function createDrizzleNfseReconciliationSource(dependencies: {
  readonly db: Database
  readonly logger: WorkerLogger
}): NfseReconciliationCandidateSourcePort {
  return {
    async listCandidates({ environment, limit }) {
      const invoices = await dependencies.db
        .select({
          companyId: nfseServiceInvoices.companyId,
          invoiceId: nfseServiceInvoices.id,
          nextStatusCheckAt: nfseServiceInvoices.nextStatusCheckAt,
          providerDocumentId: nfseServiceInvoices.providerDocumentId,
          status: nfseServiceInvoices.status,
        })
        .from(nfseServiceInvoices)
        .where(inArray(nfseServiceInvoices.status, POLLABLE_INVOICE_STATUSES))
        .orderBy(buildDueInvoiceOrdering())
        .limit(limit)

      if (invoices.length === 0) return []

      const [attempts, credentials] = await Promise.all([
        listLatestAttempts({
          companyIds: invoices.map((invoice) => invoice.companyId),
          db: dependencies.db,
          invoiceIds: invoices.map((invoice) => invoice.invoiceId),
        }),
        listCredentials({
          companyIds: invoices.map((invoice) => invoice.companyId),
          db: dependencies.db,
          environment,
        }),
      ])

      dependencies.logger.info('cron_nfse_candidates_evaluated', {
        environment,
        evaluatedCount: invoices.length,
      })

      return invoices.map((invoice) =>
        toCandidate({
          attemptId: attempts.get(
            buildAttemptKey({
              attemptKind: resolveAttemptKind(invoice.status),
              invoiceId: invoice.invoiceId,
            }),
          ),
          credential: credentials.get(invoice.companyId),
          invoice,
        }),
      )
    },
  }
}

export function createDrizzleNfseReconciliationWriteBack(dependencies: {
  readonly db: Database
  /** Mesmo rótulo das outras escritas de objeto do worker: é o `provider` da linha, não a URL. */
  readonly storageProvider?: string
}): NfseReconciliationWriteBackPort {
  return {
    async recordAuthorized(input) {
      await dependencies.db.transaction(async (transaction) => {
        const settled = await settleAttempt(transaction, {
          attemptId: input.attemptId,
          companyId: input.companyId,
          occurredAt: input.occurredAt,
          status: 'authorized',
        })
        if (!settled) return

        const xmlObjectId = await upsertStoredObject(transaction, {
          companyId: input.companyId,
          document: input.xml,
          kind: 'xml',
          storageProvider: dependencies.storageProvider ?? DEFAULT_STORAGE_PROVIDER,
        })
        const pdfObjectId =
          input.pdf === undefined
            ? undefined
            : await upsertStoredObject(transaction, {
                companyId: input.companyId,
                document: input.pdf,
                kind: 'pdf',
                storageProvider: dependencies.storageProvider ?? DEFAULT_STORAGE_PROVIDER,
              })

        await transaction
          .insert(nfseFiscalDocuments)
          .values({
            attemptId: input.attemptId,
            authorizedAt: input.authorizedAt,
            companyId: input.companyId,
            fiscalEnvironment: input.fiscalEnvironment,
            fiscalNumber: input.fiscalNumber,
            invoiceId: input.invoiceId,
            providerDocumentId: input.providerDocumentId,
            status: 'authorized',
            updatedAt: input.occurredAt,
            verificationCode: input.verificationCode,
            xmlObjectId,
            xmlSha256: input.xml.sha256,
            ...(input.pdf === undefined || pdfObjectId === undefined
              ? {}
              : { pdfObjectId, pdfSha256: input.pdf.sha256 }),
          })
          .onConflictDoNothing()

        await insertEvent(transaction, {
          attemptId: input.attemptId,
          companyId: input.companyId,
          eventName: 'authorized',
          invoiceId: input.invoiceId,
          occurredAt: input.occurredAt,
          payload: {
            fiscalNumber: input.fiscalNumber,
            providerDocumentId: input.providerDocumentId,
          },
        })

        await transaction
          .update(nfseServiceInvoices)
          .set({
            authorizedAt: input.authorizedAt,
            nextStatusCheckAt: null,
            providerDocumentId: input.providerDocumentId,
            providerNumber: input.fiscalNumber,
            status: 'authorized',
            updatedAt: input.occurredAt,
            verificationCode: input.verificationCode,
          })
          .where(
            invoiceTransitionFilter({
              companyId: input.companyId,
              from: ['pending_authorization'],
              invoiceId: input.invoiceId,
            }),
          )
      })
    },

    async recordCancellationConfirmed(input) {
      await dependencies.db.transaction(async (transaction) => {
        const settled = await settleAttempt(transaction, {
          attemptId: input.attemptId,
          companyId: input.companyId,
          occurredAt: input.occurredAt,
          status: 'cancelled',
        })
        if (!settled) return

        await insertEvent(transaction, {
          attemptId: input.attemptId,
          companyId: input.companyId,
          eventName: 'cancelled',
          invoiceId: input.invoiceId,
          occurredAt: input.occurredAt,
          payload: {},
        })

        await transaction
          .update(nfseFiscalDocuments)
          .set({
            cancelledAt: input.cancelledAt,
            status: 'cancelled',
            updatedAt: input.occurredAt,
          })
          .where(
            and(
              eq(nfseFiscalDocuments.companyId, input.companyId),
              eq(nfseFiscalDocuments.invoiceId, input.invoiceId),
            ),
          )

        await transaction
          .update(nfseServiceInvoices)
          .set({
            cancelledAt: input.cancelledAt,
            nextStatusCheckAt: null,
            status: 'cancelled',
            updatedAt: input.occurredAt,
          })
          .where(
            invoiceTransitionFilter({
              companyId: input.companyId,
              from: ['cancellation_requested'],
              invoiceId: input.invoiceId,
            }),
          )
      })
    },

    async recordRejected(input) {
      await dependencies.db.transaction(async (transaction) => {
        const settled = await settleAttempt(transaction, {
          attemptId: input.attemptId,
          companyId: input.companyId,
          errorCode: input.errorCode,
          errorMessage: input.errorMessage,
          occurredAt: input.occurredAt,
          status: 'rejected',
        })
        if (!settled) return

        await insertEvent(transaction, {
          attemptId: input.attemptId,
          companyId: input.companyId,
          eventName: 'rejected',
          invoiceId: input.invoiceId,
          occurredAt: input.occurredAt,
          payload: { errorCode: input.errorCode, errorMessage: input.errorMessage },
        })

        await transaction
          .update(nfseServiceInvoices)
          .set({
            nextStatusCheckAt: null,
            rejectionCode: input.errorCode,
            rejectionMessage: input.errorMessage,
            status: 'rejected',
            updatedAt: input.occurredAt,
          })
          .where(
            invoiceTransitionFilter({
              companyId: input.companyId,
              from: ['pending_authorization'],
              invoiceId: input.invoiceId,
            }),
          )
      })
    },

    /** Reagendar não é liquidar: a nota continua pendente e só a próxima janela muda. */
    async rescheduleStatusCheck(input) {
      await dependencies.db
        .update(nfseServiceInvoices)
        .set({ nextStatusCheckAt: input.nextStatusCheckAt })
        .where(
          invoiceTransitionFilter({
            companyId: input.companyId,
            from: POLLABLE_INVOICE_STATUSES,
            invoiceId: input.invoiceId,
          }),
        )
    },
  }
}

function invoiceTransitionFilter(input: {
  readonly companyId: string
  readonly from: readonly NfseServiceInvoiceStatus[]
  readonly invoiceId: string
}) {
  return and(
    eq(nfseServiceInvoices.companyId, input.companyId),
    eq(nfseServiceInvoices.id, input.invoiceId),
    inArray(nfseServiceInvoices.status, input.from),
  )
}

async function settleAttempt(
  transaction: Transaction,
  input: {
    readonly attemptId: string
    readonly companyId: string
    readonly errorCode?: string
    readonly errorMessage?: string
    readonly occurredAt: Date
    readonly status: NfseIssuanceStatus
  },
): Promise<boolean> {
  const [updated] = await transaction
    .update(nfseIssuanceAttempts)
    .set({
      status: input.status,
      updatedAt: input.occurredAt,
      ...(input.errorCode === undefined ? {} : { lastErrorCode: input.errorCode }),
      ...(input.errorMessage === undefined ? {} : { lastErrorMessage: input.errorMessage }),
    })
    .where(
      and(
        eq(nfseIssuanceAttempts.companyId, input.companyId),
        eq(nfseIssuanceAttempts.id, input.attemptId),
        inArray(nfseIssuanceAttempts.status, NON_SETTLED_ATTEMPT_STATUSES),
      ),
    )
    .returning({ id: nfseIssuanceAttempts.id })

  return updated !== undefined
}

async function insertEvent(
  transaction: Transaction,
  input: {
    readonly attemptId: string
    readonly companyId: string
    readonly eventName: string
    readonly invoiceId: string
    readonly occurredAt: Date
    readonly payload: Record<string, unknown>
  },
): Promise<void> {
  await transaction.insert(nfseIssuanceEvents).values({
    attemptId: input.attemptId,
    companyId: input.companyId,
    eventName: input.eventName,
    invoiceId: input.invoiceId,
    occurredAt: input.occurredAt,
    payload: input.payload,
  })
}

/**
 * Reprocessar a mesma nota reencontra o objeto já gravado — a chave é determinística e a escrita no
 * bucket é `create-only`. O `onConflictDoNothing` traduz isso para o banco.
 */
async function upsertStoredObject(
  transaction: Transaction,
  input: {
    readonly companyId: string
    readonly document: NfseStoredDocument
    readonly kind: 'pdf' | 'xml'
    readonly storageProvider: string
  },
): Promise<string> {
  const [inserted] = await transaction
    .insert(storedObjects)
    .values({
      bucket: input.document.bucket,
      companyId: input.companyId,
      id: input.document.objectId,
      mimeType: STORAGE_MIME_TYPE[input.kind],
      objectKey: input.document.key,
      provider: input.storageProvider,
      purpose: NFSE_STORAGE_PURPOSE,
      sha256: input.document.sha256,
      sizeBytes: BigInt(input.document.sizeBytes),
      status: FINAL_OBJECT_STATUS,
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

  if (inserted !== undefined) return inserted.id

  const [existing] = await transaction
    .select({ id: storedObjects.id })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, input.companyId),
        eq(storedObjects.provider, input.storageProvider),
        eq(storedObjects.bucket, input.document.bucket),
        eq(storedObjects.objectKey, input.document.key),
      ),
    )
    .limit(1)

  if (existing === undefined) throw new Error('NFSE_STORED_OBJECT_NOT_FOUND')

  return existing.id
}

async function listLatestAttempts(input: {
  readonly companyIds: readonly string[]
  readonly db: Database
  readonly invoiceIds: readonly string[]
}): Promise<ReadonlyMap<string, string>> {
  const rows = await input.db
    .select({
      attemptId: nfseIssuanceAttempts.id,
      attemptKind: nfseIssuanceAttempts.attemptKind,
      invoiceId: nfseIssuanceAttempts.invoiceId,
    })
    .from(nfseIssuanceAttempts)
    .where(
      and(
        inArray(nfseIssuanceAttempts.companyId, input.companyIds),
        inArray(nfseIssuanceAttempts.invoiceId, input.invoiceIds),
      ),
    )
    .orderBy(desc(nfseIssuanceAttempts.attemptNumber))

  const latest = new Map<string, string>()
  for (const row of rows) {
    const key = buildAttemptKey({ attemptKind: row.attemptKind, invoiceId: row.invoiceId })
    /** As linhas vêm da maior tentativa para a menor: a primeira de cada chave é a vigente. */
    if (!latest.has(key)) latest.set(key, row.attemptId)
  }
  return latest
}

/**
 * A credencial é buscada já no ambiente do ciclo: se a empresa só tiver credencial do outro
 * ambiente, a nota sai como `missing_credential` — e é o que se quer, porque poll no ambiente
 * errado é pior que poll nenhum.
 */
async function listCredentials(input: {
  readonly companyIds: readonly string[]
  readonly db: Database
  readonly environment: NfseFiscalEnvironment
}): Promise<ReadonlyMap<string, NfseReconciliationCredential>> {
  const rows = await input.db
    .select({
      companyId: nfseProviderCredentials.companyId,
      credentialId: nfseProviderCredentials.id,
      envelope: nfseProviderCredentials.secretEnvelope,
      fiscalEnvironment: nfseProviderCredentials.fiscalEnvironment,
      municipalRegistration: nfseProviderCredentials.municipalRegistration,
      status: nfseProviderCredentials.status,
    })
    .from(nfseProviderCredentials)
    .where(
      and(
        inArray(nfseProviderCredentials.companyId, input.companyIds),
        eq(nfseProviderCredentials.fiscalEnvironment, input.environment),
      ),
    )

  const byCompany = new Map<string, NfseReconciliationCredential>()
  for (const row of rows) {
    const current = byCompany.get(row.companyId)
    if (current !== undefined && current.status === 'active') continue
    byCompany.set(row.companyId, {
      credentialId: row.credentialId,
      envelope: row.envelope,
      fiscalEnvironment: row.fiscalEnvironment,
      municipalRegistration: row.municipalRegistration,
      status: row.status,
    })
  }
  return byCompany
}

function toCandidate(input: {
  readonly attemptId: string | undefined
  readonly credential: NfseReconciliationCredential | undefined
  readonly invoice: {
    readonly companyId: string
    readonly invoiceId: string
    readonly nextStatusCheckAt: Date | null
    readonly providerDocumentId: string | null
    readonly status: NfseServiceInvoiceStatus
  }
}): NfseReconciliationCandidate {
  return {
    companyId: input.invoice.companyId,
    invoiceId: input.invoice.invoiceId,
    status: toReconciliationStatus(input.invoice.status),
    ...(input.attemptId === undefined ? {} : { attemptId: input.attemptId }),
    ...(input.credential === undefined ? {} : { credential: input.credential }),
    ...(input.invoice.nextStatusCheckAt === null
      ? {}
      : { nextStatusCheckAt: input.invoice.nextStatusCheckAt }),
    ...(input.invoice.providerDocumentId === null
      ? {}
      : { providerDocumentId: input.invoice.providerDocumentId }),
  }
}

/** Status fora do vocabulário da reconciliação não é pendente — e a política o barra por isso. */
function toReconciliationStatus(status: NfseServiceInvoiceStatus): NfseReconciliationInvoiceStatus {
  switch (status) {
    case 'authorized':
    case 'cancellation_requested':
    case 'cancelled':
    case 'pending_authorization':
    case 'rejected':
      return status
    default:
      return 'draft'
  }
}

function resolveAttemptKind(status: NfseServiceInvoiceStatus): NfseAttemptKind {
  return status === 'cancellation_requested' ? 'cancel' : 'issue'
}

function buildAttemptKey(input: {
  readonly attemptKind: NfseAttemptKind
  readonly invoiceId: string
}): string {
  return `${input.invoiceId}:${input.attemptKind}`
}
