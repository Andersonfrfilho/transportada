/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T704 (L7): o congelamento best-effort passou a ser um lugar só.
 *
 * Ele roda **depois** da escrita principal e nunca a derruba — `code-standart.md` §7, fallback
 * gracioso, não captura para logar e relançar. O que mudou é que a falha deixou de ser muda: a
 * escrita principal já limpou `planned_*` na própria transação (M1), então falhar aqui significa
 * viagem com rota nula até o próximo recálculo — o estado correto de "rota não calculada" (D5),
 * mas que ninguém conseguia explicar sem um aviso.
 *
 * ⚠️ O aviso carrega **só identificadores**. Coordenada, endereço e rótulo de parada são dado
 * pessoal de destinatário e não entram em log em nível nenhum (`security.md` §1).
 */
import type { RouteChoice } from '../domain/route-choice.policy.js'
import type { PlanTripRouteTollFreezer } from './plan-trip-route.use-case.js'

export const TRIP_ROUTE_FREEZE_FAILED_MESSAGE = 'trip_planned_route_freeze_failed'

export type TripRouteFreezeLogger = {
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void
}

export type FreezeTripRouteGracefullyInput = {
  readonly companyId: string
  readonly freezer: PlanTripRouteTollFreezer | undefined
  readonly logger?: TripRouteFreezeLogger
  readonly routeChoice?: RouteChoice
  readonly tripId: string
}

export async function freezeTripRouteGracefully(
  input: FreezeTripRouteGracefullyInput,
): Promise<void> {
  const { companyId, freezer, logger, routeChoice, tripId } = input
  if (freezer === undefined) return

  try {
    await freezer.freeze({
      companyId,
      ...(routeChoice === undefined ? {} : { routeChoice }),
      tripId,
    })
  } catch (error) {
    logger?.warn(TRIP_ROUTE_FREEZE_FAILED_MESSAGE, {
      companyId,
      reason: error instanceof Error ? error.message : 'unknown',
      tripId,
    })
  }
}
