/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { StopOrderViolation } from './stop-order.policy.js'

/**
 * Spec 294 RF25/RF27: a tripulação pediu uma etapa de parada que não é a que está em andamento nem a
 * próxima do roteiro. Nada é gravado; o mesmo pedido com `confirmOutOfOrder: true` é gravado.
 */
export class TripStopOutOfOrderError extends ApiError {
  public readonly violation: StopOrderViolation

  public constructor(violation: StopOrderViolation) {
    super({
      code: 'TRIP_STOP_OUT_OF_ORDER',
      extraBody: { outOfOrder: violation },
      message: 'This stop is out of the route order. Send confirmOutOfOrder to record it anyway.',
      status: 409,
    })
    this.violation = violation
  }
}

/** Spec 294 RF26: a nota já tem um canhoto diferente; a tripulação só o troca confirmando. */
export class TripCanhotoAlreadyAttachedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CANHOTO_ALREADY_ATTACHED',
      message:
        'This document already has a different receipt photo. Send replaceCanhoto to replace it.',
      status: 409,
    })
  }
}
