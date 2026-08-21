/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cobertura é dado da frota, não da tabela de preços: quem cadastra motorista atribui onde ele
 * roda com `fleet.manage`, e não precisa de `settings.manage` para isso. Quem muda o valor da
 * rota continua precisando.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_FLEET_DRIVERS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { FleetDriverRegionCoverage } from '../application/freight-region.port.js'
import type {
  ListFleetDriverRegionsInput,
  ReplaceFleetDriverRegionsInput,
} from '../application/fleet-driver-regions.use-case.js'
import {
  parseReplaceDriverRegionsRequest,
  parseUuidPathIdentifier,
} from './fleet-driver-region.schema.js'

const DRIVER_REGIONS_PATH = `${API_FLEET_DRIVERS_PATH}/:id/regions`
const FLEET_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const FLEET_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly listCoverage: {
    execute(
      input: TenantInput<ListFleetDriverRegionsInput>,
    ): Promise<readonly FleetDriverRegionCoverage[]>
  }
  readonly replaceCoverage: {
    execute(
      input: TenantInput<ReplaceFleetDriverRegionsInput>,
    ): Promise<readonly FleetDriverRegionCoverage[]>
  }
}

export function createFleetDriverRegionRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ListFleetDriverRegionsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const coverage = await dependencies.listCoverage.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: coverage.map(serializeCoverage) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: DRIVER_REGIONS_PATH,
      policy: FLEET_READ_POLICY,
    }),
    defineRoute<Omit<ReplaceFleetDriverRegionsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const coverage = await dependencies.replaceCoverage.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: coverage.map(serializeCoverage) }, status: 200 })
      },
      // A cobertura inteira é substituída: rota que saiu da lista deixa de valer no mesmo passo
      method: 'PUT',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          driverId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          entries: await parseReplaceDriverRegionsRequest(request),
        }
      },
      pathname: DRIVER_REGIONS_PATH,
      policy: FLEET_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeCoverage(coverage: FleetDriverRegionCoverage): object {
  return {
    city: coverage.city,
    code: coverage.code,
    name: coverage.name,
    regionId: coverage.regionId,
    scope: coverage.scope,
    state: coverage.state,
    zone: coverage.zone,
  }
}
