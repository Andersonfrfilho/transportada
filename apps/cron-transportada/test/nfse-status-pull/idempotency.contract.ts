/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { CronLogger } from '../../src/config/cron.types.js'
import type { AdvisoryLockPort } from '../../src/nfe-distribution-pull/application/advisory-lock.port.js'
import type {
  NfseDocumentStoragePort,
  NfseStoredDocument,
} from '../../src/nfse-status-pull/application/nfse-document-storage.port.js'
import type { NfseStatusPort } from '../../src/nfse-status-pull/application/nfse-fiscal-status.port.js'
import type { NfseReconciliationWriteBackPort } from '../../src/nfse-status-pull/application/nfse-reconciliation-write-back.port.js'
import { createReconcileInvoiceUseCase } from '../../src/nfse-status-pull/application/reconcile-invoice.use-case.js'
import { runNfseStatusPullCycle } from '../../src/nfse-status-pull/application/run-cycle.js'
import type {
  NfseReconciliationCandidate,
  NfseReconciliationCandidateSourcePort,
} from '../../src/nfse-status-pull/application/select-due-invoices.port.js'
import { createSelectDueInvoicesUseCase } from '../../src/nfse-status-pull/application/select-due-invoices.use-case.js'
import type { NfseProviderStatusFacts } from '../../src/nfse-status-pull/domain/nfse-reconciliation-outcome.policy.js'
import { NFSE_STATUS_PULL_JOB } from '../../src/nfse-status-pull/domain/nfse-status-pull.constant.js'

const NOW = new Date('2026-08-12T12:00:00.000Z')
const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000a1'
const CREDENTIAL_ID = '00000000-0000-4000-8000-0000000000e1'
const PAGE_SIZE = 50

const AUTHORIZED: NfseProviderStatusFacts = {
  document: {
    authorizedAt: '2026-08-12T11:45:00.000Z',
    fiscalNumber: '4321',
    providerDocumentId: '900123456',
    verificationCode: 'VER-0001',
  },
  status: 'authorized',
}

const SILENT_LOGGER: CronLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

type InvoiceRow = {
  nextStatusCheckAt: Date | undefined
  readonly invoiceId: string
  readonly providerDocumentId: string
  status: NfseReconciliationCandidate['status']
}

/**
 * Banco de mentira com a única regra que interessa aqui: quem liquidou sai do recorte de pendentes.
 * É o que sustenta a idempotência — o segundo ciclo não reencontra a nota, e nada é arquivado duas
 * vezes, nem quando a mesma janela do CronJob roda de novo.
 */
function createInvoiceStore(rows: readonly InvoiceRow[]): {
  readonly rows: InvoiceRow[]
  readonly source: NfseReconciliationCandidateSourcePort
  readonly writeBack: NfseReconciliationWriteBackPort
} {
  const store = rows.map((row) => ({ ...row }))
  const find = (invoiceId: string): InvoiceRow | undefined =>
    store.find((row) => row.invoiceId === invoiceId)

  return {
    rows: store,
    source: {
      listCandidates: () =>
        Promise.resolve(
          store.map((row) => ({
            attemptId: ATTEMPT_ID,
            companyId: COMPANY_ID,
            credential: {
              credentialId: CREDENTIAL_ID,
              envelope: { sealed: true },
              fiscalEnvironment: 'homologation' as const,
              municipalRegistration: '12345678',
              status: 'active' as const,
            },
            invoiceId: row.invoiceId,
            ...(row.nextStatusCheckAt === undefined
              ? {}
              : { nextStatusCheckAt: row.nextStatusCheckAt }),
            providerDocumentId: row.providerDocumentId,
            status: row.status,
          })),
        ),
    },
    writeBack: {
      recordAuthorized: (input) => {
        const row = find(input.invoiceId)
        if (row !== undefined) {
          row.status = 'authorized'
          row.nextStatusCheckAt = undefined
        }
        return Promise.resolve()
      },
      recordCancellationConfirmed: (input) => {
        const row = find(input.invoiceId)
        if (row !== undefined) {
          row.status = 'cancelled'
          row.nextStatusCheckAt = undefined
        }
        return Promise.resolve()
      },
      recordRejected: (input) => {
        const row = find(input.invoiceId)
        if (row !== undefined) {
          row.status = 'rejected'
          row.nextStatusCheckAt = undefined
        }
        return Promise.resolve()
      },
      rescheduleStatusCheck: (input) => {
        const row = find(input.invoiceId)
        if (row !== undefined) row.nextStatusCheckAt = input.nextStatusCheckAt
        return Promise.resolve()
      },
    },
  }
}

