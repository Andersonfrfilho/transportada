/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'
import type { z } from 'zod'

import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import { resolveCargoLayoutBudgetMs } from './cargo-layout-budget.policy.js'
import {
  CARGO_LAYOUT_ERROR,
  TIME_BUDGET_UNPLACED_REASON,
  type CargoLayoutErrorCode,
} from './cargo-layout-error.constant.js'
import { CargoLayoutThreadError } from './cargo-layout-thread.error.js'
import { CargoLayoutTimeoutError } from './cargo-layout-timeout.error.js'
import {
  storedCargoLayoutInputSchema,
  type StoredCargoLayoutInput,
} from './stored-cargo-layout-input.schema.js'

export type CargoLayoutJob = Readonly<{
  companyId: string
  correlationId: string
  inputHash: string
  layoutId: string
}>

/** `input` sai do jsonb sem tipo: quem o confere é o handler, não o repositório. */
export type CargoLayoutClaim = Readonly<{ attempt: number; input: unknown }>

export type CargoLayoutHandlerPorts = Readonly<{
  /** `null` quando a planta sumiu, o hash foi superado ou outro worker a detém dentro do lease. */
  claim: (job: CargoLayoutJob) => Promise<CargoLayoutClaim | null>
  complete: (input: {
    readonly computedAt: Date
    readonly durationMs: number
    readonly job: CargoLayoutJob
    readonly layout: ResolvedCargoLayout
  }) => Promise<void>
  /** Lança `CargoLayoutTimeoutError` quando a thread passa do teto externo. */
  compute: (input: {
    readonly budgetMs: number
    readonly input: StoredCargoLayoutInput
  }) => Promise<ResolvedCargoLayout | null>
  fail: (input: {
    readonly errorCode: CargoLayoutErrorCode
    readonly job: CargoLayoutJob
  }) => Promise<void>
  now: () => Date
  /** Volta `running → queued`; sem ela a reentrega não reivindica de novo antes do lease vencer. */
  release: (job: CargoLayoutJob) => Promise<void>
}>

export type CargoLayoutDisposition = 'ack' | 'retry'

type HandleCargoLayoutParams = Readonly<{
  attempt: number
  baseBudgetMs: number
  job: CargoLayoutJob
  logger: WorkerLogger
  maxAttempts: number
  ports: CargoLayoutHandlerPorts
}>

type ComputeOutcome =
  | { readonly kind: 'computed'; readonly layout: ResolvedCargoLayout | null }
  | { readonly kind: 'failed' }
  | { readonly kind: 'timeout' }

/**
 * Spec 145 D9 e D13–D15. `retry` só quando tentar de novo pode mudar o resultado: orçamento maior
 * (caixa cortada pelo prazo, teto externo) ou banco que volta. Dado ruim, planta indisponível e
 * exceção do empacotador repetiriam o mesmo desfecho — viram `failed` na hora.
 */
export async function handleCargoLayout(
  params: HandleCargoLayoutParams,
): Promise<CargoLayoutDisposition> {
  const claim = await params.ports.claim(params.job)
  if (claim === null) return 'ack'

  const isFinalAttempt = params.attempt >= params.maxAttempts
  try {
    return await settleCargoLayout({ claim, isFinalAttempt, params })
  } catch (cause) {
    // Só o nome da causa e o id opaco: a mensagem pode carregar rótulo de parada (PII, `security.md` §1)
    safeLogWarn({
      logger: params.logger,
      message: 'cargo_layout_settle_failed',
      metadata: {
        layoutId: params.job.layoutId,
        reason: cause instanceof Error ? cause.name : 'unknown',
      },
    })
    // Falha de escrita depois da reivindicação: a planta não pode ficar `running` até o lease vencer
    if (!isFinalAttempt) return releaseCargoLayout(params)
    return failCargoLayout({ errorCode: CARGO_LAYOUT_ERROR.failed, params })
  }
}

