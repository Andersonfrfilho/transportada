/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class DeliveryClientNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERY_CLIENT_NOT_FOUND',
      message: 'Delivery client was not found',
      status: 404,
    })
  }
}

/**
 * Um documento, um cadastro. O `details` carrega o id do existente — a resposta útil é "abra
 * aquele", não "tente outro documento", e a tela usa isso para levar a pessoa até lá.
 */
export class DeliveryClientAlreadyExistsError extends ApiError {
  public constructor(existingId: string) {
    super({
      code: 'DELIVERY_CLIENT_ALREADY_EXISTS',
      details: [{ field: 'taxId', message: existingId }],
      message: 'A delivery client with this document already exists',
      status: 409,
    })
  }
}

export class ContractorNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'CONTRACTOR_NOT_FOUND', message: 'Contractor was not found', status: 404 })
  }
}

export class ContractorAlreadyExistsError extends ApiError {
  public constructor(existingId: string) {
    super({
      code: 'CONTRACTOR_ALREADY_EXISTS',
      details: [{ field: 'taxId', message: existingId }],
      message: 'A contractor with this document already exists',
      status: 409,
    })
  }
}

/** Spec 279 D2: o cadastro não vira lista de transmissão. */
export class DeliveryClientEmailLimitReachedError extends ApiError {
  public constructor(limit: number) {
    super({
      code: 'DELIVERY_CLIENT_EMAIL_LIMIT_REACHED',
      details: [{ field: 'purpose', message: String(limit) }],
      message: 'The delivery client already has the maximum of e-mails for this type',
      status: 422,
    })
  }
}

export class DeliveryClientEmailNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DELIVERY_CLIENT_EMAIL_NOT_FOUND',
      message: 'Delivery client e-mail was not found',
      status: 404,
    })
  }
}

/** O `details` aponta o existente, como no cadastro do cliente: a resposta útil é "edite aquele". */
export class DeliveryClientEmailAlreadyExistsError extends ApiError {
  public constructor(existingId: string) {
    super({
      code: 'DELIVERY_CLIENT_EMAIL_ALREADY_EXISTS',
      details: [{ field: 'address', message: existingId }],
      message: 'This e-mail is already registered for the delivery client and type',
      status: 409,
    })
  }
}
