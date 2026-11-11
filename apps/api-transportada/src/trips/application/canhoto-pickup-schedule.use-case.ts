/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3 (RF4): encaixar e desencaixar a coleta de canhoto. A escrita é do repositório, numa transação; aqui só
 * o recongelamento best-effort da rota das viagens antes do despacho cujo conjunto de paradas mudou — depois do
 * commit, nunca derrubando a escrita (spec 153 T704, o mesmo caminho do vínculo de nota).
 */
import type { CanhotoPickupStatus } from '../../shared/canhoto-pickup.constant.js'
import type {
  CanhotoPickupSchedulePort,
  CanhotoPickupView,
  CanhotoPickupWriteActor,
} from './canhoto-pickup-schedule.port.js'
import {
  freezeTripRouteGracefully,
  type TripRouteFreezeLogger,
} from './freeze-trip-route-gracefully.js'
import type { PlanTripRouteTollFreezer } from './plan-trip-route.use-case.js'

export type CanhotoPickupScheduleUseCase = {
  list(params: {
    readonly companyId: string
    readonly limit: number
    readonly statuses: readonly CanhotoPickupStatus[]
    readonly tripId?: string
  }): Promise<readonly CanhotoPickupView[]>
  schedule(
    params: CanhotoPickupWriteActor & { readonly pickupId: string; readonly tripId: string },
  ): Promise<CanhotoPickupView>
  unschedule(
    params: CanhotoPickupWriteActor & { readonly pickupId: string },
  ): Promise<CanhotoPickupView>
}

export function createCanhotoPickupScheduleUseCase(dependencies: {
  readonly logger?: TripRouteFreezeLogger
  readonly repository: CanhotoPickupSchedulePort
  readonly routeFreezer?: PlanTripRouteTollFreezer
}): CanhotoPickupScheduleUseCase {
  async function refreeze(companyId: string, tripIds: readonly string[]): Promise<void> {
    for (const tripId of tripIds) {
      await freezeTripRouteGracefully({
        companyId,
        freezer: dependencies.routeFreezer,
        ...(dependencies.logger === undefined ? {} : { logger: dependencies.logger }),
        tripId,
      })
    }
  }

  return {
    list: (params) => dependencies.repository.list(params),
    async schedule(params) {
      const result = await dependencies.repository.schedule(params)
      await refreeze(params.companyId, result.tripsToRefreeze)
      return result.pickup
    },
    async unschedule(params) {
      const result = await dependencies.repository.unschedule(params)
      await refreeze(params.companyId, result.tripsToRefreeze)
      return result.pickup
    },
  }
}
