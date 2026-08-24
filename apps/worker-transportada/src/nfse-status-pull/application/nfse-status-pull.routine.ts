/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseFiscalEnvironment } from '../../database/nfse-issuance-execution.schema.js'
import type {
  JobRoutine,
  JobRoutineContext,
  JobRoutineResult,
} from '../../job-run/application/job-routine.port.js'
import { safeLogError, safeLogInfo } from '../../logging/safe-logger.service.js'
import type { JobOutcome } from '../../shared/job-catalog.constant.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { NFSE_RECONCILIATION_INELIGIBILITY_REASONS } from '../domain/nfse-reconciliation-eligibility.policy.js'
import {
  NFSE_STATUS_PULL_FAILURE_OUTCOMES,
  toNfseStatusPullFailureOutcome,
  type NfseStatusPullFailureOutcome,
} from '../domain/nfse-status-pull-failure.policy.js'

import type { ReconcileInvoiceUseCase } from './reconcile-invoice.use-case.js'
import type {
  DueNfseInvoice,
  NfseReconciliationIneligibleCounts,
  SelectDueInvoicesUseCase,
} from './select-due-invoices.use-case.js'

const COMPLETED_OUTCOME: JobOutcome = 'succeeded'

const UNEXPECTED_OUTCOME: JobOutcome = 'unexpected_error'

export type NfseStatusPullRoutineDependencies = {
  /** O ambiente da instalação: reconciliar produção com credencial de homologação é nota perdida. */
  readonly fiscalEnvironment: NfseFiscalEnvironment
  readonly logger: WorkerLogger
  readonly now: () => Date
  readonly pageSize: number
  readonly reconcile: ReconcileInvoiceUseCase
  readonly selectDue: SelectDueInvoicesUseCase
}

type FailureOutcomeCounts = Record<NfseStatusPullFailureOutcome, number>

type CycleTally = {
  readonly failureOutcomes: FailureOutcomeCounts
  failedCount: number
  settledCount: number
  skippedCount: number
}

/**
 * Ao contrário da distribuição de NF-e, esta rotina **processa** em vez de enfileirar: o consumidor
 * seria ela mesma. Ela consulta a prefeitura nota por nota, arquiva o documento quando ela autoriza e
 * devolve a nota para a fila quando ainda não há resposta.
 *
 * Não há advisory lock aqui, ao contrário do ciclo que o cron rodava: a linha de `job_executions`, a
 * unique de execução aberta e o lease já serializam o ciclo.
 *
 * Duas divergências deliberadas em relação a `nfe.distribution.pull`, e as duas estão no
 * `resolveOutcome`: a causa do adiamento é **traduzida** antes de fechar a linha (sete causas internas
 * contra quatro palavras do catálogo), e razão de inelegibilidade **não fecha a linha** — o catálogo
 * desta rotina não as lista, e gravá-las daria um código que `isJobOutcome` recusa.
 */
export function createNfseStatusPullRoutine(
  dependencies: NfseStatusPullRoutineDependencies,
): JobRoutine {
  return { run: (context) => runCycle({ context, dependencies }) }
}

type RunCycleParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NfseStatusPullRoutineDependencies
}

async function runCycle({ context, dependencies }: RunCycleParams): Promise<JobRoutineResult> {
  const { due, ineligibleCounts } = await dependencies.selectDue.execute({
    environment: dependencies.fiscalEnvironment,
    limit: dependencies.pageSize,
    now: dependencies.now(),
  })

  const tally = await reconcileDueInvoices({ context, dependencies, due })

  safeLogInfo({
    logger: dependencies.logger,
    message: 'nfse_status_pull_cycle_finished',
    metadata: {
      correlationId: context.correlationId,
      dueCount: due.length,
      executionId: context.executionId,
      failedCount: tally.failedCount,
      settledCount: tally.settledCount,
      skippedCount: tally.skippedCount,
    },
  })

  return {
    counters: buildCounters({ dueCount: due.length, ineligibleCounts, tally }),
    outcome: resolveOutcome({ context, tally }),
  }
}

type ReconcileDueInvoicesParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NfseStatusPullRoutineDependencies
  readonly due: readonly DueNfseInvoice[]
}

