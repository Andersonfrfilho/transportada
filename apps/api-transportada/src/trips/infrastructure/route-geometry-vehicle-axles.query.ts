/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T7: quantos eixos o veículo escolhido no diálogo **Nova viagem** tem, para o pedágio da
 * montagem sair com o total certo. `resolveDeclaredVehicleAxles` (T6) é a única política que
 * decide isso — esta consulta só busca a ficha.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type { AxleCount } from '../../toll-booths/domain/toll-route-cost.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

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

      return resolveDeclaredVehicleAxles(vehicle)
    },
  }
}
