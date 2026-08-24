/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { TripTransitionBlock } from './trip-state.policy.js'

export class TripVehicleNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_VEHICLE_NOT_FOUND',
      message: 'The vehicle is not in the fleet of this company.',
      status: 404,
    })
  }
}

export class TripVehicleNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_VEHICLE_NOT_AVAILABLE',
      message: 'A trip travels on an active traction vehicle.',
      status: 422,
    })
  }
}

export class TripDriverNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DRIVER_NOT_FOUND',
      message: 'A driver of the crew is not registered in this company.',
      status: 404,
    })
  }
}

export class TripDriverNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DRIVER_NOT_AVAILABLE',
      message: 'A driver of the crew is not active.',
      status: 422,
    })
  }
}

export class TripDriverDuplicatedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DRIVER_DUPLICATED',
      message: 'The same driver cannot take two positions in the crew.',
      status: 422,
    })
  }
}

export class TripNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_NOT_FOUND',
      message: 'The trip is not registered in this company.',
      status: 404,
    })
  }
}

/** ADR-0023: encerrar é terminal — repetir o encerramento é idempotente, mas nenhum outro comando muda uma viagem fechada. */
export class TripClosedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CLOSED',
      message: 'A closed trip no longer accepts changes.',
      status: 422,
    })
  }
}

export class TripDocumentReferenceInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_REFERENCE_INVALID',
      message: 'A trip document links to exactly one nfe document or freight calculation.',
      status: 422,
    })
  }
}

export class TripDocumentNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_NOT_FOUND',
      message: 'The document is not linked to this trip.',
      status: 404,
    })
  }
}

/** Nota/frete já vivo em outra viagem (spec 027 § Dúvidas) — mesmo desenho do plate-taken de fleet. */
export class TripDocumentAlreadyLinkedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_ALREADY_LINKED',
      message: 'The document is already linked to another open trip.',
      status: 409,
    })
  }
}

/** Uma vez entregue, o vínculo trava — a nota nunca mais migra para outra viagem (spec 027 § Dúvidas). */
export class TripDocumentAlreadyDeliveredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_ALREADY_DELIVERED',
      message: 'A delivered trip document cannot be unlinked.',
      status: 422,
    })
  }
}

const TRIP_TRANSITION_BLOCK_MESSAGES: Readonly<Record<TripTransitionBlock, string>> = {
  TRIP_ALREADY_DISPATCHED: 'The cargo already left: a dispatched trip no longer accepts changes.',
  TRIP_CANCELLED: 'A cancelled trip no longer accepts changes.',
  TRIP_COMPLETED: 'A completed trip no longer accepts changes.',
  TRIP_DOCUMENT_ALREADY_CLOSED: 'The document was already delivered or returned.',
  TRIP_DOCUMENT_NOT_LOADED: 'Only a loaded document can be delivered or returned.',
  TRIP_DOCUMENT_NOT_SEPARATED: 'Only a separated document can be loaded.',
  TRIP_HAS_NO_ROUTE: 'The trip has no planned route.',
  TRIP_NOT_DISPATCHED: 'Delivering and returning happen on the road, after the trip is dispatched.',
  TRIP_ROUTE_NOT_PLANNED: 'The route must be planned before the warehouse separates the cargo.',
}

/**
 * `domain-model.md#estados`: transição inválida é `409 STATE_TRANSITION_NOT_ALLOWED`. O motivo
 * específico viaja em `details`, porque "não pode" sem dizer o quê manda a pessoa adivinhar.
 */
export class TripStateTransitionNotAllowedError extends ApiError {
  public constructor(reason: TripTransitionBlock) {
    super({
      code: 'STATE_TRANSITION_NOT_ALLOWED',
      details: [{ field: 'status', message: TRIP_TRANSITION_BLOCK_MESSAGES[reason] }],
      message: TRIP_TRANSITION_BLOCK_MESSAGES[reason],
      status: 409,
    })
    this.reason = reason
  }

  public readonly reason: TripTransitionBlock
}

/** ADR-0043 §7: motivo é obrigatório em toda nota devolvida, e só nela — o check do banco reflete isso. */
export class TripDocumentReturnReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_RETURN_REASON_REQUIRED',
      message: 'Returning a document requires a reason.',
      status: 422,
    })
  }
}

/** A nota deixou de existir no estado que a leitura viu — quem chamou tenta de novo com dado fresco. */
export class TripDocumentTransitionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_TRANSITION_CONFLICT',
      message: 'The document changed concurrently; retry with fresh state.',
      status: 409,
    })
  }
}

/** O ator da transição precisa ser membro desta empresa — mesma regra de `audit_logs`. */
export class TripActorNotAMemberError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_ACTOR_NOT_A_MEMBER',
      message: 'The acting user is not a member of this company.',
      status: 422,
    })
  }
}
