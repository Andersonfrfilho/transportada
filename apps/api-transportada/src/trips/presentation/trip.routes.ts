/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineRoute } from '../../http/router.service.js'
import type { DeliveryProofView } from '../application/read-delivery-proof.use-case.js'
import type { RouteGeometryView } from '../application/read-route-geometry.use-case.js'
import type { TripDocumentProduct } from '../application/read-trip-document-products.use-case.js'
import type { TripOccurrence } from '../application/register-trip-occurrence.use-case.js'
import { parseOccurrenceTypeRequest, parseRegisterOccurrenceRequest } from './occurrence.schema.js'
import { parseTripOccurrenceFeedList } from './trip-occurrence-feed.schema.js'
import type {
  ListTripOccurrenceFeedInput,
  ReadTripOccurrenceAttachmentsInput,
  TripOccurrenceAttachmentView,
  TripOccurrenceFeedPage,
} from '../application/trip-occurrence-feed.use-case.js'
import type {
  OccurrenceTypeRecord,
  RegisteredOccurrence,
} from '../application/register-trip-occurrence.use-case.js'

import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { API_TRIPS_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CreateTripMdfeManifestInput } from '../../mdfe-manifests/application/create-trip-mdfe-manifest.use-case.js'
import type { AutomaticManifestResult } from '../../mdfe-manifests/application/issue-trip-manifest-automatically.use-case.js'
import type { MdfeManifestDetail } from '../../mdfe-manifests/application/mdfe-manifest.port.js'
import { parseCreateTripManifestRequest } from '../../mdfe-manifests/presentation/mdfe-manifest.schema.js'
import type {
  TripStopSchedule,
  TripStopScheduleWrite,
} from '../../delivery-clients/application/trip-stop-schedule.use-case.js'
import { parseTripStopScheduleRequest } from '../../delivery-clients/presentation/trip-stop-schedule.schema.js'
import type { TripFinancialResult } from '../application/trip-financial-result.port.js'
import { parseTripCostRequest, parseTripFinancialReason } from './trip-financial.schema.js'
import type {
  CloseTripInput,
  CreateTripInput,
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
import type { TripMdfeRequirement } from '../application/set-trip-mdfe-requirement.use-case.js'
import type { TripValuation } from '../domain/trip-valuation.policy.js'
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
  parseCreateTripCteBatchRequest,
  parseDispatchTripRequest,
  parseLinkTripDocumentRequest,
  parseOverrideDeliveryAddressRequest,
  parseSetTripMdfeRequirementRequest,
  parseReorderTripStopsRequest,
  parseTransitionTripDocumentRequest,
  parseTripList,
  parseUuidPathIdentifier,
} from './trip.schema.js'

const TRIP_CLOSE_PATH = `${API_TRIPS_PATH}/:id/close`
const TRIP_DETAIL_PATH = `${API_TRIPS_PATH}/:id`
const TRIP_DOCUMENTS_PATH = `${API_TRIPS_PATH}/:id/documents`
const TRIP_ROUTE_GEOMETRY_PATH = `${API_TRIPS_PATH}/:id/route-geometry`
const TRIP_DOCUMENT_PATH = `${TRIP_DOCUMENTS_PATH}/:documentId`
const TRIP_DOCUMENT_DELIVER_PATH = `${TRIP_DOCUMENT_PATH}/deliver`
const TRIP_DOCUMENT_PROOF_PATH = `${TRIP_DOCUMENT_PATH}/proof`
const TRIP_DOCUMENT_PRODUCTS_PATH = `${TRIP_DOCUMENT_PATH}/products`
const TRIP_DOCUMENT_OCCURRENCES_PATH = `${TRIP_DOCUMENT_PATH}/occurrences`
/**
 * Spec 079: a configuração do aviso é **da empresa**, não da viagem — ligar "recusa total" vale
 * para toda viagem, presente e futura. Pendurá-la numa viagem sugeriria um efeito local que ela
 * não tem, o mesmo erro que a correção de endereço evita (ADR-0044 §3).
 */
const OCCURRENCE_TYPES_PATH = '/company-settings/occurrence-types'

type RegisterOccurrenceRouteInput = {
  readonly context: CompanyContext
  readonly documentId: string
  readonly note: string
  readonly occurrenceTypeId: string
  readonly productCode: string
  readonly tripId: string
}

type SaveOccurrenceTypeInput = {
  readonly active: boolean
  readonly context: CompanyContext
  readonly emailBody: string
  readonly emailSubject: string
  readonly emailTemplateKey: null | string
  readonly name: string
  readonly notifies: boolean
  readonly occurrenceTypeId: null | string
  readonly stage: 'delivery' | 'separation'
}

