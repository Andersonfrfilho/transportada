/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3: as recusas do encaixe da coleta de canhoto.
 */
import { ApiError } from '../../shared/api.error.js'
import type { CanhotoPickupScheduleRefusal } from './canhoto-pickup.policy.js'

/** Inexistente ou de outra empresa recebem a mesma resposta: não revela qual dos dois. */
export class CanhotoPickupNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_PICKUP_NOT_FOUND',
      message: 'The canhoto pickup is not registered in this company.',
      status: 404,
    })
  }
}

/** Duas escritas no mesmo instante: a coleta mudou entre a leitura e a trava. Tentar de novo resolve. */
export class CanhotoPickupChangedError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_PICKUP_CHANGED',
      message: 'The canhoto pickup changed while it was being scheduled. Try again.',
      status: 409,
    })
  }
}

const REFUSALS: Readonly<
  Record<CanhotoPickupScheduleRefusal, { code: string; message: string; status: 409 | 422 }>
> = {
  closed_pickup: {
    code: 'CANHOTO_PICKUP_CLOSED',
    message: 'The canhoto pickup was already collected or cancelled.',
    status: 409,
  },
  origin_trip: {
    code: 'CANHOTO_PICKUP_ORIGIN_TRIP',
    message: 'The canhoto pickup cannot be scheduled on the trip that delivered the document.',
    status: 422,
  },
  trip_closed: {
    code: 'CANHOTO_PICKUP_TRIP_CLOSED',
    message: 'The canhoto pickup cannot be scheduled on a completed or cancelled trip.',
    status: 409,
  },
  without_origin_address: {
    code: 'CANHOTO_PICKUP_WITHOUT_ADDRESS',
    message: 'The delivery that kept the canhoto has no stop address to pick it up from.',
    status: 422,
  },
}

export class CanhotoPickupScheduleRefusedError extends ApiError {
  public constructor(reason: CanhotoPickupScheduleRefusal) {
    super(REFUSALS[reason])
    this.reason = reason
  }

  public readonly reason: CanhotoPickupScheduleRefusal
}

/** Desencaixar só vale para a coleta encaixada. */
export class CanhotoPickupNotScheduledError extends ApiError {
  public constructor() {
    super({
      code: 'CANHOTO_PICKUP_NOT_SCHEDULED',
      message: 'The canhoto pickup is not scheduled on a trip.',
      status: 409,
    })
  }
}
