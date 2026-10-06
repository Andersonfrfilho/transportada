/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF8a (ADR-0094 §9.3–9.5): marcar, desfazer e concluir a devolução ao contratante. A trava
 * é a da Fase 2 — a chegada, depois a nota —, e a decisão é da política pura. Quem pode cada ação é
 * da rota (desfazer é `occurrences.resolve`); aqui só o que vale para as três.
 */
import type { CargoArrivalChannel } from '../../shared/cargo-arrival.constant.js'
import { CARGO_ARRIVAL_RETURN_ACTION } from '../domain/cargo-arrival-return.policy.js'
import {
  CARGO_ARRIVAL_RETURN_REFUSAL,
  decideCargoArrivalReturn,
  type CargoArrivalReturnMark,
} from '../domain/cargo-arrival-return.policy.js'
import {
  CargoArrivalDocumentNotFoundError,
  CargoArrivalNotFoundError,
  CargoArrivalTransitionRefusedError,
} from '../domain/cargo-arrival.error.js'
import { CargoArrivalReturnOccurrenceInvalidError } from '../domain/cargo-arrival-occurrence.error.js'
import type {
  CargoArrivalReturnTransactionPort,
  CargoArrivalReturnUnitOfWork,
} from './cargo-arrival-occurrence.port.js'
import type {
  CargoArrivalReturnResult,
  ChangeCargoArrivalReturnParams,
  LockedOccurrenceDocument,
} from './cargo-arrival-occurrence.types.js'

type Dependencies = {
  readonly channel: CargoArrivalChannel
  readonly now: () => Date
  readonly unitOfWork: CargoArrivalReturnUnitOfWork
}

/** Só marcar lê a ocorrência pedida; só concluir lê a tratativa da ocorrência de origem. */
async function readDecisionInputs(params: {
  readonly document: LockedOccurrenceDocument
  readonly input: ChangeCargoArrivalReturnParams
  readonly transaction: CargoArrivalReturnTransactionPort
}) {
  const { document, input, transaction } = params
  const occurrence =
    input.action === CARGO_ARRIVAL_RETURN_ACTION.mark && input.occurrenceId !== null
      ? await transaction.findDocumentOccurrence({
          arrivalDocumentId: document.id,
          occurrenceId: input.occurrenceId,
        })
      : null
  const caseStatus =
    input.action === CARGO_ARRIVAL_RETURN_ACTION.complete && document.returnOccurrenceId !== null
      ? await transaction.findCaseStatus(document.returnOccurrenceId)
      : null
  return { caseStatus, occurrence }
}

function toResult(params: {
  readonly documentId: string
  readonly mark: CargoArrivalReturnMark
  readonly outcome: 'changed' | 'unchanged'
}): CargoArrivalReturnResult {
  return {
    documentId: params.documentId,
    outcome: params.outcome,
    returnOccurrenceId: params.mark.occurrenceId,
    returnToContractor: params.mark.state,
  }
}

async function changeWithinLock(params: {
  readonly dependencies: Dependencies
  readonly input: ChangeCargoArrivalReturnParams
  readonly transaction: CargoArrivalReturnTransactionPort
}): Promise<CargoArrivalReturnResult> {
  const { input, transaction } = params
  const arrival = await transaction.lockArrival()
  if (arrival === null) throw new CargoArrivalNotFoundError()
  const document = await transaction.lockDocument(input.documentId)
  if (document === null) throw new CargoArrivalDocumentNotFoundError()
  const current = { occurrenceId: document.returnOccurrenceId, state: document.returnToContractor }
  const decision = decideCargoArrivalReturn({
    action: input.action,
    arrivalStatus: arrival.status,
    current,
    isInLiveTrip: document.isInLiveTrip,
    ...(await readDecisionInputs({ document, input, transaction })),
  })
  if (decision.outcome === 'refused') {
    if (decision.reason === CARGO_ARRIVAL_RETURN_REFUSAL.occurrenceInvalid) {
      throw new CargoArrivalReturnOccurrenceInvalidError()
    }
    throw new CargoArrivalTransitionRefusedError(decision.reason)
  }
  if (decision.outcome === 'unchanged') {
    return toResult({ documentId: input.documentId, mark: current, outcome: 'unchanged' })
  }
  await transaction.applyReturn({
    action: input.action,
    actorUserId: input.context.userId,
    arrivalDocumentId: document.id,
    channel: params.dependencies.channel,
    contractorId: arrival.contractorId,
    correlationId: input.correlationId,
    from: current,
    next: decision.next,
    note: input.note,
    now: params.dependencies.now(),
  })
  return toResult({ documentId: input.documentId, mark: decision.next, outcome: 'changed' })
}

export function createChangeCargoArrivalReturnUseCase(dependencies: Dependencies): {
  readonly execute: (params: ChangeCargoArrivalReturnParams) => Promise<CargoArrivalReturnResult>
} {
  return {
    execute: (input) =>
      dependencies.unitOfWork.execute({
        operation: (transaction) => changeWithinLock({ dependencies, input, transaction }),
        scope: { arrivalId: input.arrivalId, companyId: input.context.companyId },
      }),
  }
}
