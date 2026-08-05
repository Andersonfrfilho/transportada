/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CreateTripMdfeManifestInput } from '../../mdfe-manifests/application/create-trip-mdfe-manifest.use-case.js'
import type { MdfeManifestDetail } from '../../mdfe-manifests/application/mdfe-manifest.port.js'
import { parseCreateTripManifestRequest } from '../../mdfe-manifests/presentation/mdfe-manifest.schema.js'
import type {
  CloseTripInput,
  CreateTripInput,
  DeliverTripDocumentInput,
  GetTripInput,
  LinkTripDocumentInput,
  ListTripsInput,
  ReleaseTripDocumentInput,
} from '../application/trip.use-case.js'
import type {
  Trip,
  TripDetail,
  TripDocument,
  TripDocumentDetail,
  TripPage,
} from '../application/trip.port.js'
import {
  parseCreateTripRequest,
  parseLinkTripDocumentRequest,
  parseTripList,
  parseUuidPathIdentifier,
} from './trip.schema.js'

const TRIP_CLOSE_PATH = `${API_TRIPS_PATH}/:id/close`
const TRIP_DETAIL_PATH = `${API_TRIPS_PATH}/:id`
const TRIP_DOCUMENTS_PATH = `${API_TRIPS_PATH}/:id/documents`
const TRIP_DOCUMENT_PATH = `${TRIP_DOCUMENTS_PATH}/:documentId`
const TRIP_DOCUMENT_DELIVER_PATH = `${TRIP_DOCUMENT_PATH}/deliver`
const TRIP_MDFE_MANIFESTS_PATH = `${API_TRIPS_PATH}/:id/mdfe-manifests`
/** spec.md § Dúvidas: "Permissão: `fleet.manage` — sem papel novo por enquanto." */
const TRIP_MANAGE_POLICY = { permission: 'fleet.manage', scope: 'company' } as const
const TRIP_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MDFE_MANAGE_POLICY = { permission: 'mdfe.manage', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type Dependencies = {
  readonly closeTrip: { execute(input: TenantInput<CloseTripInput>): Promise<TripDetail> }
  readonly createTrip: { execute(input: TenantInput<CreateTripInput>): Promise<TripDetail> }
  readonly createTripMdfeManifest: {
    execute(input: TenantInput<CreateTripMdfeManifestInput>): Promise<MdfeManifestDetail>
  }
  readonly deliverTripDocument: {
    execute(input: TenantInput<DeliverTripDocumentInput>): Promise<TripDocument>
  }
  readonly getTrip: { execute(input: TenantInput<GetTripInput>): Promise<TripDetail> }
  readonly linkTripDocument: {
    execute(input: TenantInput<LinkTripDocumentInput>): Promise<TripDocument>
  }
  readonly listTrips: { execute(input: TenantInput<ListTripsInput>): Promise<TripPage> }
  readonly releaseTripDocument: {
    execute(input: TenantInput<ReleaseTripDocumentInput>): Promise<TripDocument>
  }
}

export function createTripRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<Omit<ListTripsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listTrips.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: page.items.map(serializeTrip), page: { nextCursor: page.nextCursor } },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseTripList(new URL(request.url)),
      pathname: API_TRIPS_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<Omit<GetTripInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const trip = await dependencies.getTrip.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeTripDetail(trip) }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DETAIL_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<Omit<CreateTripInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const trip = await dependencies.createTrip.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeTripDetail(trip) }, status: 201 })
      },
      method: 'POST',
      parse: ({ request }) => parseCreateTripRequest(request),
      pathname: API_TRIPS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<LinkTripDocumentInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const document = await dependencies.linkTripDocument.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeTripDocument(document) }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseLinkTripDocumentRequest(request)
        return {
          freightCalculationId: body.freightCalculationId,
          nfeDocumentId: body.nfeDocumentId,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DOCUMENTS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<DeliverTripDocumentInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const document = await dependencies.deliverTripDocument.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeTripDocument(document) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DOCUMENT_DELIVER_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<ReleaseTripDocumentInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const document = await dependencies.releaseTripDocument.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeTripDocument(document) }, status: 200 })
      },
      method: 'DELETE',
      parse: ({ pathParameters }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DOCUMENT_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<CloseTripInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const trip = await dependencies.closeTrip.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeTripDetail(trip) }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_CLOSE_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<CreateTripMdfeManifestInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const manifest = await dependencies.createTripMdfeManifest.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: serializeMdfeManifestDetail(manifest) }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        return {
          correlationId,
          manifest: await parseCreateTripManifestRequest(request),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_MDFE_MANIFESTS_PATH,
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

function serializeTrip(trip: Trip): object {
  return {
    companyId: trip.companyId,
    createdAt: trip.createdAt,
    id: trip.id,
    status: trip.status,
    updatedAt: trip.updatedAt,
    vehicleId: trip.vehicleId,
  }
}

function serializeTripDetail(trip: TripDetail): object {
  return {
    ...serializeTrip(trip),
    documents: trip.documents.map(serializeTripDocumentDetail),
    drivers: trip.drivers.map((driver) => ({ ...driver })),
  }
}

function serializeTripDocument(document: TripDocument): object {
  return {
    createdAt: document.createdAt,
    deliveredAt: document.deliveredAt,
    freightCalculationId: document.freightCalculationId,
    id: document.id,
    nfeDocumentId: document.nfeDocumentId,
    releasedAt: document.releasedAt,
    tripId: document.tripId,
    updatedAt: document.updatedAt,
  }
}

function serializeTripDocumentDetail(document: TripDocumentDetail): object {
  return {
    ...serializeTripDocument(document),
    cteAuthorized: document.cteAuthorized,
    fiscalStatus: document.fiscalStatus,
  }
}

function serializeMdfeManifestDetail(manifest: MdfeManifestDetail): object {
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
    drivers: manifest.drivers.map((driver) => ({ ...driver })),
    emitterType: manifest.emitterType,
    fiscalEnvironment: manifest.fiscalEnvironment,
    fiscalNumber: manifest.fiscalNumber,
    fiscalSeries: manifest.fiscalSeries,
    freightValue: manifest.freightValue,
    id: manifest.id,
    insuranceEndorsement: manifest.insuranceEndorsement,
    items: manifest.items.map((item) => ({ ...item })),
    lastRejection: manifest.lastRejection === null ? null : { ...manifest.lastRejection },
    loadingCities: manifest.loadingCities.map((city) => ({ ...city })),
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
