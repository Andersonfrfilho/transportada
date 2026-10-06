/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T3.2: os códigos estáveis da ocorrência de recebimento e da marcação "devolver ao
 * contratante". A recusa de estado (chegada fechada, nota devolvida, marcada…) é o 409 de
 * `CargoArrivalTransitionRefusedError`, com o motivo da política como código.
 */
import { ApiError } from '../../shared/api.error.js'

/** Tipo de outra empresa, aposentado ou inexistente: igual, para não dizer qual existe. */
export class CargoArrivalOccurrenceTypeNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_OCCURRENCE_TYPE_NOT_FOUND',
      details: [{ field: 'occurrenceTypeId', message: 'The occurrence type was not found' }],
      message: 'The occurrence type was not found',
      status: 404,
    })
  }
}

/** A etapa é do tipo, nunca do corpo: tipo de galpão ou de rua não abre ocorrência de recebimento. */
export class CargoArrivalOccurrenceTypeNotReceivingError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_NOT_RECEIVING',
      details: [{ field: 'occurrenceTypeId', message: 'The occurrence type is not for receiving' }],
      message: 'The occurrence type is not for receiving',
      status: 422,
    })
  }
}

/** Com a tratativa `blocked`, ocorrência sem item nunca chegaria ao contratante (ajuste 3). */
export class CargoArrivalOccurrenceItemsRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_OCCURRENCE_ITEMS_REQUIRED',
      details: [{ field: 'productCodes', message: 'Choose at least one item of the document' }],
      message: 'Choose at least one item of the document',
      status: 422,
    })
  }
}

export class CargoArrivalOccurrenceWindowClosedError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_OCCURRENCE_WINDOW_CLOSED',
      message: 'The separation window of this cargo arrival is over',
      status: 422,
    })
  }
}

export class CargoArrivalOccurrenceKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_OCCURRENCE_KEY_REUSED',
      message: 'This idempotency key was used for a different occurrence',
      status: 409,
    })
  }
}

export class CargoArrivalReturnOccurrenceInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'CARGO_ARRIVAL_RETURN_OCCURRENCE_INVALID',
      details: [
        { field: 'occurrenceId', message: 'Choose a receiving occurrence of this document' },
      ],
      message: 'Choose a receiving occurrence of this document',
      status: 422,
    })
  }
}
