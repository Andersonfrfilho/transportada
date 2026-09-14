/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import { API_FLEET_VEHICLE_REFERENCES_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { VehicleReferencePort } from '../application/vehicle-reference.port.js'

/**
 * ⚠️ `fleet.read`, não `settings.manage`: o catálogo é o que o **formulário da frota** consulta para
 * sugerir a medida do baú, e quem cadastra veículo tem `fleet.read` por definição. Exigir a
 * permissão de configuração faria a ficha abrir vazia justamente para quem a preenche.
 */
const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type Dependencies = {
  readonly vehicleReferences: VehicleReferencePort
}

export function createVehicleReferenceRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Record<string, never>>({
      async handle(): Promise<Response> {
        const references = await dependencies.vehicleReferences.list()
        return jsonResponse({ body: { data: references }, status: 200 })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: API_FLEET_VEHICLE_REFERENCES_PATH,
      policy: FLEET_READ_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}
