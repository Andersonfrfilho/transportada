/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as escritas da separação, sempre dentro da transação que já travou a chegada e as
 * notas. Só o que mudou é gravado, e cada mudança deixa um evento (ADR-0067).
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { cargoArrivalEvents } from '../../database/cargo-arrival-event.schema.js'
import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivals } from '../../database/cargo-arrival.schema.js'
import {
  CARGO_ARRIVAL_DOCUMENT_STATE,
  CARGO_ARRIVAL_EVENT_KIND,
  CARGO_ARRIVAL_STATUS,
} from '../../shared/cargo-arrival.constant.js'
import type {
  AssignCargoArrivalRouteRecordParams,
  CloseCargoArrivalRecordParams,
  TransitionCargoArrivalRecordParams,
} from '../application/cargo-arrival-request.types.js'
import type { CargoArrivalBatchRow } from '../domain/cargo-arrival-transition.policy.js'
import {
  buildArrivalDocumentFilters,
  insertArrivalAudit,
  type Transaction,
} from './cargo-arrival-persistence.support.js'

const CLOSED_AUDIT_ACTION = 'cargo-arrival.closed'
/** Relógio do banco, nunca o do processo: réplicas defasadas não gravam a separação antes da conferência. */
const DATABASE_NOW = sql`now()`
const SEPARATED_NOT_BEFORE_RECEIVED = sql`greatest(${cargoArrivalDocuments.receivedAt}, now())`

export async function applyTransition(
  transaction: Transaction,
  input: {
    readonly changed: readonly CargoArrivalBatchRow[]
    readonly params: TransitionCargoArrivalRecordParams
  },
): Promise<void> {
  const { changed, params } = input
  if (changed.length === 0) return
  const isReceiving = params.to === CARGO_ARRIVAL_DOCUMENT_STATE.received
  await transaction
    .update(cargoArrivalDocuments)
    .set({
      ...(isReceiving
        ? { receivedAt: DATABASE_NOW }
        : { separatedAt: SEPARATED_NOT_BEFORE_RECEIVED }),
      separationState: params.to,
      updatedAt: params.now,
    })
    .where(
      and(
        ...buildArrivalDocumentFilters(params),
        inArray(
          cargoArrivalDocuments.id,
          changed.map((row) => row.id),
        ),
      ),
    )
  await transaction.insert(cargoArrivalEvents).values(
    changed.map((row) => ({
      actorUserId: params.actorUserId,
      arrivalDocumentId: row.id,
      arrivalId: params.arrivalId,
      channel: params.channel,
      companyId: params.companyId,
      fromState: row.separationState,
      kind: isReceiving
        ? CARGO_ARRIVAL_EVENT_KIND.documentReceived
        : CARGO_ARRIVAL_EVENT_KIND.documentSeparated,
      occurredAt: params.now,
      toState: params.to,
    })),
  )
}

export async function applyRoute(
  transaction: Transaction,
  input: {
    readonly changed: readonly { readonly id: string; readonly routeName: string | null }[]
    readonly params: AssignCargoArrivalRouteRecordParams
  },
): Promise<void> {
  const { changed, params } = input
  if (changed.length === 0) return
  await transaction
    .update(cargoArrivalDocuments)
    .set({ routeName: params.routeName, updatedAt: params.now })
    .where(
      and(
        ...buildArrivalDocumentFilters(params),
        inArray(
          cargoArrivalDocuments.id,
          changed.map((row) => row.id),
        ),
      ),
    )
  await transaction.insert(cargoArrivalEvents).values(
    changed.map((row) => ({
      actorUserId: params.actorUserId,
      arrivalDocumentId: row.id,
      arrivalId: params.arrivalId,
      channel: params.channel,
      companyId: params.companyId,
      details: { fromRouteName: row.routeName, toRouteName: params.routeName },
      kind: CARGO_ARRIVAL_EVENT_KIND.routeAssigned,
      occurredAt: params.now,
    })),
  )
}

export async function markClosed(
  transaction: Transaction,
  input: { readonly contractorId: string; readonly params: CloseCargoArrivalRecordParams },
): Promise<void> {
  const { contractorId, params } = input
  await transaction
    .update(cargoArrivals)
    .set({ status: CARGO_ARRIVAL_STATUS.closed, updatedAt: params.now })
    .where(
      and(eq(cargoArrivals.companyId, params.companyId), eq(cargoArrivals.id, params.arrivalId)),
    )
  await transaction.insert(cargoArrivalEvents).values({
    actorUserId: params.actorUserId,
    arrivalId: params.arrivalId,
    channel: params.channel,
    companyId: params.companyId,
    kind: CARGO_ARRIVAL_EVENT_KIND.arrivalClosed,
    occurredAt: params.now,
  })
  await insertArrivalAudit(transaction, {
    action: CLOSED_AUDIT_ACTION,
    actorUserId: params.actorUserId,
    arrivalId: params.arrivalId,
    companyId: params.companyId,
    contractorId,
    correlationId: params.correlationId,
    metadata: {},
  })
}
