/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type {
  NfseDocumentStoragePort,
  NfseStoredDocument,
} from '../../src/nfse-status-pull/application/nfse-document-storage.port.js'
import type {
  NfseDocumentFetchFacts,
  NfseStatusPort,
} from '../../src/nfse-status-pull/application/nfse-fiscal-status.port.js'
import type { NfseReconciliationWriteBackPort } from '../../src/nfse-status-pull/application/nfse-reconciliation-write-back.port.js'
import { createReconcileInvoiceUseCase } from '../../src/nfse-status-pull/application/reconcile-invoice.use-case.js'
import type { DueNfseInvoice } from '../../src/nfse-status-pull/application/select-due-invoices.use-case.js'
import type { NfseProviderStatusFacts } from '../../src/nfse-status-pull/domain/nfse-reconciliation-outcome.policy.js'
import {
  NFSE_DEFERRED_RECHECK_MINUTES,
  NFSE_PENDING_RECHECK_MINUTES,
} from '../../src/nfse-status-pull/domain/nfse-status-pull.constant.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

const NOW = new Date('2026-08-12T12:00:00.000Z')
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const INVOICE_ID = '00000000-0000-4000-8000-0000000000f1'
const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000a1'
const CREDENTIAL_ID = '00000000-0000-4000-8000-0000000000e1'
const PROVIDER_DOCUMENT_ID = '900123456'
const XML_BYTES = new Uint8Array([0x3c, 0x6e, 0x66, 0x73, 0x65, 0x3e])
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])

/** Nome do tomador e mensagem da prefeitura são dado pessoal: nenhum log pode carregá-los. */
const TAKER_LEGAL_NAME = 'Comercio de Bebidas Sintetico Ltda'
const REJECTION_MESSAGE = `Tomador ${TAKER_LEGAL_NAME} sem inscricao municipal valida`

const AUTHORIZED_DOCUMENT = {
  authorizedAt: '2026-08-12T11:45:00.000Z',
  fiscalNumber: '4321',
  providerDocumentId: PROVIDER_DOCUMENT_ID,
  verificationCode: 'VER-0001',
} as const

function dueInvoice(overrides: Partial<DueNfseInvoice> = {}): DueNfseInvoice {
  return {
    attemptId: ATTEMPT_ID,
    companyId: COMPANY_ID,
    credential: {
      companyId: COMPANY_ID,
      credentialId: CREDENTIAL_ID,
      envelope: { sealed: true },
      fiscalEnvironment: 'homologation',
      municipalRegistration: '12345678',
    },
    invoiceId: INVOICE_ID,
    providerDocumentId: PROVIDER_DOCUMENT_ID,
    status: 'pending_authorization',
    ...overrides,
  }
}

type StatusScript = {
  readonly documents?: Partial<Record<'pdf' | 'xml', NfseDocumentFetchFacts>>
  readonly status: NfseProviderStatusFacts
}

function createStatusPort(script: StatusScript): NfseStatusPort & {
  readonly documentCalls: Array<'pdf' | 'xml'>
} {
  const documentCalls: Array<'pdf' | 'xml'> = []
  return {
    documentCalls,
    fetchDocument: ({ kind }) => {
      documentCalls.push(kind)
      const fallback: NfseDocumentFetchFacts =
        kind === 'xml'
          ? { bytes: XML_BYTES, contentType: 'application/xml', status: 'ok' }
          : { bytes: PDF_BYTES, contentType: 'application/pdf', status: 'ok' }
      return Promise.resolve(script.documents?.[kind] ?? fallback)
    },
    fetchStatus: () => Promise.resolve(script.status),
  }
}

