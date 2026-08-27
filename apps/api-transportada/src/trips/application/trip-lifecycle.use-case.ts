/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import type { TripDocumentAction } from '../domain/trip-state.policy.js'
import { cancelTrip, type CancelTripPort } from './cancel-trip.use-case.js'
import { dispatchTrip, type DispatchTripPort } from './dispatch-trip.use-case.js'
import {
  findTripLocationByAccessKey,
  type FindTripLocationByAccessKeyPort,
} from './find-trip-location-by-access-key.use-case.js'
import {
  listDeliveryAddressHistory,
  type ListDeliveryAddressHistoryPort,
} from './list-delivery-address-history.use-case.js'
import { listTripStops, type ListTripStopsPort } from './list-trip-stops.use-case.js'
import {
  overrideDeliveryAddress,
  type OverrideDeliveryAddressPort,
} from './override-delivery-address.use-case.js'
import { planTripRoute, type PlanTripRoutePort } from './plan-trip-route.use-case.js'
import { reorderTripStops, type ReorderTripStopsPort } from './reorder-trip-stops.use-case.js'
import type { SuggestDeliveryChargesPort } from '../../delivery-clients/application/suggest-delivery-charges.use-case.js'
import {
  transitionTripDocument,
  type TripDocumentTransitionPort,
} from './transition-trip-document.use-case.js'
import {
  transitionTripDocumentsBatch,
  type TripDocumentBatchTransitionPort,
} from './transition-trip-documents-batch.use-case.js'

export type TripLifecycleDependencies = {
  readonly batchRepository: TripDocumentBatchTransitionPort
  readonly deliveryAddressOverrideRepository: ListDeliveryAddressHistoryPort &
    OverrideDeliveryAddressPort
  readonly documentRepository: TripDocumentTransitionPort
  readonly locationRepository: FindTripLocationByAccessKeyPort
  /** O rastro ao vivo (ADR-0050 §5) — separado da busca por chave, que é outra coisa. */
  readonly trackingRepository: {
    purgeByTrip(input: { readonly companyId: string; readonly tripId: string }): Promise<void>
  }
  readonly routeRepository: CancelTripPort &
    DispatchTripPort &
    PlanTripRoutePort &
    ReorderTripStopsPort
  readonly stopRepository: ListTripStopsPort
  /** Spec 060 D4b: a entrega concluída propõe a taxa recorrente. Ausente, nada muda na entrega. */
  readonly suggestCharges?: SuggestDeliveryChargesPort
}

/**
 * Une os use cases puros da T006–T010 (cada um testado sozinho, com port falso) ao formato que as
 * rotas esperam: `execute(input)` com `context` já resolvido em `companyId`/`actorUserId`. Nenhuma
 * regra nova mora aqui — é encanamento, e por isso não tem teste próprio além do que os use cases
 * e o `routes.contract.ts` já cobrem juntos.
 */
