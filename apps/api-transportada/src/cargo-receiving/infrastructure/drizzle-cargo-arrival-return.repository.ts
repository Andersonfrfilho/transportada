/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8a (ADR-0094 §9.3): a transação da marcação "devolver ao contratante". A nota muda de
 * destino num UPDATE só, e cada mudança deixa evento na trilha (com o antes, o depois, a ocorrência
 * e a observação) e linha na auditoria — no-op não chega aqui.
 */
import { and, eq } from 'drizzle-orm'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { cargoArrivalEvents } from '../../database/cargo-arrival-event.schema.js'
import { tripDocumentOccurrences, tripOccurrenceCases } from '../../database/trip.schema.js'
import {
  CARGO_ARRIVAL_EVENT_KIND,
  type CargoArrivalEventKind,
} from '../../shared/cargo-arrival.constant.js'
import { TRIP_OCCURRENCE_STAGE } from '../../shared/trip-occurrence.constant.js'
import type {
  ApplyCargoArrivalReturnInput,
  ArrivalScope,
  CargoArrivalReturnTransactionPort,
  CargoArrivalReturnUnitOfWork,
} from '../application/cargo-arrival-occurrence.port.js'
import type { CargoArrivalReturnAction } from '../domain/cargo-arrival-return.policy.js'
import {
  lockOccurrenceArrival,
  lockOccurrenceDocument,
} from './cargo-arrival-occurrence-lock.support.js'
import {
  buildArrivalDocumentFilters,
  insertArrivalAudit,
  type Database,
  type Transaction,
} from './cargo-arrival-persistence.support.js'

type Scoped = { readonly scope: ArrivalScope; readonly transaction: Transaction }

const EVENT_KIND_BY_ACTION: Readonly<Record<CargoArrivalReturnAction, CargoArrivalEventKind>> = {
  complete: CARGO_ARRIVAL_EVENT_KIND.returnCompleted,
  mark: CARGO_ARRIVAL_EVENT_KIND.returnMarked,
  unmark: CARGO_ARRIVAL_EVENT_KIND.returnUnmarked,
}

async function applyReturn({
  input,
  scope,
  transaction,
}: Scoped & { readonly input: ApplyCargoArrivalReturnInput }): Promise<void> {
  await transaction
    .update(cargoArrivalDocuments)
    .set({
      returnOccurrenceId: input.next.occurrenceId,
      returnToContractor: input.next.state,
      updatedAt: input.now,
    })
    .where(
      and(
        ...buildArrivalDocumentFilters(scope),
        eq(cargoArrivalDocuments.id, input.arrivalDocumentId),
      ),
    )
  await recordReturnTrail({ input, scope, transaction })
}

async function recordReturnTrail({
  input,
  scope,
  transaction,
}: Scoped & { readonly input: ApplyCargoArrivalReturnInput }): Promise<void> {
  const occurrenceId = input.next.occurrenceId ?? input.from.occurrenceId
  await transaction.insert(cargoArrivalEvents).values({
    actorUserId: input.actorUserId,
    arrivalDocumentId: input.arrivalDocumentId,
    arrivalId: scope.arrivalId,
    channel: input.channel,
    companyId: scope.companyId,
    details: {
      fromReturn: input.from.state,
      occurrenceId,
      toReturn: input.next.state,
      ...(input.note === '' ? {} : { note: input.note }),
    },
    kind: EVENT_KIND_BY_ACTION[input.action],
    occurredAt: input.now,
  })
  await insertArrivalAudit(transaction, {
    action: `cargo-arrival.return-${input.action}`,
    actorUserId: input.actorUserId,
    arrivalId: scope.arrivalId,
    companyId: scope.companyId,
    contractorId: input.contractorId,
    correlationId: input.correlationId,
    metadata: {
      arrivalDocumentId: input.arrivalDocumentId,
      fromReturn: input.from.state,
      occurrenceId,
      toReturn: input.next.state,
    },
  })
}

/** Só a ocorrência de recebimento DESTA nota serve de motivo — o banco confere de novo pela FK. */
async function findDocumentOccurrence({
  arrivalDocumentId,
  occurrenceId,
  scope,
  transaction,
}: Scoped & { readonly arrivalDocumentId: string; readonly occurrenceId: string }) {
  const [row] = await transaction
    .select({ cancelledAt: tripDocumentOccurrences.cancelledAt, id: tripDocumentOccurrences.id })
    .from(tripDocumentOccurrences)
    .where(
      and(
        eq(tripDocumentOccurrences.companyId, scope.companyId),
        eq(tripDocumentOccurrences.cargoArrivalDocumentId, arrivalDocumentId),
        eq(tripDocumentOccurrences.id, occurrenceId),
        eq(tripDocumentOccurrences.stage, TRIP_OCCURRENCE_STAGE.receiving),
      ),
    )
  return row === undefined ? null : { id: row.id, isCancelled: row.cancelledAt !== null }
}

async function findCaseStatus({
  occurrenceId,
  scope,
  transaction,
}: Scoped & { readonly occurrenceId: string }) {
  const [row] = await transaction
    .select({ status: tripOccurrenceCases.status })
    .from(tripOccurrenceCases)
    .where(
      and(
        eq(tripOccurrenceCases.companyId, scope.companyId),
        eq(tripOccurrenceCases.occurrenceId, occurrenceId),
      ),
    )
  return row?.status ?? null
}

function createTransactionPort(scoped: Scoped): CargoArrivalReturnTransactionPort {
  const { scope, transaction } = scoped
  return {
    applyReturn: (input) => applyReturn({ ...scoped, input }),
    findCaseStatus: (occurrenceId) => findCaseStatus({ ...scoped, occurrenceId }),
    findDocumentOccurrence: (input) => findDocumentOccurrence({ ...scoped, ...input }),
    lockArrival: () => lockOccurrenceArrival(transaction, scope),
    lockDocument: (nfeDocumentId) =>
      lockOccurrenceDocument(transaction, { ...scope, nfeDocumentId }),
  }
}

export class DrizzleCargoArrivalReturnUnitOfWork implements CargoArrivalReturnUnitOfWork {
  public constructor(private readonly database: Database) {}

  public execute<TResult>({
    operation,
    scope,
  }: {
    readonly operation: (transaction: CargoArrivalReturnTransactionPort) => Promise<TResult>
    readonly scope: ArrivalScope
  }): Promise<TResult> {
    return this.database.transaction((transaction) =>
      operation(createTransactionPort({ scope, transaction })),
    )
  }
}