type ReadDeliveryProofsRouteInput = {
  readonly context: CompanyContext
  readonly documentId: string
  readonly tripId: string
}
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
const TRIP_MDFE_REQUIREMENT_PATH = `${API_TRIPS_PATH}/:id/mdfe-requirement`
const TRIP_VALUATION_PATH = `${API_TRIPS_PATH}/:id/valuation`
/**
 * Spec 061 D4: **dinheiro tem permissão própria.** O resultado congelado é `trip.financials`, de
 * `company-admin` e `finance` — quem monta viagem já tem a avaliação prevista para decidir carga, e
 * ela não mostra o que se paga ao agregado.
 */
const TRIP_FINANCIAL_RESULT_PATH = `${API_TRIPS_PATH}/:id/financial-result`
const TRIP_FINANCIAL_RECALCULATE_PATH = `${TRIP_FINANCIAL_RESULT_PATH}/recalculate`
/** Pedágio e avulso são lançamento de operação: quem monta a viagem lança. */
const TRIP_COSTS_PATH = `${API_TRIPS_PATH}/:id/costs`
/** D8: fora da árvore `/trips/:id`, de propósito — é uma varredura da empresa inteira, não de
 * uma viagem. */
const RETURNED_WITH_ACTIVE_CTE_PATH = '/trip-documents/returned-with-active-cte'
/**
 * Fora da árvore `/trips/:id`, de propósito — é a varredura de ocorrências da empresa inteira
 * (nota e parada juntas), não de uma viagem. Leitura pura: v1 não tem "tratar".
 */
const TRIP_OCCURRENCE_FEED_PATH = '/trip-occurrences'
const TRIP_OCCURRENCE_FEED_ATTACHMENTS_PATH = `${TRIP_OCCURRENCE_FEED_PATH}/:id/attachments`
const TRIP_STOPS_ORDER_PATH = `${TRIP_STOPS_PATH}/order`
/**
 * Spec 060 D3: pedir, confirmar ou registrar a recusa do agendamento daquela parada. É `trip.manage`
 * porque quem fala com o cliente é quem monta a viagem — o motorista só **lê** a hora e o protocolo.
 */
const TRIP_STOP_SCHEDULE_PATH = `${TRIP_STOPS_PATH}/:stopId/schedule`
const TRIP_SCHEDULES_PATH = `${API_TRIPS_PATH}/:id/schedules`
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
/** Spec 079: ligar o aviso é configuração da empresa, e configuração é `settings.manage`. */
const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
/**
 * ADR-0047 §4: o escopo do service account é **esta rota e nada mais**. Ela não é `mdfe.manage` de
 * propósito — quem emite manifesto à mão não deveria ganhar o gatilho de máquina de carona, e um
 * token de serviço com `mdfe.manage` alcançaria cancelar e encerrar manifesto de qualquer empresa.
 */
