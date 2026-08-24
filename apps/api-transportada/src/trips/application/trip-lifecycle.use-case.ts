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
import { listTripStops, type ListTripStopsPort } from './list-trip-stops.use-case.js'
import { planTripRoute, type PlanTripRoutePort } from './plan-trip-route.use-case.js'
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
  readonly documentRepository: TripDocumentTransitionPort
  readonly locationRepository: FindTripLocationByAccessKeyPort
  readonly routeRepository: CancelTripPort & DispatchTripPort & PlanTripRoutePort
  readonly stopRepository: ListTripStopsPort
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
        return cancelTrip({
          companyId: input.context.companyId,
          repository: dependencies.routeRepository,
          tripId: input.tripId,
        })
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
    return: { execute: document('return') },
    separate: { execute: document('separate') },
  }
}
