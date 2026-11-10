/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class SalespersonNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_NOT_FOUND',
      message: 'The salesperson is not registered in this company.',
      status: 404,
    })
  }
}

export class SalespersonEmailConflictError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_EMAIL_CONFLICT',
      message: 'A salesperson with this e-mail already exists in this company.',
      status: 409,
    })
  }
}

export class SalespersonPhoneConflictError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_PHONE_CONFLICT',
      message: 'A salesperson with this WhatsApp number already exists in this company.',
      status: 409,
    })
  }
}

export class SalespersonContactRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_CONTACT_REQUIRED',
      message: 'Inform an e-mail or a WhatsApp number for the salesperson.',
      status: 400,
    })
  }
}

export class SalespersonWhatsAppInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_WHATSAPP_INVALID',
      message: 'The WhatsApp number is not valid.',
      status: 400,
    })
  }
}

export class SalespersonContractorNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_CONTRACTOR_NOT_FOUND',
      message: 'The contractor is not registered in this company.',
      status: 404,
    })
  }
}

export class SalespersonLinkNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_LINK_NOT_FOUND',
      message: 'The salesperson is not linked to this contractor.',
      status: 404,
    })
  }
}

export class SalespersonPortfolioClientUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'SALESPERSON_PORTFOLIO_CLIENT_UNKNOWN',
      message: 'Some clients are not registered in this company.',
      status: 422,
    })
  }
}
