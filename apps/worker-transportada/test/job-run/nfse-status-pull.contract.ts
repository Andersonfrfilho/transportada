/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A reconciliação de NFS-e vista como rotina do relógio. Aqui se guarda o **ciclo**: quantas notas
 * liquidaram, com que código a linha fecha quando nenhuma liquidou, e o que ele deixa de fazer
 * quando pedem para parar.
 *
 * Duas coisas desta rotina não existem na de distribuição, e são o motivo deste arquivo:
 *
 * 1. O vocabulário do catálogo (`provider_unreachable` · `malformed_response` ·
 *    `credential_missing` · `document_unavailable`) tem **quatro** palavras, e a causa interna do
 *    adiamento tem **sete**. A tradução é a parte da rotina que mais pode mentir ao operador, e é o
 *    que a tabela abaixo prende.
 * 2. Ao contrário de `nfe.distribution.pull`, o catálogo desta rotina **não lista as razões de
 *    inelegibilidade** — elas contam no cartão, mas não fecham a linha. Ciclo sem nota devida é
 *    `succeeded`, e é isso que impede a linha de fechar com um código que `isJobOutcome` recusaria.
 */
import { describe, expect, test } from 'bun:test'

import type {
  ClaimedJobExecution,
  FinishJobExecutionParams,
  JobExecutionPort,
} from '../../src/job-run/application/job-execution.port.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { runJobCycle } from '../../src/job-run/application/run-job-cycle.js'
import type { JobRunEnvelopeV1 } from '../../src/messaging/job-run-envelope.schema.js'
import { createNfseStatusPullRoutine } from '../../src/nfse-status-pull/application/nfse-status-pull.routine.js'
import type { ReconcileInvoiceResult } from '../../src/nfse-status-pull/application/reconcile-invoice.use-case.js'
import type {
  DueNfseInvoice,
  SelectDueInvoicesUseCase,
} from '../../src/nfse-status-pull/application/select-due-invoices.use-case.js'
import { createEmptyNfseIneligibleCounts } from '../../src/nfse-status-pull/application/select-due-invoices.use-case.js'
import { NFSE_RECONCILIATION_INELIGIBILITY_REASONS } from '../../src/nfse-status-pull/domain/nfse-reconciliation-eligibility.policy.js'
import {
  NFSE_STATUS_FAILURE_CAUSES,
  type NfseStatusFailureCause,
} from '../../src/nfse-status-pull/domain/nfse-reconciliation-outcome.policy.js'
import {
  NFSE_STATUS_PULL_FAILURE_OUTCOMES,
  toNfseStatusPullFailureOutcome,
  type NfseStatusPullFailureOutcome,
} from '../../src/nfse-status-pull/domain/nfse-status-pull-failure.policy.js'
import { NFSE_STATUS_PULL_JOB } from '../../src/nfse-status-pull/domain/nfse-status-pull.constant.js'
import { isJobOutcome, JOB_FAILURE_OUTCOMES } from '../../src/shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../src/shared/worker.types.js'

import { createLoggerDouble, createManualScheduler, type LoggedMessage } from './job-run.double.js'

const NOW = new Date('2026-08-24T09:00:00.000Z')
const EXECUTION_ID = '9f0a1b2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c'
const CORRELATION_ID = 'tick-2026-08-24T09:00:00.000Z'
const FIRST_COMPANY_ID = '4c3e6d1a-8b2f-4d5e-9a7c-1b2c3d4e5f60'
const SECOND_COMPANY_ID = '5d4f7e2b-9c3a-4e6f-8b8d-2c3d4e5f6071'
const PAGE_SIZE = 50

function dueInvoice(overrides: Partial<DueNfseInvoice> = {}): DueNfseInvoice {
  return {
    attemptId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    companyId: FIRST_COMPANY_ID,
    credential: {
      companyId: FIRST_COMPANY_ID,
      credentialId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
      envelope: { ciphertext: 'sealed' },
      fiscalEnvironment: 'production',
      municipalRegistration: '123456',
    },
    invoiceId: 'f1e2d3c4-b5a6-4978-8b6c-5d4e3f2a1b09',
    providerDocumentId: '5254907',
    status: 'pending_authorization',
    ...overrides,
  }
}