export function createTripLifecycleUseCase(dependencies: TripLifecycleDependencies) {
  const document = (action: TripDocumentAction) =>
    async function execute(input: {
      readonly context: CompanyContext
      readonly documentId: string
      readonly note?: string | null
      readonly returnReason?: string | null
      readonly tripId: string
    }) {
      return transitionTripDocument({
        action,
        actorUserId: input.context.userId,
        ...(dependencies.suggestCharges === undefined
          ? {}
          : { suggestCharges: dependencies.suggestCharges }),
        companyId: input.context.companyId,
        documentId: input.documentId,
        repository: dependencies.documentRepository,
        tripId: input.tripId,
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.returnReason === undefined ? {} : { returnReason: input.returnReason }),
      })
    }

  return {
    batchStatus: {
      async execute(input: {
        readonly action: TripDocumentAction
        readonly context: CompanyContext
        readonly documentIds: readonly string[]
        readonly note?: string | null
        readonly returnReason?: string | null
        readonly tripId: string
      }) {
        return transitionTripDocumentsBatch({
          action: input.action,
          actorUserId: input.context.userId,
          companyId: input.context.companyId,
          documentIds: input.documentIds,
          repository: dependencies.batchRepository,
          tripId: input.tripId,
          ...(input.note === undefined ? {} : { note: input.note }),
          ...(input.returnReason === undefined ? {} : { returnReason: input.returnReason }),
        })
      },
    },
    cancel: {
      async execute(input: { readonly context: CompanyContext; readonly tripId: string }) {
        const result = await cancelTrip({
          companyId: input.context.companyId,
          repository: dependencies.routeRepository,
          tripId: input.tripId,
        })

        /**
         * ADR-0050 §5: a viagem cancelada apaga o rastro igual à concluída. O expurgo roda **depois**
         * da transição e fora dela — ele varre uma tabela que só o portal lê, e segurar a resposta do
         * cancelamento (que é incidente, quase sempre com alguém esperando) por causa disso trocaria
         * o custo de lugar. Falhar aqui não desfaz o cancelamento; a linha fica para o próximo
         * fechamento levar.
         */
        if (result.tripStatus === 'cancelled') {
          await dependencies.trackingRepository.purgeByTrip({
            companyId: input.context.companyId,
            tripId: input.tripId,
          })
        }

        return result
      },
    },
    deliver: { execute: document('deliver') },
    dispatch: {
      async execute(input: {
        readonly context: CompanyContext
        readonly force?: boolean
        readonly forceReason?: string | null
        readonly tripId: string
      }) {
        return dispatchTrip({
          actorUserId: input.context.userId,
          companyId: input.context.companyId,
          repository: dependencies.routeRepository,
          tripId: input.tripId,
          ...(input.force === undefined ? {} : { force: input.force }),
          ...(input.forceReason === undefined ? {} : { forceReason: input.forceReason }),
        })
      },
    },
    listDeliveryAddressHistory: {
      async execute(input: {
        readonly context: CompanyContext
        readonly documentId: string
        readonly tripId: string
      }) {
        return listDeliveryAddressHistory({
          companyId: input.context.companyId,
          repository: dependencies.deliveryAddressOverrideRepository,
          tripDocumentId: input.documentId,
        })
      },
    },
    listStops: {
      async execute(input: { readonly context: CompanyContext; readonly tripId: string }) {
        return listTripStops({
          companyId: input.context.companyId,
          repository: dependencies.stopRepository,
          tripId: input.tripId,
        })
      },
    },
    load: { execute: document('load') },
    overrideDeliveryAddress: {
      async execute(input: {
        readonly context: CompanyContext
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
      }) {
        return overrideDeliveryAddress({
          actorUserId: input.context.userId,
          companyId: input.context.companyId,
          newAddress: input.newAddress,
          newLabel: input.newLabel,
          reason: input.reason,
          repository: dependencies.deliveryAddressOverrideRepository,
          requestedBy: input.requestedBy,
          tripDocumentId: input.documentId,
        })
      },
    },
    locateByAccessKey: {
      async execute(input: { readonly accessKey: string; readonly context: CompanyContext }) {
        return findTripLocationByAccessKey({
          accessKey: input.accessKey,
          companyId: input.context.companyId,
          repository: dependencies.locationRepository,
        })
      },
    },
    planRoute: {
      async execute(input: { readonly context: CompanyContext; readonly tripId: string }) {
        return planTripRoute({
          companyId: input.context.companyId,
          repository: dependencies.routeRepository,
          tripId: input.tripId,
        })
      },
    },
    reorderStops: {
      async execute(input: {
        readonly context: CompanyContext
        readonly stopIds: readonly string[]
        readonly tripId: string
      }) {
        return reorderTripStops({
          companyId: input.context.companyId,
          orderedStopIds: input.stopIds,
          repository: dependencies.routeRepository,
          tripId: input.tripId,
        })
      },
    },
    return: { execute: document('return') },
    separate: { execute: document('separate') },
  }
}
