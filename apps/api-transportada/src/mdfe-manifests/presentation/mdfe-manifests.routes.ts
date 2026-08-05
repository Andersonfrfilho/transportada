/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_MDFE_MANIFESTS_PATH,
  API_MDFE_MANIFESTS_PREVIEW_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  CreateMdfeManifestInput,
  DiscardMdfeManifestInput,
  GetMdfeManifestInput,
  ListMdfeManifestsInput,
} from '../application/mdfe-manifests.use-case.js'
import type {
  MdfeManifest,
  MdfeManifestDetail,
  MdfeManifestPage,
} from '../application/mdfe-manifest.port.js'
import type {
  MdfeManifestPreview,
  PreviewMdfeManifestInput,
} from '../application/preview-mdfe-manifest.use-case.js'
import {
  parseCreateManifestRequest,
  parseManifestList,
  parsePreviewManifestRequest,
  parseUuidPathIdentifier,
} from './mdfe-manifest.schema.js'

const MANIFEST_PATH = `${API_MDFE_MANIFESTS_PATH}/:id`
const MDFE_MANAGE_POLICY = { permission: 'mdfe.manage', scope: 'company' } as const
const MDFE_READ_POLICY = { permission: 'mdfe.read', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type PreviewRouteInput = PreviewMdfeManifestInput & { readonly correlationId: string }

type Dependencies = {
  readonly createManifest: {
    execute(input: TenantInput<CreateMdfeManifestInput>): Promise<MdfeManifestDetail>
  }
  readonly discardManifest: {
    execute(input: TenantInput<DiscardMdfeManifestInput>): Promise<MdfeManifestDetail>
  }
  readonly getManifest: {
    execute(input: TenantInput<GetMdfeManifestInput>): Promise<MdfeManifestDetail>
  }
  readonly listManifests: {
    execute(input: TenantInput<ListMdfeManifestsInput>): Promise<MdfeManifestPage>
  }
  readonly previewManifest: {
    execute(input: TenantInput<PreviewRouteInput>): Promise<MdfeManifestPreview>
  }
}

export function createMdfeManifestRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<PreviewRouteInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const preview = await dependencies.previewManifest.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializePreview(preview) }, status: 200 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        const { documentIds } = await parsePreviewManifestRequest(request)
        return { correlationId, documentIds }
      },
      pathname: API_MDFE_MANIFESTS_PREVIEW_PATH,
      policy: MDFE_MANAGE_POLICY,
    }),
    defineRoute<Omit<ListMdfeManifestsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listManifests.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: page.items.map(serializeManifest), page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseManifestList(new URL(request.url)),
      pathname: API_MDFE_MANIFESTS_PATH,
      policy: MDFE_READ_POLICY,
    }),
    defineRoute<Omit<CreateMdfeManifestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const manifest = await dependencies.createManifest.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeDetail(manifest) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, request }) {
        // criação direta nunca nasce de uma viagem — tripId fica null (spec 027, T009)
        return {
          correlationId,
          manifest: { ...(await parseCreateManifestRequest(request)), tripId: null },
        }
      },
      pathname: API_MDFE_MANIFESTS_PATH,
      policy: MDFE_MANAGE_POLICY,
    }),
    defineRoute<Omit<GetMdfeManifestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const manifest = await dependencies.getManifest.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeDetail(manifest) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        manifestId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: MANIFEST_PATH,
      policy: MDFE_READ_POLICY,
    }),
    defineRoute<Omit<DiscardMdfeManifestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const manifest = await dependencies.discardManifest.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeDetail(manifest) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        manifestId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: `${MANIFEST_PATH}/discard`,
      policy: MDFE_MANAGE_POLICY,
    }),
  ]
}

function jsonResponse(input: { readonly body: object; readonly status: number }): Response {
  return new Response(JSON.stringify(input.body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: input.status,
  })
}

function serializeDetail(manifest: MdfeManifestDetail): object {
  return {
    ...serializeManifest(manifest),
    drivers: manifest.drivers.map((driver) => ({ ...driver })),
    items: manifest.items.map((item) => ({ ...item })),
    loadingCities: manifest.loadingCities.map((city) => ({ ...city })),
  }
}

function serializeManifest(manifest: MdfeManifest): object {
  return {
    additionalInformation: manifest.additionalInformation,
    cargoProduct: manifest.cargoProduct,
    cargoProductNcm: manifest.cargoProductNcm,
    cargoType: manifest.cargoType,
    cargoUnit: manifest.cargoUnit,
    cargoValue: manifest.cargoValue,
    cargoWeight: manifest.cargoWeight,
    contractorName: manifest.contractorName,
    contractorTaxId: manifest.contractorTaxId,
    createdAt: manifest.createdAt,
    cteCount: manifest.cteCount,
    destinationState: manifest.destinationState,
    dischargePostalCode: manifest.dischargePostalCode,
    emitterType: manifest.emitterType,
    fiscalEnvironment: manifest.fiscalEnvironment,
    fiscalNumber: manifest.fiscalNumber,
    fiscalSeries: manifest.fiscalSeries,
    freightValue: manifest.freightValue,
    id: manifest.id,
    insuranceEndorsement: manifest.insuranceEndorsement,
    lastRejection: manifest.lastRejection === null ? null : { ...manifest.lastRejection },
    loadingPostalCode: manifest.loadingPostalCode,
    originState: manifest.originState,
    rntrc: manifest.rntrc,
    status: manifest.status,
    transporterType: manifest.transporterType,
    tripId: manifest.tripId,
    tripStartedAt: manifest.tripStartedAt,
    updatedAt: manifest.updatedAt,
    vehicleId: manifest.vehicleId,
    version: manifest.version,
  }
}

function serializePreview(preview: MdfeManifestPreview): object {
  return {
    blocked: preview.blocked.map((block) => ({ ...block })),
    destinationState: preview.destinationState,
    destinationStateOptions: [...preview.destinationStateOptions],
    dischargeCities: preview.dischargeCities.map((city) => ({
      accessKeys: [...city.accessKeys],
      cityCode: city.cityCode,
      cityName: city.cityName,
      state: city.state,
    })),
    documents: preview.documents.map((document) => ({ ...document })),
    fiscalEnvironment: preview.fiscalEnvironment,
    loadingCities: preview.loadingCities.map((city) => ({ ...city })),
    originState: preview.originState,
    totals: { ...preview.totals },
  }
}
