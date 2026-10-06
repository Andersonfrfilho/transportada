/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: a primeira separação. Toda escrita trava a chegada primeiro e as notas depois, em
 * ordem de id; o lote é decidido em memória e gravado com um UPDATE e um INSERT — nenhuma nota
 * recusada derruba as outras, e o no-op não gera evento.
 */
import { and, eq, inArray, ne } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_STATUS,
} from '../../shared/cargo-arrival.constant.js'
import type { CargoArrivalSeparationRepositoryPort } from '../application/cargo-arrival.port.js'
import type {
  AssignCargoArrivalRouteRecordParams,
  AssignCargoArrivalRouteRecordResult,
  CargoArrivalBatchRecordResult,
  CloseCargoArrivalRecordParams,
  CloseCargoArrivalRecordResult,
  TransitionCargoArrivalRecordParams,
} from '../application/cargo-arrival-request.types.js'
import { decideCargoArrivalBatch } from '../domain/cargo-arrival-transition.policy.js'
import {
  lockArrival,
  type Database,
  type Transaction,
} from './cargo-arrival-persistence.support.js'
import {
  applyRoute,
  applyTransition,
  markClosed,
} from './cargo-arrival-separation-write.support.js'

type ArrivalScope = {
  readonly arrivalId: string
  readonly companyId: string
}

export function buildArrivalDocumentFilters(params: ArrivalScope): ReturnType<typeof eq>[] {
  return [
    eq(cargoArrivalDocuments.companyId, params.companyId),
    eq(cargoArrivalDocuments.arrivalId, params.arrivalId),
  ]
}

function lockDocuments(
  transaction: Transaction,
  params: ArrivalScope & { readonly documentIds: readonly string[] },
) {
  return transaction
    .select({
      id: cargoArrivalDocuments.id,
      nfeDocumentId: cargoArrivalDocuments.nfeDocumentId,
      routeName: cargoArrivalDocuments.routeName,
      separationState: cargoArrivalDocuments.separationState,
    })
    .from(cargoArrivalDocuments)
    .where(
      and(
        ...buildArrivalDocumentFilters(params),
        inArray(cargoArrivalDocuments.nfeDocumentId, [...params.documentIds]),
      ),
    )
    .orderBy(cargoArrivalDocuments.id)
    .for('no key update')
}

export class DrizzleCargoArrivalSeparationRepository
  implements CargoArrivalSeparationRepositoryPort
{
  public constructor(private readonly database: Database) {}

  public async transition(
    params: TransitionCargoArrivalRecordParams,
  ): Promise<CargoArrivalBatchRecordResult> {
    return this.database.transaction(async (transaction) => {
      const arrival = await lockArrival(transaction, params)
      if (arrival === undefined) return { kind: 'arrival_not_found' }
      const rows = await lockDocuments(transaction, params)
      const decisions = decideCargoArrivalBatch({
        arrivalStatus: arrival.status,
        documentIds: params.documentIds,
        rows,
        to: params.to,
      })
      await applyTransition(transaction, { changed: decisions.changed, params })
      return { kind: 'done', results: decisions.results }
    })
  }

  public async assignRoute(
    params: AssignCargoArrivalRouteRecordParams,
  ): Promise<AssignCargoArrivalRouteRecordResult> {
    return this.database.transaction(async (transaction) => {
      const arrival = await lockArrival(transaction, params)
      if (arrival === undefined) return { kind: 'arrival_not_found' }
      if (arrival.status === CARGO_ARRIVAL_STATUS.closed) return { kind: 'closed' }
      const rows = await lockDocuments(transaction, params)
      const found = new Set(rows.map((row) => row.nfeDocumentId))
      const missing = params.documentIds.filter((documentId) => !found.has(documentId))
      if (missing.length > 0) return { documentIds: missing, kind: 'missing' }

      const changed = rows.filter((row) => row.routeName !== params.routeName)
      await applyRoute(transaction, { changed, params })
      const changedIds = new Set(changed.map((row) => row.nfeDocumentId))
      return {
        kind: 'done',
        results: params.documentIds.map((documentId) => ({
          documentId,
          outcome: changedIds.has(documentId) ? 'changed' : 'unchanged',
        })),
      }
    })
  }

  public async close(
    params: CloseCargoArrivalRecordParams,
  ): Promise<CloseCargoArrivalRecordResult> {
    return this.database.transaction(async (transaction) => {
      const arrival = await lockArrival(transaction, params)
      if (arrival === undefined) return { kind: 'arrival_not_found' }
      if (arrival.status === CARGO_ARRIVAL_STATUS.closed) return { kind: 'already_closed' }
      const pending = await transaction
        .select({ nfeDocumentId: cargoArrivalDocuments.nfeDocumentId })
        .from(cargoArrivalDocuments)
        .where(
          and(
            ...buildArrivalDocumentFilters(params),
            ne(cargoArrivalDocuments.separationState, CARGO_ARRIVAL_DOCUMENT_STATE.separated),
          ),
        )
        .orderBy(cargoArrivalDocuments.nfeDocumentId)
      if (pending.length > 0) {
        return { documentIds: pending.map((row) => row.nfeDocumentId), kind: 'pending' }
      }
      await markClosed(transaction, { contractorId: arrival.contractorId, params })
      return { kind: 'closed' }
    })
  }
}
