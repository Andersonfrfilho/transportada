/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Chave ausente, malformada, desconhecida ou revogada: a resposta é a mesma, para não dizer qual. */
export class IntegrationUnauthorizedError extends ApiError {
  public constructor() {
    super({
      code: 'UNAUTHORIZED',
      headers: { 'www-authenticate': 'Bearer' },
      message: 'A valid integration key is required',
      status: 401,
    })
  }
}

/** A chave existe, mas não leva a capacidade desta rota. */
export class IntegrationScopeForbiddenError extends ApiError {
  public constructor() {
    super({
      code: 'INTEGRATION_SCOPE_FORBIDDEN',
      message: 'This integration key cannot use this operation',
      status: 403,
    })
  }
}

export class IntegrationKeyNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'INTEGRATION_KEY_NOT_FOUND',
      message: 'Integration key was not found or is already revoked',
      status: 404,
    })
  }
}
