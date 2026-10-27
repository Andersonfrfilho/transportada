/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Spec 281 T8b: o contato não é deste cliente, ou não foi este motorista que o informou (o resto é do escritório). */
export class DriverClientContactNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_CLIENT_CONTACT_NOT_FOUND',
      message: 'The client contact was not found',
      status: 404,
    })
  }
}

export class DriverClientEmailInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_CLIENT_EMAIL_INVALID',
      details: [{ field: 'address', message: 'Enter an e-mail like name@domain.com' }],
      message: 'The e-mail must look like name@domain.com',
      status: 400,
    })
  }
}