function createDocumentStorage(): NfseDocumentStoragePort & {
  readonly stored: Array<{ readonly companyId: string; readonly kind: 'pdf' | 'xml' }>
} {
  const stored: Array<{ readonly companyId: string; readonly kind: 'pdf' | 'xml' }> = []
  return {
    stored,
    store: (input) => {
      stored.push({ companyId: input.companyId, kind: input.kind })
      const document: NfseStoredDocument = {
        bucket: 'transportada-local',
        key: `tenants/${input.companyId}/nfse-documents/${input.providerDocumentId}/${
          input.kind === 'xml' ? 'authorized.xml' : 'nota.pdf'
        }`,
        objectId: `00000000-0000-4000-8000-0000000000${input.kind === 'xml' ? '01' : '02'}`,
        sha256: `sha-${input.kind}`,
        sizeBytes: input.bytes.byteLength,
      }
      return Promise.resolve(document)
    },
  }
}

type WriteBackRecorder = NfseReconciliationWriteBackPort & {
  readonly authorized: Array<Record<string, unknown>>
  readonly cancelled: Array<Record<string, unknown>>
  readonly rejected: Array<Record<string, unknown>>
  readonly rescheduled: Array<Record<string, unknown>>
}

function createWriteBack(): WriteBackRecorder {
  const authorized: Array<Record<string, unknown>> = []
  const cancelled: Array<Record<string, unknown>> = []
  const rejected: Array<Record<string, unknown>> = []
  const rescheduled: Array<Record<string, unknown>> = []
  return {
    authorized,
    cancelled,
    recordAuthorized: (input) => {
      authorized.push({ ...input })
      return Promise.resolve()
    },
    recordCancellationConfirmed: (input) => {
      cancelled.push({ ...input })
      return Promise.resolve()
    },
    recordRejected: (input) => {
      rejected.push({ ...input })
      return Promise.resolve()
    },
    rejected,
    rescheduleStatusCheck: (input) => {
      rescheduled.push({ ...input })
      return Promise.resolve()
    },
    rescheduled,
  }
}

type LogCall = {
  readonly event: string
  readonly metadata: Record<string, unknown>
}

function createLogger(): WorkerLogger & { readonly calls: LogCall[] } {
  const calls: LogCall[] = []
  const record = (event: string, metadata?: Record<string, unknown>): void => {
    calls.push({ event, metadata: metadata ?? {} })
  }
  return {
    calls,
    error: record,
    info: record,
    warn: record,
  }
}

function createNotifier() {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    notifyRejection: (input: Record<string, unknown>) => {
      calls.push({ ...input })
      return Promise.resolve()
    },
  }
}

function buildUseCase(script: StatusScript, options: { readonly notify?: boolean } = {}) {
  const documentStorage = createDocumentStorage()
  const logger = createLogger()
  const notifier = createNotifier()
  const status = createStatusPort(script)
  const writeBack = createWriteBack()
  const useCase = createReconcileInvoiceUseCase({
    documentStorage,
    logger,
    status,
    writeBack,
    ...(options.notify === true ? { notifier } : {}),
  })
  return { documentStorage, logger, notifier, status, useCase, writeBack }
}

