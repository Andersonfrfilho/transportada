/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteOptimizationOutcome } from './route-optimization.effect.js'

export type RouteOptimizationJob = Readonly<{
  companyId: string
  correlationId: string
  suggestionId: string
}>

/**
 * O que o handler precisa para levar uma sugestão de `queued` a `ready` — ou a `failed`. Portas, não
 * implementações: é o que permite testar o caminho inteiro sem broker, sem Postgres e sem OSRM.
 */
export type RouteOptimizationHandlerPorts = Readonly<{
  /** `null` quando a sugestão sumiu ou já foi decidida — nada a fazer, e nada a repetir. */
  claim: (job: RouteOptimizationJob) => Promise<RouteOptimizationClaim | null>
  complete: (input: {
    readonly job: RouteOptimizationJob
    readonly outcome: RouteOptimizationOutcome
  }) => Promise<void>
  fail: (input: { readonly errorCode: string; readonly job: RouteOptimizationJob }) => Promise<void>
  optimize: (claim: RouteOptimizationClaim) => Promise<RouteOptimizationOutcome>
}>

export type RouteOptimizationClaim = Readonly<{ suggestionId: string }>

export type RouteOptimizationDisposition = 'ack' | 'retry'

/** Códigos estáveis: a tela os traduz, e um código novo é mudança de contrato, não de mensagem. */
export const ROUTE_OPTIMIZATION_ERROR = {
  matrixUnavailable: 'ROUTING_MATRIX_UNAVAILABLE',
  unknown: 'ROUTE_OPTIMIZATION_FAILED',
} as const

/**
 * ADR-0044 §1 e §5: a falha vira sugestão `failed` **com código estável**, e a tela oferece ordenar
 * à mão. Ela nunca vira rota estimada — resultado ruim disfarçado de bom é pior que ausência.
 *
 * A distinção entre `retry` e `ack` é sobre **o que muda se tentarmos de novo**: a matriz fora do ar
 * volta, e vale reentregar; qualquer outra falha é do dado ou do código, e reentregar só repete o
 * mesmo erro com o conferente esperando.
 */
export async function handleRouteOptimization(input: {
  readonly attempt: number
  readonly job: RouteOptimizationJob
  readonly maxAttempts: number
  readonly ports: RouteOptimizationHandlerPorts
}): Promise<RouteOptimizationDisposition> {
  const claim = await input.ports.claim(input.job)
  // Sugestão que sumiu ou já foi decidida: a mensagem cumpriu o papel, e repetir não a traz de volta
  if (claim === null) return 'ack'

  try {
    const outcome = await input.ports.optimize(claim)
    await input.ports.complete({ job: input.job, outcome })
    return 'ack'
  } catch (cause) {
    const errorCode = toErrorCode(cause)

    /**
     * Enquanto há tentativa sobrando, a matriz fora do ar é reentregue **sem** marcar a sugestão
     * como falha: ela continua `running`, e o conferente vê "calculando" em vez de um erro que se
     * resolveria sozinho em trinta segundos.
     */
    if (
      errorCode === ROUTE_OPTIMIZATION_ERROR.matrixUnavailable &&
      input.attempt < input.maxAttempts
    ) {
      return 'retry'
    }

    await input.ports.fail({ errorCode, job: input.job })
    return 'ack'
  }
}

function toErrorCode(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : ''

  return message.includes(ROUTE_OPTIMIZATION_ERROR.matrixUnavailable)
    ? ROUTE_OPTIMIZATION_ERROR.matrixUnavailable
    : ROUTE_OPTIMIZATION_ERROR.unknown
}
