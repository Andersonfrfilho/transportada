/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CreateTripMdfeManifestInput } from '../../mdfe-manifests/application/create-trip-mdfe-manifest.use-case.js'
import type { AutomaticManifestResult } from '../../mdfe-manifests/application/issue-trip-manifest-automatically.use-case.js'
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
  TripStopDetail,
} from '../application/trip.port.js'
import type { CancelTripResult } from '../application/cancel-trip.use-case.js'
import type { DispatchTripResult } from '../application/dispatch-trip.use-case.js'
import type {
  ListTripStopsResult,
  TripStopSummary,
} from '../application/list-trip-stops.use-case.js'
import type { CreateTripCteBatchResult } from '../application/create-trip-cte-batch.use-case.js'
import type { TripFiscalReadinessSnapshot } from '../application/read-trip-fiscal-readiness.use-case.js'
import type { PlanTripRouteResult } from '../application/plan-trip-route.use-case.js'
import type { ReorderTripStopsResult } from '../application/reorder-trip-stops.use-case.js'
import type { ListDeliveryAddressHistoryResult } from '../application/list-delivery-address-history.use-case.js'
import type { DeliveryAddressOverrideRecord } from '../application/override-delivery-address.use-case.js'
import type { TransitionTripDocumentResult } from '../application/transition-trip-document.use-case.js'
import type { ListReturnedWithActiveCteResult } from '../application/list-returned-with-active-cte.use-case.js'
import type {
  TransitionTripDocumentsBatchResult,
  TripDocumentBatchItemOutcome,
} from '../application/transition-trip-documents-batch.use-case.js'
import type { TripDocumentAction } from '../domain/trip-state.policy.js'
import { parseIdempotencyKey as parseCteBatchIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import {
  parseBatchTransitionTripDocumentsRequest,
  parseCreateTripRequest,
  parseDispatchTripRequest,
  parseLinkTripDocumentRequest,
  parseOverrideDeliveryAddressRequest,
  parseReorderTripStopsRequest,
  parseTransitionTripDocumentRequest,
  parseTripList,
  parseUuidPathIdentifier,
} from './trip.schema.js'

const TRIP_CLOSE_PATH = `${API_TRIPS_PATH}/:id/close`
const TRIP_DETAIL_PATH = `${API_TRIPS_PATH}/:id`
const TRIP_DOCUMENTS_PATH = `${API_TRIPS_PATH}/:id/documents`
const TRIP_DOCUMENT_PATH = `${TRIP_DOCUMENTS_PATH}/:documentId`
const TRIP_DOCUMENT_DELIVER_PATH = `${TRIP_DOCUMENT_PATH}/deliver`
/**
 * ADR-0043 §1: `deliver` não ganha rota individual aqui — RF-6 da spec 056 só lista
 * separate/load/return para o escritório. Entregar é ação de rua (spec 057, `/me/trips/*`, papel
 * `trip.report`) e já teria colidido com `TRIP_DOCUMENT_DELIVER_PATH` acima, que é o fluxo antigo
 * (spec 027) — `deliver` continua acessível pelo lote (`batch-status`) enquanto a 057 não nasce.
 */
const TRIP_DOCUMENT_SEPARATE_PATH = `${TRIP_DOCUMENT_PATH}/separate`
const TRIP_DOCUMENT_LOAD_PATH = `${TRIP_DOCUMENT_PATH}/load`
const TRIP_DOCUMENT_RETURN_PATH = `${TRIP_DOCUMENT_PATH}/return`
const TRIP_DOCUMENTS_BATCH_STATUS_PATH = `${TRIP_DOCUMENTS_PATH}/batch-status`
const TRIP_PLAN_ROUTE_PATH = `${API_TRIPS_PATH}/:id/plan-route`
const TRIP_DISPATCH_PATH = `${API_TRIPS_PATH}/:id/dispatch`
const TRIP_CANCEL_PATH = `${API_TRIPS_PATH}/:id/cancel`
const TRIP_STOPS_PATH = `${API_TRIPS_PATH}/:id/stops`
/** Spec 059 D1: a prontidão é **consulta**, e por isso ela é uma rota de leitura, não uma coluna. */
const TRIP_FISCAL_READINESS_PATH = `${API_TRIPS_PATH}/:id/fiscal-readiness`
/** D8: fora da árvore `/trips/:id`, de propósito — é uma varredura da empresa inteira, não de
 * uma viagem. */
const RETURNED_WITH_ACTIVE_CTE_PATH = '/trip-documents/returned-with-active-cte'
const TRIP_STOPS_ORDER_PATH = `${TRIP_STOPS_PATH}/order`
const TRIP_DOCUMENT_DELIVERY_ADDRESS_PATH = `${TRIP_DOCUMENT_PATH}/delivery-address`
const TRIP_DOCUMENT_DELIVERY_ADDRESS_HISTORY_PATH = `${TRIP_DOCUMENT_DELIVERY_ADDRESS_PATH}-history`
const TRIP_MDFE_MANIFESTS_PATH = `${API_TRIPS_PATH}/:id/mdfe-manifests`
/**
 * Spec 065 D2b: o gatilho automático. Quem chama é o consumer que escuta a autorização de CT-e — uma
 * **máquina** —, e por isso ela **relata em vez de recusar**: um `409` devolvido a um consumer vira
 * reentrega, e reentrega de recusa definitiva é fila que nunca drena.
 */
const TRIP_AUTOMATIC_MANIFEST_PATH = `${TRIP_MDFE_MANIFESTS_PATH}/automatic`
/**
 * Spec 065 D4bis: o lote urgente da viagem, para quando o MDF-e é necessário antes de a contratante
 * autorizar. É o **lote normal** com as notas da viagem — só o momento muda.
 */
const TRIP_CTE_BATCHES_PATH = `${API_TRIPS_PATH}/:id/cte-batches`
/**
 * A escrita de viagem é permissão própria: `fleet.manage` também apaga veículo e motorista, e o
 * separador que monta a viagem não tem por que poder fazer isso.
 */
const TRIP_MANAGE_POLICY = { permission: 'trip.manage', scope: 'company' } as const
const TRIP_READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const MDFE_MANAGE_POLICY = { permission: 'mdfe.manage', scope: 'company' } as const
/** Disparar o lote é submeter emissão fiscal — a mesma permissão de quem submete o lote normal. */
const CTE_SUBMIT_POLICY = { permission: 'cte.submit', scope: 'company' } as const

type TenantInput<TInput> = Omit<TInput, 'context'> & { readonly context: CompanyContext }

type TripDocumentActionInput = {
  readonly documentId: string
  readonly note: string | null
  readonly returnReason: string | null
  readonly tripId: string
}

type BatchStatusInput = {
  readonly action: TripDocumentAction
  readonly documentIds: readonly string[]
  readonly note: string | null
  readonly returnReason: string | null
  readonly tripId: string
}

type DispatchInput = {
  readonly force: boolean
  readonly forceReason: string | null
  readonly tripId: string
}
type TripIdInput = { readonly tripId: string }
type ReorderStopsInput = { readonly stopIds: readonly string[]; readonly tripId: string }
type DeliveryAddressHistoryInput = { readonly documentId: string; readonly tripId: string }
type OverrideDeliveryAddressInput = {
  readonly documentId: string
  readonly newAddress: {
    readonly cityCode: string | null
    readonly number: string | null
    readonly postalCode: string | null
  }
  readonly newLabel: string
  readonly reason: string
  readonly requestedBy: string
  readonly tripId: string
}

type Dependencies = {
  readonly batchStatus: {
    execute(input: TenantInput<BatchStatusInput>): Promise<TransitionTripDocumentsBatchResult>
  }
  readonly cancelTrip: { execute(input: TenantInput<TripIdInput>): Promise<CancelTripResult> }
  readonly closeTrip: { execute(input: TenantInput<CloseTripInput>): Promise<TripDetail> }
  readonly createTrip: { execute(input: TenantInput<CreateTripInput>): Promise<TripDetail> }
  readonly createTripCteBatch: {
    execute(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly tripId: string
      readonly userId: string
    }): Promise<CreateTripCteBatchResult>
  }
  readonly createTripMdfeManifest: {
    execute(input: TenantInput<CreateTripMdfeManifestInput>): Promise<MdfeManifestDetail>
  }
  readonly deliverTripDocument: {
    execute(input: TenantInput<DeliverTripDocumentInput>): Promise<TripDocument>
  }
  readonly dispatchTrip: { execute(input: TenantInput<DispatchInput>): Promise<DispatchTripResult> }
  readonly getTrip: { execute(input: TenantInput<GetTripInput>): Promise<TripDetail> }
  readonly issueManifestAutomatically: {
    execute(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly tripId: string
      readonly userId: string
    }): Promise<AutomaticManifestResult>
  }
  readonly readFiscalReadiness: {
    execute(input: {
      readonly companyId: string
      readonly tripId: string
    }): Promise<TripFiscalReadinessSnapshot>
  }
  readonly linkTripDocument: {
    execute(input: TenantInput<LinkTripDocumentInput>): Promise<TripDocument>
  }
  readonly listStops: { execute(input: TenantInput<TripIdInput>): Promise<ListTripStopsResult> }
  readonly listTrips: { execute(input: TenantInput<ListTripsInput>): Promise<TripPage> }
  readonly loadTripDocument: {
    execute(input: TenantInput<TripDocumentActionInput>): Promise<TransitionTripDocumentResult>
  }
  readonly planTripRoute: { execute(input: TenantInput<TripIdInput>): Promise<PlanTripRouteResult> }
  readonly releaseTripDocument: {
    execute(input: TenantInput<ReleaseTripDocumentInput>): Promise<TripDocument>
  }
  readonly listDeliveryAddressHistory: {
    execute(
      input: TenantInput<DeliveryAddressHistoryInput>,
    ): Promise<ListDeliveryAddressHistoryResult>
  }
  readonly overrideDeliveryAddress: {
    execute(
      input: TenantInput<OverrideDeliveryAddressInput>,
    ): Promise<DeliveryAddressOverrideRecord>
  }
  readonly listReturnedWithActiveCte: {
    execute(input: TenantInput<Record<never, never>>): Promise<ListReturnedWithActiveCteResult>
  }
  readonly reorderStops: {
    execute(input: TenantInput<ReorderStopsInput>): Promise<ReorderTripStopsResult>
  }
  readonly returnTripDocument: {
    execute(input: TenantInput<TripDocumentActionInput>): Promise<TransitionTripDocumentResult>
  }
  readonly separateTripDocument: {
    execute(input: TenantInput<TripDocumentActionInput>): Promise<TransitionTripDocumentResult>
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
    defineRoute<{
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.createTripCteBatch.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          tripId: input.tripId,
          userId: context.scope.userId,
        })

        return jsonResponse({ body: { data: result }, status: 201 })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters, request }) => ({
        correlationId,
        idempotencyKey: parseCteBatchIdempotencyKey(request.headers.get('idempotency-key')),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_CTE_BATCHES_PATH,
      policy: CTE_SUBMIT_POLICY,
    }),
    defineRoute<{ readonly correlationId: string; readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.issueManifestAutomatically.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          tripId: input.tripId,
          userId: context.scope.userId,
        })

        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_AUTOMATIC_MANIFEST_PATH,
      policy: MDFE_MANAGE_POLICY,
    }),
    defineRoute<{ readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const readiness = await dependencies.readFiscalReadiness.execute({
          companyId: context.scope.companyId,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: readiness }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_FISCAL_READINESS_PATH,
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
    tripDocumentActionRoute({
      dependency: dependencies.separateTripDocument,
      pathname: TRIP_DOCUMENT_SEPARATE_PATH,
    }),
    tripDocumentActionRoute({
      dependency: dependencies.loadTripDocument,
      pathname: TRIP_DOCUMENT_LOAD_PATH,
    }),
    tripDocumentActionRoute({
      dependency: dependencies.returnTripDocument,
      pathname: TRIP_DOCUMENT_RETURN_PATH,
    }),
    defineRoute<Omit<BatchStatusInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.batchStatus.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeBatchResult(result) }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBatchTransitionTripDocumentsRequest(request)
        return {
          action: body.action,
          documentIds: body.documentIds,
          note: body.note,
          returnReason: body.returnReason,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DOCUMENTS_BATCH_STATUS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<TripIdInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.planTripRoute.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_PLAN_ROUTE_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<DispatchInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.dispatchTrip.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseDispatchTripRequest(request)
        return {
          force: body.force,
          forceReason: body.forceReason,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DISPATCH_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<TripIdInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.cancelTrip.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_CANCEL_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<TripIdInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.listStops.execute({ context: context.scope, ...input })
        return jsonResponse({
          body: { data: result.stops.map(serializeTripStop) },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_STOPS_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<Omit<ReorderStopsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.reorderStops.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'PATCH',
      async parse({ pathParameters, request }) {
        const body = await parseReorderTripStopsRequest(request)
        return {
          stopIds: body.stopIds,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_STOPS_ORDER_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<OverrideDeliveryAddressInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.overrideDeliveryAddress.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: { data: serializeDeliveryAddressOverride(result) },
          status: 201,
        })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseOverrideDeliveryAddressRequest(request)
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          newAddress: body.newAddress,
          newLabel: body.newLabel,
          reason: body.reason,
          requestedBy: body.requestedBy,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DOCUMENT_DELIVERY_ADDRESS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<Omit<DeliveryAddressHistoryInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.listDeliveryAddressHistory.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: { data: result.overrides.map(serializeDeliveryAddressOverride) },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DOCUMENT_DELIVERY_ADDRESS_HISTORY_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<Record<never, never>>({
      async handle({ context }): Promise<Response> {
        const result = await dependencies.listReturnedWithActiveCte.execute({
          context: context.scope,
        })
        return jsonResponse({
          body: { data: result.entries.map(serializeReturnedWithActiveCteEntry) },
          status: 200,
        })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: RETURNED_WITH_ACTIVE_CTE_PATH,
      policy: TRIP_READ_POLICY,
    }),
  ]

  /** As três ações da nota diferem só no caminho e na dependência — mesmo corpo, mesma resposta. */
  function tripDocumentActionRoute(config: {
    readonly dependency: {
      execute(input: TenantInput<TripDocumentActionInput>): Promise<TransitionTripDocumentResult>
    }
    readonly pathname: string
  }): ReturnType<typeof defineRoute<Omit<TripDocumentActionInput, 'context'>>> {
    return defineRoute<Omit<TripDocumentActionInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const result = await config.dependency.execute({ context: context.scope, ...input })
        return jsonResponse({ body: { data: serializeTransitionResult(result) }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseTransitionTripDocumentRequest(request)
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          note: body.note,
          returnReason: body.returnReason,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: config.pathname,
      policy: TRIP_MANAGE_POLICY,
    })
  }
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
    stops: trip.stops.map(serializeTripStopDetail),
  }
}

function serializeTripDocument(document: TripDocument): object {
  return {
    createdAt: document.createdAt,
    deliveredAt: document.deliveredAt,
    freightCalculationId: document.freightCalculationId,
    id: document.id,
    loadedAt: document.loadedAt,
    nfeDocumentId: document.nfeDocumentId,
    releasedAt: document.releasedAt,
    returnedAt: document.returnedAt,
    returnReason: document.returnReason,
    separatedAt: document.separatedAt,
    separationStatus: document.separationStatus,
    stopId: document.stopId,
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

function serializeTripStopDetail(stop: TripStopDetail): object {
  return { ...stop, documents: stop.documents.map(serializeTripDocumentDetail) }
}

function serializeDeliveryAddressOverride(record: DeliveryAddressOverrideRecord): object {
  return { ...record }
}

function serializeReturnedWithActiveCteEntry(
  entry: ListReturnedWithActiveCteResult['entries'][number],
): object {
  return { ...entry }
}

function serializeTransitionResult(result: TransitionTripDocumentResult): object {
  return { document: serializeTripDocument(result.document), tripStatus: result.tripStatus }
}

function serializeBatchResult(result: TransitionTripDocumentsBatchResult): object {
  return { items: result.items.map(serializeBatchItem), tripStatus: result.tripStatus }
}

function serializeBatchItem(item: TripDocumentBatchItemOutcome): object {
  return { ...item }
}

function serializeTripStop(stop: TripStopSummary): object {
  return { ...stop }
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
