/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Reconcilia uma nota de serviço com a prefeitura: consulta a situação, arquiva o documento fiscal
 * quando ela autoriza e devolve a nota para a fila quando ainda não há resposta. Nenhum log carrega
 * dado do tomador nem mensagem da prefeitura — só identificador opaco e código estável.
 */
import type { WorkerLogger } from '../../shared/worker.types.js'
import {
  NFSE_DEFERRED_RECHECK_MINUTES,
  NFSE_PENDING_RECHECK_MINUTES,
} from '../domain/nfse-status-pull.constant.js'
import {
  resolveNfseReconciliationDecision,
  type NfseAuthorizedDocumentFacts,
  type NfseStatusFailureCause,
} from '../domain/nfse-reconciliation-outcome.policy.js'
import type { NfseDocumentStoragePort, NfseStoredDocument } from './nfse-document-storage.port.js'
import type { NfseStatusPort } from './nfse-fiscal-status.port.js'
import type { NfseReconciliationWriteBackPort } from './nfse-reconciliation-write-back.port.js'
import type { DueNfseInvoice } from './select-due-invoices.use-case.js'

const MILLISECONDS_PER_MINUTE = 60_000

export type NfseReconciliationOutcome =
  | 'authorized'
  | 'cancelled'
  | 'deferred'
  | 'rejected'
  | 'rescheduled'

/**
 * O adiamento **devolve a causa**, não só a registra: é ela que a rotina traduz no código com que a
 * execução fecha. Enquanto a causa vivia apenas na linha de log, três dos quatro códigos de falha
 * desta rotina no catálogo eram inalcançáveis, e o operador lia `unexpected_error` para tudo.
 */
export type ReconcileInvoiceResult =
  | { readonly cause: NfseStatusFailureCause; readonly outcome: 'deferred' }
  | { readonly outcome: Exclude<NfseReconciliationOutcome, 'deferred'> }

export type ReconcileInvoiceUseCase = {
  execute(input: {
    readonly invoice: DueNfseInvoice
    readonly now: Date
  }): Promise<ReconcileInvoiceResult>
}

/**
 * Opcional de propósito: o deploy de NFS-e sobe sem broker nem chave de supressão, e a
 * reconciliação fiscal não pode depender de o aviso existir para acontecer.
 */
export type NfseRejectionNotifierPort = {
  notifyRejection(input: {
    readonly attemptId: string
    readonly companyId: string
    readonly invoiceId: string
    readonly rejectionMessage: string
  }): Promise<void>
}

type ReconcileDependencies = {
  readonly documentStorage: NfseDocumentStoragePort
  readonly logger: WorkerLogger
  readonly notifier?: NfseRejectionNotifierPort
  readonly status: NfseStatusPort
  readonly writeBack: NfseReconciliationWriteBackPort
}

export function createReconcileInvoiceUseCase(
  dependencies: ReconcileDependencies,
): ReconcileInvoiceUseCase {
  return {
    async execute({ invoice, now }) {
      const provider = await dependencies.status.fetchStatus({
        credential: invoice.credential,
        providerDocumentId: invoice.providerDocumentId,
      })
      const decision = resolveNfseReconciliationDecision({
        provider,
        storedStatus: invoice.status,
      })

      if (decision.kind === 'authorize') {
        return settleAuthorization({ decision: decision.document, dependencies, invoice, now })
      }

      if (decision.kind === 'reject') {
        await dependencies.writeBack.recordRejected({
          attemptId: invoice.attemptId,
          companyId: invoice.companyId,
          errorCode: decision.errorCode,
          errorMessage: decision.errorMessage,
          invoiceId: invoice.invoiceId,
          occurredAt: now,
        })
        log(dependencies, 'nfse_status_pull_rejected', invoice, decision.errorCode)
        // Depois da gravação: o aviso conta um fato já persistido, nunca uma intenção.
        await dependencies.notifier?.notifyRejection({
          attemptId: invoice.attemptId,
          companyId: invoice.companyId,
          invoiceId: invoice.invoiceId,
          rejectionMessage: decision.errorMessage,
        })
        return { outcome: 'rejected' }
      }

      if (decision.kind === 'confirmCancellation') {
        await dependencies.writeBack.recordCancellationConfirmed({
          attemptId: invoice.attemptId,
          cancelledAt: readInstant(decision.cancelledAt) ?? now,
          companyId: invoice.companyId,
          invoiceId: invoice.invoiceId,
          occurredAt: now,
        })
        return { outcome: 'cancelled' }
      }

      if (decision.kind === 'reschedule') {
        await reschedule({ dependencies, invoice, minutes: NFSE_PENDING_RECHECK_MINUTES, now })
        return { outcome: 'rescheduled' }
      }

      return defer({ cause: decision.cause, dependencies, invoice, now })
    },
  }
}

