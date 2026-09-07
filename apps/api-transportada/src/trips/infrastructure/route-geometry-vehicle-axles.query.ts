/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T7: quantos eixos o veículo escolhido no diálogo **Nova viagem** tem, para o pedágio da
 * montagem sair com o total certo. `resolveVehicleAxles` (T6) é a única política que decide isso —
 * esta consulta só busca a ficha e devolve `null` quando não há o que resolver.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { VEHICLE_TYPES, type VehicleType } from '../../shared/vehicle-type.constant.js'
import { resolveVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type { AxleCount } from '../../toll-booths/domain/toll-route-cost.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const VEHICLE_TYPE_SET = new Set<string>(VEHICLE_TYPES)

function isVehicleType(value: string): value is VehicleType {
  return VEHICLE_TYPE_SET.has(value)
}

export function createRouteGeometryVehicleAxlesQuery(database: Database): Readonly<{
  readVehicleAxles: (input: {
    readonly companyId: string
    readonly vehicleId: string
  }) => Promise<AxleCount | null>
}> {
  return {
    async readVehicleAxles(input) {
      const [vehicle] = await database
        .select({ axleCount: fleetVehicles.axleCount, vehicleType: fleetVehicles.vehicleType })
        .from(fleetVehicles)
        .where(
          and(eq(fleetVehicles.companyId, input.companyId), eq(fleetVehicles.id, input.vehicleId)),
        )
        .limit(1)
      if (vehicle === undefined) return null

      /**
       * ⚠️ Declarado vence mesmo sem `vehicleType` válido — a ficha manda o número, e não há por
       * que exigir o tipo de quem já contou os eixos. Sem os dois, não há o que estimar: o
       * implemento (`vehicleType` vazio) e o tipo fora do catálogo saem como pedágio desconhecido,
       * nunca como palpite de dois eixos.
       */
      if (vehicle.axleCount > 0) return { count: vehicle.axleCount, source: 'declared' }
      if (!isVehicleType(vehicle.vehicleType)) return null

      return resolveVehicleAxles({ axleCount: vehicle.axleCount, vehicleType: vehicle.vehicleType })
    },
  }
}