function createStatusPort(status: NfseProviderStatusFacts): NfseStatusPort {
  return {
    fetchDocument: ({ kind }) =>
      Promise.resolve({
        bytes: new Uint8Array([kind === 'xml' ? 0x3c : 0x25]),
        contentType: kind === 'xml' ? 'application/xml' : 'application/pdf',
        status: 'ok' as const,
      }),
    fetchStatus: () => Promise.resolve(status),
  }
}

function createDocumentStorage(): NfseDocumentStoragePort & { readonly keys: string[] } {
  const keys: string[] = []
  return {
    keys,
    store: (input) => {
      const key = `tenants/${input.companyId}/nfse-documents/${input.providerDocumentId}/${
        input.kind === 'xml' ? 'authorized.xml' : 'nota.pdf'
      }`
      keys.push(key)
      const document: NfseStoredDocument = {
        bucket: 'transportada-local',
        key,
        objectId: `00000000-0000-4000-8000-0000000${String(keys.length).padStart(5, '0')}`,
        sha256: `sha-${keys.length}`,
        sizeBytes: input.bytes.byteLength,
      }
      return Promise.resolve(document)
    },
  }
}

function createSharedLock(): AdvisoryLockPort & { readonly acquiredKeys: string[] } {
  const acquiredKeys: string[] = []
  let held = false
  return {
    acquiredKeys,
    release: () => {
      held = false
      return Promise.resolve()
    },
    tryAcquire: ({ lockKey }: { readonly lockKey: string }) => {
      if (held) return Promise.resolve(false)
      held = true
      acquiredKeys.push(lockKey)
      return Promise.resolve(true)
    },
  }
}

function buildCycleDependencies(input: {
  readonly documentStorage: NfseDocumentStoragePort
  readonly lock: AdvisoryLockPort
  readonly source: NfseReconciliationCandidateSourcePort
  readonly status: NfseStatusPort
  readonly writeBack: NfseReconciliationWriteBackPort
}) {
  return {
    correlationId: 'cron-trace-nfse',
    environment: 'homologation' as const,
    jobId: NFSE_STATUS_PULL_JOB,
    lock: input.lock,
    logger: SILENT_LOGGER,
    now: NOW,
    pageSize: PAGE_SIZE,
    reconcileUseCase: createReconcileInvoiceUseCase({
      documentStorage: input.documentStorage,
      logger: SILENT_LOGGER,
      status: input.status,
      writeBack: input.writeBack,
    }),
    selectDueUseCase: createSelectDueInvoicesUseCase({
      logger: SILENT_LOGGER,
      source: input.source,
    }),
  }
}

function pendingRow(invoiceId: string, providerDocumentId: string): InvoiceRow {
  return {
    invoiceId,
    nextStatusCheckAt: new Date(NOW.getTime() - 60_000),
    providerDocumentId,
    status: 'pending_authorization',
  }
}