async function settleAuthorization(input: {
  readonly decision: NfseAuthorizedDocumentFacts
  readonly dependencies: ReconcileDependencies
  readonly invoice: DueNfseInvoice
  readonly now: Date
}): Promise<ReconcileInvoiceResult> {
  const { decision, dependencies, invoice, now } = input

  const authorizedAt = readInstant(decision.authorizedAt)
  if (authorizedAt === undefined) {
    return defer({ cause: 'malformed_response', dependencies, invoice, now })
  }

  /** O XML é o documento fiscal: sem ele não há o que arquivar, e a nota não pode liquidar. */
  const xmlFetch = await dependencies.status.fetchDocument({
    credential: invoice.credential,
    kind: 'xml',
    providerDocumentId: invoice.providerDocumentId,
  })
  if (xmlFetch.status !== 'ok') {
    return defer({ cause: xmlFetch.cause, dependencies, invoice, now })
  }

  const xml = await dependencies.documentStorage.store({
    bytes: xmlFetch.bytes,
    companyId: invoice.companyId,
    kind: 'xml',
    providerDocumentId: invoice.providerDocumentId,
  })
  const pdf = await storePdf({ dependencies, invoice })

  await dependencies.writeBack.recordAuthorized({
    attemptId: invoice.attemptId,
    authorizedAt,
    companyId: invoice.companyId,
    fiscalEnvironment: invoice.credential.fiscalEnvironment,
    fiscalNumber: decision.fiscalNumber,
    invoiceId: invoice.invoiceId,
    occurredAt: now,
    ...(pdf === undefined ? {} : { pdf }),
    providerDocumentId: invoice.providerDocumentId,
    verificationCode: decision.verificationCode,
    xml,
  })

  return { outcome: 'authorized' }
}

/** O PDF é conveniência para o cliente: a falta dele não impede a autorização de ser gravada. */
async function storePdf(input: {
  readonly dependencies: ReconcileDependencies
  readonly invoice: DueNfseInvoice
}): Promise<NfseStoredDocument | undefined> {
  const { dependencies, invoice } = input

  const pdfFetch = await dependencies.status.fetchDocument({
    credential: invoice.credential,
    kind: 'pdf',
    providerDocumentId: invoice.providerDocumentId,
  })
  if (pdfFetch.status !== 'ok') {
    log(dependencies, 'nfse_status_pull_pdf_unavailable', invoice, pdfFetch.cause)
    return undefined
  }

  return dependencies.documentStorage.store({
    bytes: pdfFetch.bytes,
    companyId: invoice.companyId,
    kind: 'pdf',
    providerDocumentId: invoice.providerDocumentId,
  })
}

async function defer(input: {
  readonly cause: NfseStatusFailureCause
  readonly dependencies: ReconcileDependencies
  readonly invoice: DueNfseInvoice
  readonly now: Date
}): Promise<ReconcileInvoiceResult> {
  await reschedule({
    dependencies: input.dependencies,
    invoice: input.invoice,
    minutes: NFSE_DEFERRED_RECHECK_MINUTES,
    now: input.now,
  })
  log(input.dependencies, 'nfse_status_pull_reconciliation_deferred', input.invoice, input.cause)
  return { cause: input.cause, outcome: 'deferred' }
}

function reschedule(input: {
  readonly dependencies: ReconcileDependencies
  readonly invoice: DueNfseInvoice
  readonly minutes: number
  readonly now: Date
}): Promise<void> {
  return input.dependencies.writeBack.rescheduleStatusCheck({
    companyId: input.invoice.companyId,
    invoiceId: input.invoice.invoiceId,
    nextStatusCheckAt: new Date(input.now.getTime() + input.minutes * MILLISECONDS_PER_MINUTE),
  })
}

function log(
  dependencies: ReconcileDependencies,
  event: string,
  invoice: DueNfseInvoice,
  errorCode: string,
): void {
  dependencies.logger.info(event, {
    companyId: invoice.companyId,
    errorCode,
    invoiceId: invoice.invoiceId,
  })
}

function readInstant(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined
  const instant = new Date(value)
  return Number.isNaN(instant.getTime()) ? undefined : instant
}