type FixtureParams = {
  readonly due?: readonly DueNfseInvoice[]
  readonly ineligible?: Partial<Record<string, number>>
  readonly reconcile?: (invoice: DueNfseInvoice) => Promise<ReconcileInvoiceResult>
  readonly stopAfter?: number
}

type RoutineFixture = {
  readonly logged: LoggedMessage[]
  readonly reconciled: DueNfseInvoice[]
  readonly run: () => Promise<{
    readonly counters: Readonly<Record<string, number>>
    readonly outcome: string
  }>
  readonly selections: { readonly environment: string; readonly limit: number }[]
}

function createFixture({
  due = [dueInvoice()],
  ineligible = {},
  reconcile,
  stopAfter,
}: FixtureParams = {}): RoutineFixture {
  const logged: LoggedMessage[] = []
  const reconciled: DueNfseInvoice[] = []
  const selections: { readonly environment: string; readonly limit: number }[] = []

  const ineligibleCounts = createEmptyNfseIneligibleCounts()
  for (const reason of NFSE_RECONCILIATION_INELIGIBILITY_REASONS) {
    ineligibleCounts[reason] = ineligible[reason] ?? 0
  }

  const selectDue: SelectDueInvoicesUseCase = {
    execute: async (input) => {
      selections.push({ environment: input.environment, limit: input.limit })
      return { due, ineligibleCounts }
    },
  }

  const routine = createNfseStatusPullRoutine({
    fiscalEnvironment: 'production',
    logger: createLoggerDouble(logged),
    now: () => NOW,
    pageSize: PAGE_SIZE,
    reconcile: {
      execute: async ({ invoice }) => {
        reconciled.push(invoice)
        return reconcile === undefined ? { outcome: 'authorized' } : reconcile(invoice)
      },
    },
    selectDue,
  })

  const context: JobRoutineContext = {
    correlationId: CORRELATION_ID,
    executionId: EXECUTION_ID,
    isStopRequested: () => stopAfter !== undefined && reconciled.length >= stopAfter,
    job: NFSE_STATUS_PULL_JOB,
    origin: 'schedule',
  }

  return { logged, reconciled, run: () => routine.run(context), selections }
}

describe('nfse status pull failure vocabulary', () => {
  test('toda causa interna cai numa palavra do catálogo desta rotina', () => {
    const allowed: readonly string[] = JOB_FAILURE_OUTCOMES[NFSE_STATUS_PULL_JOB]

    for (const cause of NFSE_STATUS_FAILURE_CAUSES) {
      const outcome = toNfseStatusPullFailureOutcome(cause)
      expect(allowed).toContain(outcome)
      expect(isJobOutcome({ job: NFSE_STATUS_PULL_JOB, outcome })).toBe(true)
    }
  })

  test('a tradução das sete causas é esta, e não a semelhança dos nomes', () => {
    const expected: Record<NfseStatusFailureCause, NfseStatusPullFailureOutcome> = {
      // Envelope que não abre é credencial que o operador tem de selar de novo — não é rede.
      credential_unreadable: 'credential_missing',
      malformed_response: 'malformed_response',
      // A prefeitura não conhece o documento: nada para arquivar, e nada que esperar resolva.
      not_found: 'document_unavailable',
      // As quatro do provedor inalcançável, inclusive endereço não configurado: ninguém atendeu.
      provider_not_configured: 'provider_unreachable',
      timeout: 'provider_unreachable',
      transport_failure: 'provider_unreachable',
      unexpected_status: 'provider_unreachable',
    }

    for (const cause of NFSE_STATUS_FAILURE_CAUSES) {
      expect(toNfseStatusPullFailureOutcome(cause)).toBe(expected[cause])
    }
  })

  test('a ordem de desempate põe o que o operador resolve antes do que o tempo resolve', () => {
    expect(NFSE_STATUS_PULL_FAILURE_OUTCOMES).toEqual([
      'credential_missing',
      'malformed_response',
      'document_unavailable',
      'provider_unreachable',
    ])
  })

  test('razão de inelegibilidade e código de falha não colidem no mesmo cartão', () => {
    // `missing_credential` e `credential_missing` estão a uma troca de ordem de distância, e as
    // duas famílias dividem o mesmo objeto de contadores.
    const failures: readonly string[] = NFSE_STATUS_PULL_FAILURE_OUTCOMES
    for (const reason of NFSE_RECONCILIATION_INELIGIBILITY_REASONS) {
      expect(failures).not.toContain(reason)
    }
  })
})