describe('NFS-e reconciliation: authorized', () => {
  test('archives XML and PDF and settles the invoice as authorized', async () => {
    const fixture = buildUseCase({
      status: { document: AUTHORIZED_DOCUMENT, status: 'authorized' },
    })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ outcome: 'authorized' })
    expect(fixture.status.documentCalls).toEqual(['xml', 'pdf'])
    expect(fixture.documentStorage.stored).toEqual([
      { companyId: COMPANY_ID, kind: 'xml' },
      { companyId: COMPANY_ID, kind: 'pdf' },
    ])
    expect(fixture.writeBack.authorized).toEqual([
      {
        attemptId: ATTEMPT_ID,
        authorizedAt: new Date('2026-08-12T11:45:00.000Z'),
        companyId: COMPANY_ID,
        fiscalEnvironment: 'homologation',
        fiscalNumber: '4321',
        invoiceId: INVOICE_ID,
        occurredAt: NOW,
        pdf: {
          bucket: 'transportada-local',
          key: `tenants/${COMPANY_ID}/nfse-documents/${PROVIDER_DOCUMENT_ID}/nota.pdf`,
          objectId: '00000000-0000-4000-8000-000000000002',
          sha256: 'sha-pdf',
          sizeBytes: PDF_BYTES.byteLength,
        },
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        verificationCode: 'VER-0001',
        xml: {
          bucket: 'transportada-local',
          key: `tenants/${COMPANY_ID}/nfse-documents/${PROVIDER_DOCUMENT_ID}/authorized.xml`,
          objectId: '00000000-0000-4000-8000-000000000001',
          sha256: 'sha-xml',
          sizeBytes: XML_BYTES.byteLength,
        },
      },
    ])
    expect(fixture.writeBack.rescheduled).toEqual([])
  })

  /**
   * O PDF é conveniência para o cliente; o XML é o documento fiscal. Sem PDF a nota é autorizada
   * mesmo assim — é por isso que as colunas de PDF são nulas em par no schema.
   */
  test('authorizes without the PDF when the city fails to serve it', async () => {
    const fixture = buildUseCase({
      documents: { pdf: { cause: 'unexpected_status', status: 'error' } },
      status: { document: AUTHORIZED_DOCUMENT, status: 'authorized' },
    })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ outcome: 'authorized' })
    expect(fixture.documentStorage.stored).toEqual([{ companyId: COMPANY_ID, kind: 'xml' }])
    expect(fixture.writeBack.authorized).toHaveLength(1)
    expect(fixture.writeBack.authorized[0]?.['pdf']).toBeUndefined()
    expect(fixture.logger.calls.map((call) => call.event)).toContain(
      'nfse_status_pull_pdf_unavailable',
    )
  })

  /** Sem o XML não há documento fiscal para arquivar: a nota não liquida, ela volta para a fila. */
  test('defers without settling when the XML cannot be downloaded', async () => {
    const fixture = buildUseCase({
      documents: { xml: { cause: 'timeout', status: 'error' } },
      status: { document: AUTHORIZED_DOCUMENT, status: 'authorized' },
    })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ cause: 'timeout', outcome: 'deferred' })
    expect(fixture.documentStorage.stored).toEqual([])
    expect(fixture.writeBack.authorized).toEqual([])
    expect(fixture.writeBack.rescheduled).toEqual([
      {
        companyId: COMPANY_ID,
        invoiceId: INVOICE_ID,
        nextStatusCheckAt: new Date(NOW.getTime() + NFSE_DEFERRED_RECHECK_MINUTES * 60_000),
      },
    ])
  })

  test('defers an authorization whose timestamp cannot be read as an instant', async () => {
    const fixture = buildUseCase({
      status: {
        document: { ...AUTHORIZED_DOCUMENT, authorizedAt: 'ontem de manha' },
        status: 'authorized',
      },
    })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ cause: 'malformed_response', outcome: 'deferred' })
    expect(fixture.writeBack.authorized).toEqual([])
    expect(fixture.documentStorage.stored).toEqual([])
  })
})

describe('NFS-e reconciliation: rejected', () => {
  test('records the city code and message on the invoice', async () => {
    const fixture = buildUseCase({
      status: { rejection: { code: 'E320', message: REJECTION_MESSAGE }, status: 'rejected' },
    })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ outcome: 'rejected' })
    expect(fixture.writeBack.rejected).toEqual([
      {
        attemptId: ATTEMPT_ID,
        companyId: COMPANY_ID,
        errorCode: 'E320',
        errorMessage: REJECTION_MESSAGE,
        invoiceId: INVOICE_ID,
        occurredAt: NOW,
      },
    ])
    expect(fixture.status.documentCalls).toEqual([])
  })

  /**
   * O notificador é opcional de propósito, e continua sem consumidor: nada em `main.ts` o injeta
   * enquanto `notification.schedules.run` não se mudar para cá. O que este teste guarda é a porta —
   * quem a ligar não precisa descobrir na produção que o aviso nasce **depois** da gravação.
   */
  test('avisa o dono da nota depois de gravar a rejeição', async () => {
    const fixture = buildUseCase(
      { status: { rejection: { code: 'E320', message: REJECTION_MESSAGE }, status: 'rejected' } },
      { notify: true },
    )

    await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(fixture.notifier.calls).toEqual([
      {
        attemptId: ATTEMPT_ID,
        companyId: COMPANY_ID,
        invoiceId: INVOICE_ID,
        rejectionMessage: REJECTION_MESSAGE,
      },
    ])
  })

  /** É como a rotina roda hoje: sem notificador configurado, a reconciliação segue igual. */
  test('sem notificador configurado a rejeição continua sendo gravada', async () => {
    const fixture = buildUseCase({
      status: { rejection: { code: 'E320', message: REJECTION_MESSAGE }, status: 'rejected' },
    })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ outcome: 'rejected' })
    expect(fixture.writeBack.rejected).toHaveLength(1)
  })

  test('never carries the city message or the taker into a log line', async () => {
    const fixture = buildUseCase({
      status: { rejection: { code: 'E320', message: REJECTION_MESSAGE }, status: 'rejected' },
    })

    await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    const logged = JSON.stringify(fixture.logger.calls)
    expect(logged).not.toContain(TAKER_LEGAL_NAME)
    expect(logged).not.toContain(REJECTION_MESSAGE)
    for (const call of fixture.logger.calls) {
      expect(Object.keys(call.metadata).sort()).toEqual(['companyId', 'errorCode', 'invoiceId'])
    }
  })
})

