/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { TripRouteFreezeLogger } from './freeze-trip-route-gracefully.js'

export type ResolveTripStopPointsInput = {
  readonly actorUserId: string
  readonly companyId: string
  readonly tripId: string
}

export type TripStopPointResolver = {
  resolve(input: ResolveTripStopPointsInput): Promise<void>
}

export type ResolveTripStopPointsDependencies = {
  readonly listAddressKeysWithoutLocation: (input: {
    readonly companyId: string
    readonly tripId: string
  }) => Promise<readonly string[]>
  readonly logger?: TripRouteFreezeLogger
  /** Máximo de endereços resolvidos por planejamento: o gasto de uma viagem não é ilimitado. */
  readonly maxPerPlan: number
  readonly quota: {
    readonly countInWindow: (input: { readonly companyId: string }) => Promise<number>
    readonly limit: number
  }
  /** O degrau 2 da escada (`createRefineAddressUseCase`): respeita a correção manual e grava o rastro. */
  readonly refine: (input: {
    readonly actorUserId: string
    readonly addressKey: string
    readonly companyId: string
  }) => Promise<unknown>
}

/**
 * Ao planejar a rota, a parada ainda sem ponto no mapa é resolvida na hora pelo provedor antes de a
 * rota sair sem ela. Revisa o adendo de 01/09/2026 da ADR-0044 (ver ADR-0104): o gasto continua
 * sob o teto da ADR-0062 (`GEOCODING_REFINEMENT_WINDOW_LIMIT`, contado pelos mesmos registros da
 * marca humana) e a correção humana continua vencendo, porque quem decide é o `refine`.
 *
 * Nunca lança: falha do provedor deixa a parada sem ponto, e o planejamento segue para o erro que
 * nomeia o endereço.
 */
export function createTripStopPointResolver(
  dependencies: ResolveTripStopPointsDependencies,
): TripStopPointResolver {
  return {
    async resolve(input) {
      try {
        const keys = await dependencies.listAddressKeysWithoutLocation(input)
        if (keys.length === 0) return

        let used = await dependencies.quota.countInWindow({ companyId: input.companyId })
        for (const addressKey of keys.slice(0, dependencies.maxPerPlan)) {
          if (used >= dependencies.quota.limit) {
            dependencies.logger?.warn('trip_stop_point_quota_reached', {
              companyId: input.companyId,
              tripId: input.tripId,
            })
            return
          }
          used += 1
          await dependencies
            .refine({
              actorUserId: input.actorUserId,
              addressKey,
              companyId: input.companyId,
            })
            .catch(() => undefined)
        }
      } catch {
        dependencies.logger?.warn('trip_stop_point_resolution_failed', {
          companyId: input.companyId,
          tripId: input.tripId,
        })
      }
    },
  }
}
