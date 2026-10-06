/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a primeira separação. O lote devolve um resultado por nota — uma recusada nunca
 * derruba as outras —; a nota avulsa transforma a recusa em código estável.
 */
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import {
  CARGO_ARRIVAL_REFUSAL_REASON,
  type CargoArrivalTransitionTarget,
} from '../domain/cargo-arrival-transition.policy.js'
import {
  CARGO_ARRIVAL_DOCUMENT_NOT_FOUND,
  CargoArrivalDocumentNotFoundError,
  CargoArrivalDocumentsNotInArrivalError,
  CargoArrivalHasPendingDocumentsError,
  CargoArrivalNotFoundError,
  CargoArrivalTransitionRefusedError,
  toDocumentDetails,
} from '../domain/cargo-arrival.error.js'
import type { CargoArrivalSeparationRepositoryPort } from './cargo-arrival.port.js'
import type {
  AssignCargoArrivalRouteParams,
  BatchCargoArrivalStatusParams,
  CloseCargoArrivalParams,
} from './cargo-arrival-request.types.js'
import type { CargoArrivalDocumentOutcome } from './cargo-arrival.types.js'

type Dependencies = {
  readonly channel: CargoArrivalChannel
  readonly now: () => Date
  readonly repository: CargoArrivalSeparationRepositoryPort
}

type Outcomes = { readonly results: readonly CargoArrivalDocumentOutcome[] }

export function createBatchCargoArrivalStatusUseCase(dependencies: Dependencies): {
  readonly execute: (params: BatchCargoArrivalStatusParams) => Promise<Outcomes>
} {
  return {
    async execute({ arrivalId, context, documentIds, to }) {
      const result = await dependencies.repository.transition({
        actorUserId: context.userId,
        arrivalId,
        channel: dependencies.channel,
        companyId: context.companyId,
        documentIds,
        now: dependencies.now(),
        to,
      })
      if (result.kind === 'arrival_not_found') throw new CargoArrivalNotFoundError()
      return { results: result.results }
    },
  }
}

export type DocumentStateResult = {
  readonly documentId: string
  readonly outcome: 'changed' | 'unchanged'
  readonly state: CargoArrivalTransitionTarget
}

export function createChangeCargoArrivalDocumentStateUseCase(dependencies: Dependencies): {
  readonly execute: (
    params: Omit<BatchCargoArrivalStatusParams, 'documentIds'> & { readonly documentId: string },
  ) => Promise<DocumentStateResult>
} {
  const batch = createBatchCargoArrivalStatusUseCase(dependencies)
  return {
    async execute({ documentId, ...params }) {
      const { results } = await batch.execute({ ...params, documentIds: [documentId] })
      const [result] = results
      if (result === undefined || result.outcome === 'refused') {
        const reason =
          result?.outcome === 'refused' ? result.reason : CARGO_ARRIVAL_DOCUMENT_NOT_FOUND
        if (reason === CARGO_ARRIVAL_DOCUMENT_NOT_FOUND)
          throw new CargoArrivalDocumentNotFoundError()
        throw new CargoArrivalTransitionRefusedError(reason)
      }
      return { documentId, outcome: result.outcome, state: params.to }
    },
  }
}

export function createAssignCargoArrivalRouteUseCase(dependencies: Dependencies): {
  readonly execute: (params: AssignCargoArrivalRouteParams) => Promise<Outcomes>
} {
  return {
    async execute({ arrivalId, context, documentIds, routeName }) {
      const result = await dependencies.repository.assignRoute({
        actorUserId: context.userId,
        arrivalId,
        channel: dependencies.channel,
        companyId: context.companyId,
        documentIds,
        now: dependencies.now(),
        routeName,
      })
      if (result.kind === 'arrival_not_found') throw new CargoArrivalNotFoundError()
      if (result.kind === 'closed') {
        throw new CargoArrivalTransitionRefusedError(CARGO_ARRIVAL_REFUSAL_REASON.closed)
      }
      if (result.kind === 'missing') {
        throw new CargoArrivalDocumentsNotInArrivalError(
          toDocumentDetails(indexesOf(documentIds, result.documentIds)),
        )
      }
      return { results: result.results }
    },
  }
}

export type CloseCargoArrivalResult = {
  readonly arrivalId: string
  readonly outcome: 'changed' | 'unchanged'
}

export function createCloseCargoArrivalUseCase(dependencies: Dependencies): {
  readonly execute: (params: CloseCargoArrivalParams) => Promise<CloseCargoArrivalResult>
} {
  return {
    async execute({ arrivalId, context, correlationId }) {
      const result = await dependencies.repository.close({
        actorUserId: context.userId,
        arrivalId,
        channel: dependencies.channel,
        companyId: context.companyId,
        correlationId,
        now: dependencies.now(),
      })
      if (result.kind === 'arrival_not_found') throw new CargoArrivalNotFoundError()
      if (result.kind === 'pending') {
        throw new CargoArrivalHasPendingDocumentsError(
          toDocumentDetails(result.documentIds.map((message, index) => ({ index, message }))),
        )
      }
      return { arrivalId, outcome: result.kind === 'closed' ? 'changed' : 'unchanged' }
    },
  }
}

function indexesOf(
  requested: readonly string[],
  missing: readonly string[],
): readonly { readonly index: number; readonly message: string }[] {
  const missingSet = new Set(missing)
  return requested.flatMap((documentId, index) =>
    missingSet.has(documentId) ? [{ index, message: CARGO_ARRIVAL_DOCUMENT_NOT_FOUND }] : [],
  )
}
