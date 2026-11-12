/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E7, RF13): o selo "possível cobrança na entrega" nas paradas abertas da leitura do motorista. Chamado pelo
 * caso de uso, depois do recorte pelo vínculo do motorista. Refinamento, como o aviso de feriado: uma consulta para todas
 * as paradas, e falha só tira o selo — a leitura do motorista é o caminho crítico.
 */
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type { DriverChargeSealDependency } from './driver-stop-charge-seal.port.js'
import type { DriverTrip } from './find-current-driver-trip.use-case.js'

const DRIVER_CHARGE_SEAL_UNAVAILABLE_MESSAGE = 'driver_charge_seal_unavailable'

export async function attachDriverStopChargeSeal(params: {
  readonly companyId: string
  readonly dependency?: DriverChargeSealDependency
  readonly trips: readonly DriverTrip[]
}): Promise<readonly DriverTrip[]> {
  const { companyId, dependency, trips } = params
  if (dependency === undefined) return trips
  const stopIds = trips.flatMap((trip) =>
    trip.stops.filter((stop) => stop.completedAt === null).map((stop) => stop.id),
  )
  if (stopIds.length === 0) return trips

  try {
    const sealed = await dependency.reader.listSealedStops({ companyId, stopIds })
    if (sealed.size === 0) return trips
    return trips.map((trip) => ({
      ...trip,
      stops: trip.stops.map((stop) => {
        const flaggedAt = sealed.get(stop.id)
        return flaggedAt === undefined ? stop : { ...stop, clientChargeSeal: { flaggedAt } }
      }),
    }))
  } catch {
    const { logger } = dependency
    if (logger === undefined) return trips
    safeLogWarn({
      logger,
      message: DRIVER_CHARGE_SEAL_UNAVAILABLE_MESSAGE,
      metadata: { companyId, stopCount: stopIds.length },
    })
    return trips
  }
}
