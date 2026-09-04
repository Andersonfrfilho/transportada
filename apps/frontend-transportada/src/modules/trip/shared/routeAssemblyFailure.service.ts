/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Por que a montagem do roteiro falhou — a causa, não uma frase única para tudo.
 *
 * ⚠️ O painel dizia "Confira as notas e a frota escolhidas e tente de novo" para **todas** as
 * falhas, e isso acusa o inocente na maioria delas. Medido em 2026-09-03: o operador esperou dois
 * minutos e leu essa frase enquanto a causa era o **worker fora do ar** — a linha em
 * `route_suggestions` ficou em `queued` sem `error_code`, e a fila `route-optimization.v1.main`
 * tinha uma mensagem e nenhum consumidor. As notas e a frota estavam certas.
 *
 * O mecanismo já existia e ninguém o usava: `tripClient.service.ts` lança `new Error(code)` a
 * partir do `error.code` do corpo, e a espera lança `new Error(errorCode)`. Ou seja, a mensagem do
 * erro **é** o código estável.
 */

/** O teto de espera estourou: ninguém consumiu o pedido. Nasce no cliente, não no servidor. */
export const ROUTE_ASSEMBLY_TIMEOUT_CODE = 'ROUTE_SUGGESTION_TIMEOUT'

/**
 * De onde sai o texto. O vocabulário de recusa do roteirizador é do módulo dele — copiar as frases
 * para cá daria duas grafias para a mesma falha, como já vale para o estado da viagem e a cor do
 * veículo.
 */
export type RouteAssemblyFailure =
  | Readonly<{ code: string; key: string; namespace: 'routing' | 'trip' }>
  | Readonly<{ code: string; namespace: 'unknown' }>

const ROUTING_KEY_BY_CODE: Readonly<Record<string, string>> = {
  /** O solver respondeu que a matriz de estrada não está no ar (ADR-0044 §2). */
  ROUTING_MATRIX_UNAVAILABLE: 'failure.ROUTING_MATRIX_UNAVAILABLE',
  ROUTE_SUGGESTION_DOCUMENT_UNAVAILABLE:
    'multiVehicle.failure.ROUTE_SUGGESTION_DOCUMENT_UNAVAILABLE',
  ROUTE_SUGGESTION_DRIVER_REPEATED: 'multiVehicle.failure.ROUTE_SUGGESTION_DRIVER_REPEATED',
  ROUTE_SUGGESTION_DRIVER_UNAVAILABLE: 'multiVehicle.failure.ROUTE_SUGGESTION_DRIVER_UNAVAILABLE',
  ROUTE_SUGGESTION_POOL_EMPTY: 'multiVehicle.failure.ROUTE_SUGGESTION_POOL_EMPTY',
  ROUTE_SUGGESTION_VEHICLE_UNAVAILABLE: 'multiVehicle.failure.ROUTE_SUGGESTION_VEHICLE_UNAVAILABLE',
}

/**
 * As duas causas que são desta tela, e não do roteirizador: a espera que estourou e a proposta que
 * envelheceu enquanto se decidia.
 */
const TRIP_KEY_BY_CODE: Readonly<Record<string, string>> = {
  ROUTE_SUGGESTION_STALE: 'routeAssembly.failure.stale',
  [ROUTE_ASSEMBLY_TIMEOUT_CODE]: 'routeAssembly.failure.timeout',
  TRIP_REQUEST_FAILED: 'routeAssembly.failure.network',
}

/** O código que o erro carrega. Erro sem mensagem ainda é falha, e some se não tiver nome. */
function readErrorCode(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message
  return 'UNKNOWN'
}

/**
 * ⚠️ Código desconhecido **não some**: quem chama imprime a frase genérica com o código ao lado, e
 * é ele que permite pedir suporte com informação. Engolir o desconhecido devolveria exatamente o
 * defeito que este serviço conserta.
 */
export function resolveRouteAssemblyFailure(error: unknown): RouteAssemblyFailure {
  const code = readErrorCode(error)

  const routingKey = ROUTING_KEY_BY_CODE[code]
  if (routingKey !== undefined) return { code, key: routingKey, namespace: 'routing' }

  const tripKey = TRIP_KEY_BY_CODE[code]
  if (tripKey !== undefined) return { code, key: tripKey, namespace: 'trip' }

  return { code, namespace: 'unknown' }
}
