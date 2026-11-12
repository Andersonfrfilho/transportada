/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class NfeXmlPublicEmailDomainError extends ApiError {
  public constructor() {
    super({
      code: 'NFE_XML_PUBLIC_EMAIL_DOMAIN',
      message:
        'A public mail provider cannot be released as a whole; register the sender address instead.',
      status: 400,
    })
  }
}

export class NfeXmlAllowedDomainContractorNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'NFE_XML_ALLOWED_DOMAIN_CONTRACTOR_NOT_FOUND',
      message: 'The contractor is not registered in this company.',
      status: 404,
    })
  }
}