describe('NFS-e status pull cycle idempotency', () => {
  test('archives the document once even when the same window runs twice', async () => {
    const store = createInvoiceStore([
      pendingRow('00000000-0000-4000-8000-0000000000f1', '900123456'),
    ])
    const documentStorage = createDocumentStorage()
    const lock = createSharedLock()
    const dependencies = buildCycleDependencies({
      documentStorage,
      lock,
      source: store.source,
      status: createStatusPort(AUTHORIZED),
      writeBack: store.writeBack,
    })

    const first = await runNfseStatusPullCycle(dependencies)
    const second = await runNfseStatusPullCycle(dependencies)

    expect(first).toMatchObject({
      acquiredLock: true,
      eligibleCount: 1,
      enqueuedCount: 1,
      failedCount: 0,
      skippedCount: 0,
    })
    expect(second).toMatchObject({
      acquiredLock: true,
      eligibleCount: 0,
      enqueuedCount: 0,
      failedCount: 0,
    })
    expect(second.ineligibleCounts['not_pending']).toBe(1)
    expect(documentStorage.keys).toEqual([
      `tenants/${COMPANY_ID}/nfse-documents/900123456/authorized.xml`,
      `tenants/${COMPANY_ID}/nfse-documents/900123456/nota.pdf`,
    ])
    expect(store.rows[0]?.status).toBe('authorized')
  })

  test('counts a still-processing invoice as rescheduled, not settled', async () => {
    const store = createInvoiceStore([
      pendingRow('00000000-0000-4000-8000-0000000000f1', '900123456'),
    ])
    const documentStorage = createDocumentStorage()

    const result = await runNfseStatusPullCycle(
      buildCycleDependencies({
        documentStorage,
        lock: createSharedLock(),
        source: store.source,
        status: createStatusPort({ status: 'pending' }),
        writeBack: store.writeBack,
      }),
    )

    expect(result).toMatchObject({ eligibleCount: 1, enqueuedCount: 0, skippedCount: 1 })
    expect(documentStorage.keys).toEqual([])
    expect(store.rows[0]?.status).toBe('pending_authorization')
    expect(store.rows[0]?.nextStatusCheckAt?.getTime()).toBeGreaterThan(NOW.getTime())
  })

  test('isolates a per-invoice failure so one bad note never aborts the cycle', async () => {
    const store = createInvoiceStore([
      pendingRow('00000000-0000-4000-8000-0000000000f1', '900123456'),
      pendingRow('00000000-0000-4000-8000-0000000000f2', '900123457'),
    ])
    const failingStorage: NfseDocumentStoragePort = {
      store: (input) =>
        input.providerDocumentId === '900123457'
          ? Promise.reject(new Error('bucket unreachable'))
          : Promise.resolve({
              bucket: 'transportada-local',
              key: 'k',
              objectId: '00000000-0000-4000-8000-000000000001',
              sha256: 'sha',
              sizeBytes: input.bytes.byteLength,
            }),
    }

    const result = await runNfseStatusPullCycle(
      buildCycleDependencies({
        documentStorage: failingStorage,
        lock: createSharedLock(),
        source: store.source,
        status: createStatusPort(AUTHORIZED),
        writeBack: store.writeBack,
      }),
    )

    expect(result).toMatchObject({ eligibleCount: 2, enqueuedCount: 1, failedCount: 1 })
    expect(store.rows[0]?.status).toBe('authorized')
    expect(store.rows[1]?.status).toBe('pending_authorization')
  })
})

describe('NFS-e status pull cycle concurrency', () => {
  test('only one of two concurrent cycles acquires the advisory lock', async () => {
    const store = createInvoiceStore([
      pendingRow('00000000-0000-4000-8000-0000000000f1', '900123456'),
    ])
    const lock = createSharedLock()
    const documentStorage = createDocumentStorage()
    const dependencies = () =>
      buildCycleDependencies({
        documentStorage,
        lock,
        source: store.source,
        status: createStatusPort(AUTHORIZED),
        writeBack: store.writeBack,
      })

    const [first, second] = await Promise.all([
      runNfseStatusPullCycle(dependencies()),
      runNfseStatusPullCycle(dependencies()),
    ])

    const acquired = [first, second].filter((cycle) => cycle.acquiredLock)
    const rejected = [first, second].filter((cycle) => !cycle.acquiredLock)
    expect(acquired).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.eligibleCount).toBe(0)
    expect(rejected[0]?.enqueuedCount).toBe(0)
    expect(lock.acquiredKeys).toEqual([`cron:${NFSE_STATUS_PULL_JOB}`])
    expect(documentStorage.keys).toHaveLength(2)
  })
})
