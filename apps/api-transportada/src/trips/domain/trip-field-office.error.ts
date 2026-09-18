/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T15: os códigos que a revisão das rotas do escritório acrescentou. Arquivo próprio para
 * `trip.error.ts` não crescer mais — o padrão (`ApiError` com código estável) é o mesmo de lá.
 */
import { ApiError } from '../../shared/api.error.js'

/** ADR-0067 §3: "Devolvido em" no futuro (mesma tolerância de relógio de "Entregue em"). */
export class ReturnedAtInFutureError extends ApiError {
  public constructor() {
    super({
      code: 'RETURNED_AT_IN_FUTURE',
      message: 'The informed time is in the future.',
      status: 400,
    })
  }
}

/** ADR-0067 §3: "Devolvido em" antes do despacho (ou da criação, sem despacho congelado). */
export class ReturnedAtBeforeDispatchError extends ApiError {
  public constructor() {
    super({
      code: 'RETURNED_AT_BEFORE_DISPATCH',
      message: 'The informed time is before the trip was dispatched.',
      status: 400,
    })
  }
}

/** ADR-0067 §3, spec 156 T15 A1: "Chegou em" no futuro. */
export class ArrivedAtInFutureError extends ApiError {
  public constructor() {
    super({
      code: 'ARRIVED_AT_IN_FUTURE',
      message: 'The informed time is in the future.',
      status: 400,
    })
  }
}

/** ADR-0067 §3, spec 156 T15 A1: "Chegou em" antes do despacho da viagem. */
export class ArrivedAtBeforeDispatchError extends ApiError {
  public constructor() {
    super({
      code: 'ARRIVED_AT_BEFORE_DISPATCH',
      message: 'The informed time is before the trip was dispatched.',
      status: 400,
    })
  }
}

/**
 * ADR-0067 §5 (D8): com assinatura `required`, o escritório cumpre a exigência com a foto do canhoto
 * assinado **e** o nome de quem recebeu — sem o nome, a foto sozinha não diz quem assinou.
 */
export class TripDeliveryProofReceiverNameRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DELIVERY_PROOF_RECEIVER_NAME_REQUIRED',
      message: 'This company requires the name of who received the delivery.',
      status: 422,
    })
  }
}
