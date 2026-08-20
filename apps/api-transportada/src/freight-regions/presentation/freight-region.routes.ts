/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A tabela de rotas é cadastro de configuração — escrever nela é `settings.manage`. Ler é
 * `fleet.read`: a cobertura do motorista mora no formulário da frota, e exigir a permissão de
 * configuração para listar deixaria o campo de região em branco justo para quem cadastra motorista.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_FREIGHT_REGIONS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type {
  FreightRegion,
  FreightRegionImportSummary,
  FreightRegionInput,
  FreightRegionPage,
} from '../application/freight-region.port.js'
import type {
  CreateFreightRegionInput,
  DeleteFreightRegionInput,
  ListFreightRegionsInput,
  UpdateFreightRegionInput,
} from '../application/freight-regions.use-case.js'
import {
  parseCreateRegionRequest,
  parseImportRegionsRequest,
  parseRegionList,
  parseUpdateRegionRequest,
  parseUuidPathIdentifier,
} from './freight-region.schema.js'

const REGION_PATH = `${API_FREIGHT_REGIONS_PATH}/:id`
const REGION_IMPORT_PATH = `${API_FREIGHT_REGIONS_PATH}/import`
const REGION_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const REGION_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly createRegion: {
    execute(input: TenantInput<CreateFreightRegionInput>): Promise<FreightRegion>
  }
  readonly deleteRegion: {
    execute(input: TenantInput<DeleteFreightRegionInput>): Promise<void>
  }
  readonly importRegions: {
    execute(input: {
      readonly context: CompanyContext
      readonly regions: readonly FreightRegionInput[]
    }): Promise<FreightRegionImportSummary>
  }
  readonly listRegions: {
    execute(input: TenantInput<ListFreightRegionsInput>): Promise<FreightRegionPage>
  }
  readonly updateRegion: {
    execute(input: TenantInput<UpdateFreightRegionInput>): Promise<FreightRegion>
  }
}

export function createFreightRegionRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ListFreightRegionsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listRegions.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: page.items.map(serializeRegion), page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseRegionList(new URL(request.url)),
      pathname: API_FREIGHT_REGIONS_PATH,
      policy: REGION_READ_POLICY,
    }),
    defineRoute<Omit<CreateFreightRegionInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const region = await dependencies.createRegion.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeRegion(region) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        return { correlationId, region: await parseCreateRegionRequest(request) }
      },
      pathname: API_FREIGHT_REGIONS_PATH,
      policy: REGION_MANAGE_POLICY,
    }),
    defineRoute<{ readonly regions: readonly FreightRegionInput[] }>({
      async handle({ context, input }): Promise<Response> {
        const summary = await dependencies.importRegions.execute({
          context: context.scope,
          regions: input.regions,
        })
        return jsonResponse({ body: { data: summary }, status: 200 })
      },
      // 200, não 201: a importação reconcilia a tabela inteira; o que ela devolve é o resumo do
      // que mudou, e não há um recurso novo para apontar
      method: 'POST',
      async parse({ request }) {
        return { regions: await parseImportRegionsRequest(request) }
      },
      pathname: REGION_IMPORT_PATH,
      policy: REGION_MANAGE_POLICY,
    }),
    defineRoute<Omit<UpdateFreightRegionInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const region = await dependencies.updateRegion.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeRegion(region) }, status: 200 })
      },
      // PUT, e não PATCH: cidades e valores são substituídos inteiros, e cidade retirada da tabela
      // do cliente tem de deixar de valer no mesmo passo
      method: 'PUT',
      async parse({ correlationId, pathParameters, request }) {
        const { expectedVersion, status, ...region } = await parseUpdateRegionRequest(request)
        return {
          correlationId,
          expectedVersion,
          region,
          regionId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          status,
        }
      },
      pathname: REGION_PATH,
      policy: REGION_MANAGE_POLICY,
    }),
    defineRoute<Omit<DeleteFreightRegionInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.deleteRegion.execute({ context: context.scope, ...input })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'DELETE',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        regionId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: REGION_PATH,
      policy: REGION_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeRegion(region: FreightRegion): object {
  return {
    cities: region.cities.map((city) => ({ ...city })),
    code: region.code,
    createdAt: region.createdAt,
    id: region.id,
    name: region.name,
    rates: region.rates.map((rate) => ({ ...rate })),
    status: region.status,
    updatedAt: region.updatedAt,
    version: region.version,
    zone: region.zone,
  }
}