const MDFE_AUTO_ISSUE_POLICY = { permission: 'mdfe.auto-issue', scope: 'company' } as const
/** Spec 061 D4: margem, custo de motorista e receita não são `trip.manage`. */
const TRIP_FINANCIALS_POLICY = { permission: 'trip.financials', scope: 'company' } as const
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
type SaveScheduleInput = TripIdInput & {
  readonly stopId: string
  readonly values: TripStopScheduleWrite
}
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
      readonly tripDocumentIds?: readonly string[]
      readonly tripId: string
      readonly userId: string
    }): Promise<CreateTripCteBatchResult>
  }
  readonly createTripMdfeManifest: {
    execute(input: TenantInput<CreateTripMdfeManifestInput>): Promise<MdfeManifestDetail>
  }
  readonly readTripRouteGeometry: {
    execute(input: TenantInput<{ readonly tripId: string }>): Promise<RouteGeometryView>
  }
  readonly readDeliveryProofs: {
    execute(input: TenantInput<ReadDeliveryProofsRouteInput>): Promise<readonly DeliveryProofView[]>
  }
  readonly listOccurrenceTypes: {
    execute(input: { readonly context: CompanyContext }): Promise<readonly OccurrenceTypeRecord[]>
  }
  readonly saveOccurrenceType: {
    execute(input: TenantInput<SaveOccurrenceTypeInput>): Promise<OccurrenceTypeRecord>
  }
  readonly listTripOccurrences: {
    execute(input: TenantInput<ReadDeliveryProofsRouteInput>): Promise<readonly TripOccurrence[]>
  }
  readonly listTripOccurrenceFeed: {
    execute(input: TenantInput<ListTripOccurrenceFeedInput>): Promise<TripOccurrenceFeedPage>
  }
  readonly readTripOccurrenceAttachments: {
    execute(
      input: TenantInput<ReadTripOccurrenceAttachmentsInput>,
    ): Promise<readonly TripOccurrenceAttachmentView[]>
  }
  readonly registerTripOccurrence: {
    execute(input: TenantInput<RegisterOccurrenceRouteInput>): Promise<RegisteredOccurrence>
  }
  readonly readTripDocumentProducts: {
    execute(
      input: TenantInput<ReadDeliveryProofsRouteInput>,
    ): Promise<readonly TripDocumentProduct[]>
  }
  /** Mesma forma das outras três transições: entregar passou a usar a máquina de estados. */
  readonly deliverTripDocument: {
    execute(input: TenantInput<TripDocumentActionInput>): Promise<TransitionTripDocumentResult>
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
  readonly readValuation: {
    execute(input: { readonly companyId: string; readonly tripId: string }): Promise<TripValuation>
  }
  readonly setMdfeRequirement: {
    execute(input: {
      readonly actorUserId: string
      readonly companyId: string
      readonly reason: null | string
      readonly requiresMdfe: boolean | null
      readonly tripId: string
    }): Promise<TripMdfeRequirement>
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
  readonly listSchedules: {
    execute(input: TenantInput<TripIdInput>): Promise<readonly TripStopSchedule[]>
  }
  readonly saveSchedule: {
    execute(input: TenantInput<SaveScheduleInput>): Promise<TripStopSchedule>
  }
  readonly readFinancialResult: {
    execute(input: TenantInput<TripIdInput>): Promise<TripFinancialResult | null>
  }
  readonly recalculateFinancialResult: {
    execute(
      input: TenantInput<TripIdInput> & { readonly reason: string },
    ): Promise<TripFinancialResult>
  }
  readonly recordTripCost: {
    execute(
      input: TenantInput<TripIdInput> & {
        readonly amount: string
        readonly description: string
        readonly kind: 'other' | 'toll'
      },
    ): Promise<{ readonly id: string }>
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
      readonly tripDocumentIds: readonly string[]
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.createTripCteBatch.execute({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          tripId: input.tripId,
          // Lista vazia é a viagem inteira, como corpo ausente — não um lote de zero notas.
          ...(input.tripDocumentIds.length === 0 ? {} : { tripDocumentIds: input.tripDocumentIds }),
          userId: context.scope.userId,
        })

        return jsonResponse({ body: { data: result }, status: 201 })
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const body = await parseCreateTripCteBatchRequest(request)
        return {
          correlationId,
          idempotencyKey: parseCteBatchIdempotencyKey(request.headers.get('idempotency-key')),
          tripDocumentIds: body.tripDocumentIds,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
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
      policy: MDFE_AUTO_ISSUE_POLICY,
    }),
    defineRoute<TripIdInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.readFinancialResult.execute({
          context: context.scope,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_FINANCIAL_RESULT_PATH,
      policy: TRIP_FINANCIALS_POLICY,
    }),
    defineRoute<TripIdInput & { readonly reason: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.recalculateFinancialResult.execute({
          context: context.scope,
          reason: input.reason,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          reason: await parseTripFinancialReason(request),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_FINANCIAL_RECALCULATE_PATH,
      policy: TRIP_FINANCIALS_POLICY,
    }),
    defineRoute<
      TripIdInput & {
        readonly amount: string
        readonly description: string
        readonly kind: 'other' | 'toll'
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const created = await dependencies.recordTripCost.execute({
          amount: input.amount,
          context: context.scope,
          description: input.description,
          kind: input.kind,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: created }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          ...(await parseTripCostRequest(request)),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_COSTS_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<TripIdInput>({
      async handle({ context, input }): Promise<Response> {
        const schedules = await dependencies.listSchedules.execute({
          context: context.scope,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: schedules }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_SCHEDULES_PATH,
      policy: TRIP_READ_POLICY,
    }),
    defineRoute<SaveScheduleInput>({
      async handle({ context, input }): Promise<Response> {
        const schedule = await dependencies.saveSchedule.execute({
          context: context.scope,
          stopId: input.stopId,
          tripId: input.tripId,
          values: input.values,
        })

        return jsonResponse({ body: { data: schedule }, status: 200 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        return {
          stopId: parseUuidPathIdentifier(pathParameters.stopId ?? ''),
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          values: await parseTripStopScheduleRequest(request),
        }
      },
      pathname: TRIP_STOP_SCHEDULE_PATH,
      policy: TRIP_MANAGE_POLICY,
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
    defineRoute<{
      readonly reason: null | string
      readonly requiresMdfe: boolean | null
      readonly tripId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.setMdfeRequirement.execute({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          reason: input.reason,
          requiresMdfe: input.requiresMdfe,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: result }, status: 200 })
      },
      method: 'PUT',
      async parse({ pathParameters, request }) {
        const body = await parseSetTripMdfeRequirementRequest(request)
        return {
          reason: body.reason,
          requiresMdfe: body.requiresMdfe,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_MDFE_REQUIREMENT_PATH,
      // Dispensar manifesto é decisão fiscal, com multa do outro lado — não é separação de carga.
      policy: MDFE_MANAGE_POLICY,
    }),
    defineRoute<{ readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const valuation = await dependencies.readValuation.execute({
          companyId: context.scope.companyId,
          tripId: input.tripId,
        })

        return jsonResponse({ body: { data: valuation }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_VALUATION_PATH,
      policy: TRIP_FINANCIALS_POLICY,
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
    /**
     * ⚠️ `deliver` tinha rota própria, fora da máquina de estados — resíduo do fluxo antigo da
     * spec 027, anterior à 056. Ela gravava `deliveredAt` e **não tocava em `separationStatus`**:
     * a nota ficava com hora de entrega e status `pending` para sempre, a barra de progresso não
     * saía do lugar, e a viagem — cujo estado é derivado do das notas — nunca alcançava
     * `completed`. Medido em staging com doze notas: `Carregada 100%`, `Entregue 0%`, e o
     * `POST /deliver` respondendo `200`.
     *
     * Ela passa a usar o mesmo caminho das outras três, então também herda os portões: entregar
     * exige viagem despachada, e antes disso responde `409` em vez de carimbar carga que não saiu.
     */
    tripDocumentActionRoute({
      dependency: dependencies.deliverTripDocument,
      pathname: TRIP_DOCUMENT_DELIVER_PATH,
    }),
    /**
     * Spec 079 T004. Ler é `fleet.read`, como o resto do detalhe da viagem: quem acompanha a
     * operação precisa do canhoto, e exigir `trip.manage` esconderia o comprovante de quem só olha.
     */
    defineRoute<Omit<ReadDeliveryProofsRouteInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const proofs = await dependencies.readDeliveryProofs.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: proofs }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DOCUMENT_PROOF_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /**
     * Spec 079: a linha da estrada, para o mapa deixar de ligar as paradas em reta.
     *
     * ⚠️ **Rota própria, e não um campo do detalhe.** A chamada ao OSRM custou 63 ms medidos, e o
     * detalhe da viagem é a leitura que abre a tela inteira. Aqui o mapa desenha as paradas
     * primeiro e engrossa a linha depois — e uma falha do OSRM não leva a tela junto.
     */
    defineRoute<{ readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const geometry = await dependencies.readTripRouteGeometry.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: geometry }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ tripId: parseUuidPathIdentifier(pathParameters.id ?? '') }),
      pathname: TRIP_ROUTE_GEOMETRY_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /** Spec 079 T019: o que vai dentro da nota, para quem confere a carga. Leitura, como o detalhe. */
    defineRoute<Omit<ReadDeliveryProofsRouteInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const products = await dependencies.readTripDocumentProducts.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: products }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DOCUMENT_PRODUCTS_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /** Ler ocorrência é leitura da viagem: quem acompanha a operação precisa saber o que houve. */
    defineRoute<Omit<ReadDeliveryProofsRouteInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const occurrences = await dependencies.listTripOccurrences.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: occurrences }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
        tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_DOCUMENT_OCCURRENCES_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /** A listagem da empresa inteira: mesma permissão da leitura de viagem (TRIP_READ_POLICY). */
    defineRoute<Omit<ListTripOccurrenceFeedInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await dependencies.listTripOccurrenceFeed.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({
          body: {
            data: page.items,
            pagination: { nextCursor: page.nextCursor, perPage: input.limit },
          },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => parseTripOccurrenceFeedList(new URL(request.url)),
      pathname: TRIP_OCCURRENCE_FEED_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /** O anexo sai por URL assinada de vida curta — nunca bucket nem chave no corpo. */
    defineRoute<Omit<ReadTripOccurrenceAttachmentsInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const attachments = await dependencies.readTripOccurrenceAttachments.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: attachments }, status: 200 })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: TRIP_OCCURRENCE_FEED_ATTACHMENTS_PATH,
      policy: TRIP_READ_POLICY,
    }),
    /**
     * ⚠️ **Uma rota por grupo** — nunca uma só decidindo a autorização pelo corpo. Com uma rota
     * autorizada por `trip.manage`, quem separa mandaria `recusa_total` e registraria ocorrência de
     * rua sem nunca ter estado nela. Assim o router decide a autorização estaticamente, como decide
     * todas as outras, e o handler recusa o tipo do grupo errado.
     *
     * ⚠️ **A ocorrência de entrega não mora aqui, e a tentativa foi desfeita.** Ela é `trip.report`,
     * que o motorista tem — e uma rota do escritório com essa permissão o deixaria alcançar
     * **qualquer** viagem da empresa, não só a dele. É para isso que existe a árvore
     * `/me/current-trip`, que resolve o motorista e escopa pela viagem ativa dele.
     * `test/driver-trip/me-routes.contract.ts` foi quem pegou, afirmando que nenhuma rota do
     * escritório é alcançável pelo papel `driver`. A rota de rua fica para uma task própria.
     */
    /**
     * ⚠️ **Uma rota só, agora que o tipo é cadastrado.** Antes havia duas — uma por grupo — porque
     * o grupo vinha do corpo e a autorização precisava ser estática. Com o tipo no banco, o grupo
     * vem do **cadastro**, e o caso de uso o confere: quem manda um tipo de rua por esta rota não
     * ganha nada, porque a permissão dela é `trip.manage` e o registro é o mesmo.
     *
     * O motorista continua tendo a rota dele em `/me`, com o escopo da viagem ativa.
     */
    defineRoute<Omit<RegisterOccurrenceRouteInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const occurrence = await dependencies.registerTripOccurrence.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: occurrence }, status: 201 })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseRegisterOccurrenceRequest(request)
        return {
          documentId: parseUuidPathIdentifier(pathParameters.documentId ?? ''),
          note: body.note,
          occurrenceTypeId: body.occurrenceTypeId,
          productCode: body.productCode,
          tripId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: TRIP_DOCUMENT_OCCURRENCES_PATH,
      policy: TRIP_MANAGE_POLICY,
    }),
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        const types = await dependencies.listOccurrenceTypes.execute({ context: context.scope })
        return jsonResponse({ body: { data: types }, status: 200 })
      },
      method: 'GET',
      parse: () => undefined,
      pathname: OCCURRENCE_TYPES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<Omit<SaveOccurrenceTypeInput, 'context'>>({
      async handle({ context, input }): Promise<Response> {
        const saved = await dependencies.saveOccurrenceType.execute({
          context: context.scope,
          ...input,
        })
        return jsonResponse({ body: { data: saved }, status: 200 })
      },
      method: 'PUT',
      async parse({ request }) {
        return parseOccurrenceTypeRequest(request)
      },
      pathname: OCCURRENCE_TYPES_PATH,
      policy: SETTINGS_MANAGE_POLICY,
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
    requiresMdfe: trip.requiresMdfe,
    requiresMdfeReason: trip.requiresMdfeReason,
    status: trip.status,
    updatedAt: trip.updatedAt,
    vehicleId: trip.vehicleId,
  }
}