describe('NFS-e reconciliation: cancellation', () => {
  test('confirms the cancellation the city acknowledged', async () => {
    const fixture = buildUseCase({
      status: { cancelledAt: '2026-08-12T11:50:00.000Z', status: 'cancelled' },
    })

    const result = await fixture.useCase.execute({
      invoice: dueInvoice({ status: 'cancellation_requested' }),
      now: NOW,
    })

    expect(result).toEqual({ outcome: 'cancelled' })
    expect(fixture.writeBack.cancelled).toEqual([
      {
        attemptId: ATTEMPT_ID,
        cancelledAt: new Date('2026-08-12T11:50:00.000Z'),
        companyId: COMPANY_ID,
        invoiceId: INVOICE_ID,
        occurredAt: NOW,
      },
    ])
  })

  test('falls back to the cycle instant when the city sends no cancellation timestamp', async () => {
    const fixture = buildUseCase({ status: { status: 'cancelled' } })

    await fixture.useCase.execute({
      invoice: dueInvoice({ status: 'cancellation_requested' }),
      now: NOW,
    })

    expect(fixture.writeBack.cancelled[0]?.['cancelledAt']).toEqual(NOW)
  })
})

describe('NFS-e reconciliation: still pending', () => {
  test('reschedules the next check without touching the invoice status', async () => {
    const fixture = buildUseCase({ status: { status: 'pending' } })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ outcome: 'rescheduled' })
    expect(fixture.writeBack.rescheduled).toEqual([
      {
        companyId: COMPANY_ID,
        invoiceId: INVOICE_ID,
        nextStatusCheckAt: new Date(NOW.getTime() + NFSE_PENDING_RECHECK_MINUTES * 60_000),
      },
    ])
    expect(fixture.writeBack.authorized).toEqual([])
    expect(fixture.writeBack.rejected).toEqual([])
    expect(fixture.writeBack.cancelled).toEqual([])
  })

  test('backs off further when the failure is transport, not the city', async () => {
    const fixture = buildUseCase({ status: { cause: 'transport_failure', status: 'error' } })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ cause: 'transport_failure', outcome: 'deferred' })
    expect(fixture.writeBack.rescheduled[0]?.['nextStatusCheckAt']).toEqual(
      new Date(NOW.getTime() + NFSE_DEFERRED_RECHECK_MINUTES * 60_000),
    )
  })

  test('defers without settling when the provider is not configured', async () => {
    const fixture = buildUseCase({ status: { cause: 'provider_not_configured', status: 'error' } })

    const result = await fixture.useCase.execute({ invoice: dueInvoice(), now: NOW })

    expect(result).toEqual({ cause: 'provider_not_configured', outcome: 'deferred' })
    expect(fixture.writeBack.authorized).toEqual([])
    expect(fixture.writeBack.rejected).toEqual([])
  })
})
