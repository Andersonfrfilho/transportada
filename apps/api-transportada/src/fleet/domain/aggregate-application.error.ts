/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class AggregateApplicationNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_APPLICATION_NOT_FOUND',
      message: 'Aggregate application not found',
      status: 404,
    })
  }
}

export class AggregateApplicationAlreadyReviewedError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_APPLICATION_ALREADY_REVIEWED',
      message: 'Aggregate application was already approved or rejected',
      status: 409,
    })
  }
}

export class AggregateApplicationOutsideGroupError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_APPLICATION_OUTSIDE_GROUP',
      message: 'The chosen unit does not belong to the served company group',
      status: 400,
    })
  }
}

export class AggregateApplicationRejectionReasonRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_APPLICATION_REJECTION_REASON_REQUIRED',
      message: 'A rejection requires a reason',
      status: 400,
    })
  }
}

/**
 * `fleet_drivers` só guarda condutor pessoa física (CPF) — o CNPJ do autônomo é o campo
 * `linked_tax_id` de uma ficha já existente, nunca a chave da ficha nova. Uma candidatura de
 * pessoa jurídica sem `duplicateDriverId` não tem para qual ficha vincular esse CNPJ sozinha, e
 * aprovar por aqui pararia no CHECK do banco em vez de numa mensagem que o operador entende.
 */
export class AggregateApplicationRequiresManualDriverCreationError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_APPLICATION_REQUIRES_MANUAL_DRIVER_CREATION',
      message: 'A legal-entity application without a matched driver needs manual driver creation',
      status: 422,
    })
  }
}
