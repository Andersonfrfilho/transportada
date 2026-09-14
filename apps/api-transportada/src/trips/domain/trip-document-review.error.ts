/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: os erros da fila de revisão das notas que não couberam.
 */
import { ApiError } from '../../shared/api.error.js'

/** A viagem mudou depois da planta: soltar ou mover pela planta velha decidiria sobre outra carga. */
export class TripCargoLayoutOutdatedError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CARGO_LAYOUT_OUTDATED',
      message: 'The trip changed after this cargo layout was computed.',
      status: 409,
    })
  }
}

export class TripCargoLayoutNotReadyError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_CARGO_LAYOUT_NOT_READY',
      message: 'The cargo layout is not ready yet.',
      status: 409,
    })
  }
}

export class TripDocumentReviewNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_REVIEW_NOT_FOUND',
      message: 'The review entry is not registered in this company.',
      status: 404,
    })
  }
}

/** A entrada já tem destino, e o corpo pede outro. */
export class TripDocumentReviewTransitionError extends ApiError {
  public constructor(input: { readonly from: string; readonly to: string }) {
    super({
      code: 'TRIP_DOCUMENT_REVIEW_ALREADY_RESOLVED',
      details: [{ field: 'status', message: `${input.from} -> ${input.to}` }],
      message: 'The review entry already has another destination.',
      status: 409,
    })
  }
}

/** A planta validada deixou a nota de fora: ela não cabe no destino. */
export class TripDocumentReviewDoesNotFitError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_REVIEW_DOES_NOT_FIT',
      message: 'The invoice does not fit in the target truck.',
      status: 409,
    })
  }
}

/** A nota a trocar não está viva no caminhão da entrada. */
export class TripDocumentReviewSwapTargetNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'TRIP_DOCUMENT_REVIEW_SWAP_TARGET_NOT_FOUND',
      message: 'The invoice to swap out is not on this truck.',
      status: 404,
    })
  }
}