async function reconcileDueInvoices({
  context,
  dependencies,
  due,
}: ReconcileDueInvoicesParams): Promise<CycleTally> {
  const tally: CycleTally = {
    failedCount: 0,
    failureOutcomes: createEmptyFailureOutcomeCounts(),
    settledCount: 0,
    skippedCount: 0,
  }

  for (const invoice of due) {
    // Lido entre duas notas, nunca no meio de uma: liquidação é escrita, e meia escrita não existe.
    if (context.isStopRequested()) return tally
    await reconcileOne({ context, dependencies, invoice, tally })
  }

  return tally
}

type ReconcileOneParams = {
  readonly context: JobRoutineContext
  readonly dependencies: NfseStatusPullRoutineDependencies
  readonly invoice: DueNfseInvoice
  readonly tally: CycleTally
}

async function reconcileOne({
  context,
  dependencies,
  invoice,
  tally,
}: ReconcileOneParams): Promise<void> {
  try {
    const result = await dependencies.reconcile.execute({ invoice, now: dependencies.now() })

    if (result.outcome === 'deferred') {
      tally.skippedCount += 1
      tally.failureOutcomes[toNfseStatusPullFailureOutcome(result.cause)] += 1
      return
    }

    // Reagendamento é pulo, não falha: a prefeitura ainda não respondeu, e a nota volta na próxima.
    if (result.outcome === 'rescheduled') tally.skippedCount += 1
    else tally.settledCount += 1
  } catch (error: unknown) {
    tally.failedCount += 1
    safeLogError({
      logger: dependencies.logger,
      message: 'nfse_status_pull_invoice_reconcile_failed',
      metadata: {
        companyId: invoice.companyId,
        correlationId: context.correlationId,
        invoiceId: invoice.invoiceId,
        reason: error instanceof Error ? error.name : 'UnknownError',
      },
    })
  }
}

function createEmptyFailureOutcomeCounts(): FailureOutcomeCounts {
  const counts = {} as FailureOutcomeCounts
  for (const outcome of NFSE_STATUS_PULL_FAILURE_OUTCOMES) counts[outcome] = 0
  return counts
}

type BuildCountersParams = {
  readonly dueCount: number
  readonly ineligibleCounts: NfseReconciliationIneligibleCounts
  readonly tally: CycleTally
}

/**
 * As duas famílias dividem o mesmo objeto, e é por isso que nenhuma palavra pode aparecer nas duas
 * listas: `missing_credential` (nota inelegível) e `credential_missing` (código de falha) contam
 * coisas diferentes, e uma colisão as somaria em silêncio.
 */
function buildCounters({
  dueCount,
  ineligibleCounts,
  tally,
}: BuildCountersParams): Readonly<Record<string, number>> {
  const counters: Record<string, number> = {
    eligible: dueCount,
    failed: tally.failedCount,
    settled: tally.settledCount,
    skipped: tally.skippedCount,
  }

  // Zerado fica fora: o cartão do painel mostra o que aconteceu, não a lista de tudo que não.
  for (const reason of NFSE_RECONCILIATION_INELIGIBILITY_REASONS) {
    if (ineligibleCounts[reason] > 0) counters[reason] = ineligibleCounts[reason]
  }

  for (const outcome of NFSE_STATUS_PULL_FAILURE_OUTCOMES) {
    if (tally.failureOutcomes[outcome] > 0) counters[outcome] = tally.failureOutcomes[outcome]
  }

  return counters
}

type ResolveOutcomeParams = {
  readonly context: JobRoutineContext
  readonly tally: CycleTally
}

/**
 * Nota liquidada vence nota adiada: o ciclo fez trabalho, e o contador diz quantas ficaram para trás.
 * O desempate entre causas é a **ordem de declaração** de `NFSE_STATUS_PULL_FAILURE_OUTCOMES` — o que
 * o operador resolve (credencial, documento) antes do que o tempo resolve (provedor fora do ar).
 */
function resolveOutcome({ context, tally }: ResolveOutcomeParams): JobOutcome {
  if (tally.failedCount > 0) return UNEXPECTED_OUTCOME

  // Parada pedida vira `cancelled` no invólucro, e só de cima de um `succeeded`.
  if (context.isStopRequested()) return COMPLETED_OUTCOME

  if (tally.settledCount > 0) return COMPLETED_OUTCOME

  for (const outcome of NFSE_STATUS_PULL_FAILURE_OUTCOMES) {
    if (tally.failureOutcomes[outcome] > 0) return outcome
  }

  return COMPLETED_OUTCOME
}
