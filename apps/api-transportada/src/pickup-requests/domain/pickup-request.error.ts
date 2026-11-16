/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Pedido de outra empresa ou de outro contratante responde como pedido que nunca existiu. */
export class PickupRequestNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'PICKUP_REQUEST_NOT_FOUND',
      message: 'Pickup request was not found',
      status: 404,
    })
  }
}

/** Dois cliques, ou cliente e escritório ao mesmo tempo: quem gravou primeiro vence, o outro recebe 409. */
export class PickupRequestInvalidTransitionError extends ApiError {
  public constructor() {
    super({
      code: 'PICKUP_REQUEST_INVALID_TRANSITION',
      message: 'The pickup request is not in a state that allows this action',
      status: 409,
    })
  }
}

export class PickupRequestWindowInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'PICKUP_REQUEST_WINDOW_INVALID',
      details: [{ field: 'windowStart', message: 'window' }],
      message: 'The requested window must start today or later and fit the allowed horizon',
      status: 422,
    })
  }
}

/** Encaixar exige viagem da mesma empresa e ainda antes do despacho. */
export class PickupRequestTripNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'PICKUP_REQUEST_TRIP_NOT_AVAILABLE',
      message: 'The trip does not exist or is no longer open for new pickups',
      status: 409,
    })
  }
}
