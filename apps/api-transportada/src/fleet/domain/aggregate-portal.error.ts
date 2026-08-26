/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Não deveria acontecer — toda conta nasce vinculada (T2) — mas uma conta órfã (linha apagada por
 * fora, dado inconsistente) não pode virar `500`: é "sua conta não está pronta", não incidente.
 */
export class AggregatePortalAccountNotLinkedError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_PORTAL_ACCOUNT_NOT_LINKED',
      message: 'This account is not linked to any application or driver record',
      status: 404,
    })
  }
}