describe('nfse status pull routine', () => {
  test('nota liquidada fecha o ciclo, e o contador diz quantas', async () => {
    const fixture = createFixture({
      due: [dueInvoice(), dueInvoice({ companyId: SECOND_COMPANY_ID })],
      reconcile: async (invoice) =>
        invoice.companyId === FIRST_COMPANY_ID
          ? { outcome: 'authorized' }
          : { outcome: 'rejected' },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ eligible: 2, failed: 0, settled: 2, skipped: 0 })
  })

  test('nota reagendada é pulo, não falha: a prefeitura ainda não respondeu', async () => {
    const fixture = createFixture({ reconcile: async () => ({ outcome: 'rescheduled' }) })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ eligible: 1, failed: 0, settled: 0, skipped: 1 })
  })

  test('ciclo inteiro adiado fecha na causa traduzida, e o contador a nomeia', async () => {
    const fixture = createFixture({
      reconcile: async () => ({ cause: 'timeout', outcome: 'deferred' }),
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('provider_unreachable')
    expect(result.counters).toEqual({
      eligible: 1,
      failed: 0,
      provider_unreachable: 1,
      settled: 0,
      skipped: 1,
    })
  })

  test('duas causas no mesmo ciclo: fecha na que o operador resolve', async () => {
    const fixture = createFixture({
      due: [dueInvoice(), dueInvoice({ companyId: SECOND_COMPANY_ID })],
      reconcile: async (invoice) =>
        invoice.companyId === FIRST_COMPANY_ID
          ? { cause: 'transport_failure', outcome: 'deferred' }
          : { cause: 'credential_unreadable', outcome: 'deferred' },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('credential_missing')
    expect(result.counters).toEqual({
      credential_missing: 1,
      eligible: 2,
      failed: 0,
      provider_unreachable: 1,
      settled: 0,
      skipped: 2,
    })
  })

  test('nota liquidada vence nota adiada: o ciclo fez trabalho', async () => {
    const fixture = createFixture({
      due: [dueInvoice(), dueInvoice({ companyId: SECOND_COMPANY_ID })],
      reconcile: async (invoice) =>
        invoice.companyId === FIRST_COMPANY_ID
          ? { outcome: 'authorized' }
          : { cause: 'timeout', outcome: 'deferred' },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ provider_unreachable: 1, settled: 1, skipped: 1 })
  })

  test('ciclo sem nota devida é `succeeded`, e a razão fica no contador', async () => {
    const fixture = createFixture({ due: [], ineligible: { not_due: 3, missing_credential: 1 } })

    const result = await fixture.run()

    /**
     * Aqui a rotina divergiu de `nfe.distribution.pull` de propósito: o catálogo desta não lista as
     * razões de inelegibilidade, e fechar em `missing_credential` gravaria na linha um código que
     * `isJobOutcome` recusa — falha invisível, que é o que a spec 052 veio consertar.
     */
    expect(result.outcome).toBe('succeeded')
    expect(isJobOutcome({ job: NFSE_STATUS_PULL_JOB, outcome: result.outcome })).toBe(true)
    expect(result.counters).toEqual({
      eligible: 0,
      failed: 0,
      missing_credential: 1,
      not_due: 3,
      settled: 0,
      skipped: 0,
    })
  })

  test('falha de gravação fecha em `unexpected_error` e o log leva só identificador opaco', async () => {
    const fixture = createFixture({
      reconcile: async () => {
        throw new TypeError('connection terminated')
      },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters).toMatchObject({ failed: 1, settled: 0 })

    const failure = fixture.logged.find(
      (entry) => entry.message === 'nfse_status_pull_invoice_reconcile_failed',
    )
    expect(failure?.metadata).toEqual({
      companyId: FIRST_COMPANY_ID,
      correlationId: CORRELATION_ID,
      invoiceId: dueInvoice().invoiceId,
      reason: 'TypeError',
    })
  })

  test('uma nota que falha não impede as outras, e o ciclo continua falho', async () => {
    const fixture = createFixture({
      due: [dueInvoice(), dueInvoice({ companyId: SECOND_COMPANY_ID })],
      reconcile: async (invoice) => {
        if (invoice.companyId === FIRST_COMPANY_ID) throw new Error('boom')
        return { outcome: 'authorized' }
      },
    })

    const result = await fixture.run()

    expect(result.outcome).toBe('unexpected_error')
    expect(result.counters).toMatchObject({ eligible: 2, failed: 1, settled: 1 })
    expect(fixture.reconciled).toHaveLength(2)
  })

  test('parada pedida entre duas notas guarda o que a primeira liquidou', async () => {
    const fixture = createFixture({
      due: [dueInvoice(), dueInvoice({ companyId: SECOND_COMPANY_ID })],
      stopAfter: 1,
    })

    const result = await fixture.run()

    // `succeeded` de propósito: quem traduz parada em `cancelled` é o invólucro, e só de cima disto.
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ eligible: 2, settled: 1 })
    expect(fixture.reconciled).toHaveLength(1)
    expect(fixture.reconciled[0]?.companyId).toBe(FIRST_COMPANY_ID)
  })

  test('parada pedida antes da primeira nota não reconcilia nada', async () => {
    const fixture = createFixture({ stopAfter: 0 })

    const result = await fixture.run()

    expect(result.outcome).toBe('succeeded')
    expect(fixture.reconciled).toHaveLength(0)
  })

  test('nota adiada antes da parada continua fechando em `succeeded`', async () => {
    const fixture = createFixture({
      due: [dueInvoice(), dueInvoice({ companyId: SECOND_COMPANY_ID })],
      reconcile: async () => ({ cause: 'timeout', outcome: 'deferred' }),
      stopAfter: 1,
    })

    const result = await fixture.run()

    // Parada pedida vem antes da causa: o ciclo não terminou, e o código dele seria uma conclusão.
    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toMatchObject({ provider_unreachable: 1, skipped: 1 })
  })

  test('o ambiente fiscal da rotina é o que chega na seleção, e o recorte é a página dela', async () => {
    const fixture = createFixture()

    await fixture.run()

    // Ambiente errado aqui reconciliaria nota de produção com credencial de homologação.
    expect(fixture.selections).toEqual([{ environment: 'production', limit: PAGE_SIZE }])
  })
})

describe('nfse status pull registration', () => {
  test('a rotina registrada fecha a linha com o código dela, não com `job_run_routine_missing`', async () => {
    const finishes: FinishJobExecutionParams[] = []
    const logged: LoggedMessage[] = []
    const claimed: ClaimedJobExecution = { job: NFSE_STATUS_PULL_JOB, origin: 'schedule' }

    const executions: JobExecutionPort = {
      claim: async () => claimed,
      finish: async (params) => {
        finishes.push(params)
      },
      renew: async () => ({ cancelRequestedAt: undefined }),
    }

    const envelope: JobRunEnvelopeV1 = {
      correlationId: CORRELATION_ID,
      eventId: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
      occurredAt: '2026-08-24T09:00:00.000Z',
      payload: { executionId: EXECUTION_ID, job: NFSE_STATUS_PULL_JOB, origin: 'schedule' },
      type: 'transportada.job.run.requested',
      version: 1,
    }

    const logger: WorkerLogger = createLoggerDouble(logged)

    const result = await runJobCycle({
      dependencies: {
        executions,
        logger,
        now: () => NOW,
        routines: {
          [NFSE_STATUS_PULL_JOB]: createNfseStatusPullRoutine({
            fiscalEnvironment: 'production',
            logger,
            now: () => NOW,
            pageSize: PAGE_SIZE,
            reconcile: { execute: async () => ({ outcome: 'authorized' }) },
            selectDue: {
              execute: async () => ({
                due: [dueInvoice()],
                ineligibleCounts: createEmptyNfseIneligibleCounts(),
              }),
            },
          }),
        },
        scheduleInterval: createManualScheduler().scheduler,
      },
      envelope,
    })

    expect(result).toEqual({ claimed: true, outcome: 'succeeded' })
    expect(finishes).toEqual([
      {
        counters: { eligible: 1, failed: 0, settled: 1, skipped: 0 },
        executionId: EXECUTION_ID,
        finishedAt: NOW,
        outcome: 'succeeded',
      },
    ])
    expect(logged.map((entry) => entry.message)).not.toContain('job_run_routine_missing')
  })
})