async function settleCargoLayout(input: {
  readonly claim: CargoLayoutClaim
  readonly isFinalAttempt: boolean
  readonly params: HandleCargoLayoutParams
}): Promise<CargoLayoutDisposition> {
  const { isFinalAttempt, params } = input
  const parsed = storedCargoLayoutInputSchema.safeParse(input.claim.input)
  if (!parsed.success) {
    // Só código e caminho de cada recusa: o valor recusado pode ser rótulo de parada (PII)
    safeLogWarn({
      logger: params.logger,
      message: 'cargo_layout_input_rejected',
      metadata: {
        issues: describeInputIssues(parsed.error.issues),
        layoutId: params.job.layoutId,
      },
    })
    return failCargoLayout({ errorCode: CARGO_LAYOUT_ERROR.failed, params })
  }

  const startedAt = params.ports.now()
  const outcome = await computeOutcome({
    budgetMs: resolveCargoLayoutBudgetMs({
      attempt: params.attempt,
      baseBudgetMs: params.baseBudgetMs,
    }),
    input: parsed.data,
    params,
  })

  if (outcome.kind === 'timeout') {
    if (!isFinalAttempt) return releaseCargoLayout(params)
    return failCargoLayout({ errorCode: CARGO_LAYOUT_ERROR.timeBudgetExceeded, params })
  }
  if (outcome.kind === 'failed')
    return failCargoLayout({ errorCode: CARGO_LAYOUT_ERROR.failed, params })
  if (outcome.layout === null) {
    return failCargoLayout({ errorCode: CARGO_LAYOUT_ERROR.unavailable, params })
  }
  // A última tentativa grava a planta cortada como está; a leitura (T10) deriva "incompleta" dela
  if (!isFinalAttempt && hasTimeBudgetShortfall(outcome.layout)) return releaseCargoLayout(params)

  const computedAt = params.ports.now()
  await params.ports.complete({
    computedAt,
    durationMs: computedAt.getTime() - startedAt.getTime(),
    job: params.job,
    layout: outcome.layout,
  })
  return 'ack'
}

async function computeOutcome(input: {
  readonly budgetMs: number
  readonly input: StoredCargoLayoutInput
  readonly params: HandleCargoLayoutParams
}): Promise<ComputeOutcome> {
  const { params } = input
  try {
    const layout = await params.ports.compute({ budgetMs: input.budgetMs, input: input.input })
    return { kind: 'computed', layout }
  } catch (cause) {
    if (cause instanceof CargoLayoutTimeoutError) return { kind: 'timeout' }
    safeLogWarn({
      logger: params.logger,
      message: 'cargo_layout_compute_failed',
      metadata: { ...describeComputeFailure(cause), layoutId: params.job.layoutId },
    })
    return { kind: 'failed' }
  }
}

/** Teto de itens no log: uma entrada inteira recusada não pode virar uma linha de megabytes. */
const MAX_LOGGED_INPUT_ISSUES = 10

function describeInputIssues(
  issues: readonly z.core.$ZodIssue[],
): readonly Readonly<Record<string, unknown>>[] {
  return issues.slice(0, MAX_LOGGED_INPUT_ISSUES).map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join('.'),
    ...(issue.code === 'unrecognized_keys' ? { keys: issue.keys } : {}),
  }))
}

function describeComputeFailure(cause: unknown): Readonly<Record<string, string>> {
  if (cause instanceof CargoLayoutThreadError) {
    return cause.code === undefined
      ? { reason: cause.reason }
      : { code: cause.code, reason: cause.reason }
  }
  return { reason: cause instanceof Error ? cause.name : 'unknown' }
}

function hasTimeBudgetShortfall(layout: ResolvedCargoLayout): boolean {
  return (
    layout.placement?.unplaced.some((box) => box.reason === TIME_BUDGET_UNPLACED_REASON) ?? false
  )
}

async function releaseCargoLayout(
  params: HandleCargoLayoutParams,
): Promise<CargoLayoutDisposition> {
  await params.ports.release(params.job)
  return 'retry'
}

async function failCargoLayout(input: {
  readonly errorCode: CargoLayoutErrorCode
  readonly params: HandleCargoLayoutParams
}): Promise<CargoLayoutDisposition> {
  await input.params.ports.fail({ errorCode: input.errorCode, job: input.params.job })
  return 'ack'
}