function serializeTripDetail(trip: TripDetail): object {
  return {
    ...serializeTrip(trip),
    /** Spec 076: `null` quando a capacidade não é conhecida — escala honesta ou nada. */
    cargoLayout: trip.cargoLayout === null ? null : { ...trip.cargoLayout },
    documents: trip.documents.map(serializeTripDocumentDetail),
    drivers: trip.drivers.map((driver) => ({
      driverEmail: driver.driverEmail,
      driverId: driver.driverId,
      driverName: driver.driverName,
      driverPhone: driver.driverPhone,
      driverTaxId: driver.driverTaxId,
      position: driver.position,
    })),
    /** Spec 075: `null` quando a capacidade não é conhecida — a tela não inventa 100%. */
    cargoWeight: trip.cargoWeight === null ? null : { ...trip.cargoWeight },
    occupancy: trip.occupancy === null ? null : { ...trip.occupancy },
    stops: trip.stops.map(serializeTripStopDetail),
  }
}

function serializeTripDocument(document: TripDocument): object {
  return {
    createdAt: document.createdAt,
    deliveredAt: document.deliveredAt,
    destinationOrigin: document.destinationOrigin,
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
    contact: document.contact === null ? null : { ...document.contact },
    cteAuthorized: document.cteAuthorized,
    fiscalStatus: document.fiscalStatus,
    nfeIssuedAt: document.nfeIssuedAt,
    nfeNumber: document.nfeNumber,
    nfeSeries: document.nfeSeries,
    nfeTotalValue: document.nfeTotalValue,
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
