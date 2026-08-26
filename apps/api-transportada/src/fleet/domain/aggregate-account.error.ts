/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Cobre "CPF nunca apareceu no grupo" e nada mais — candidatura pendente casa normalmente (a conta
 * nasce antes da aprovação de propósito, ver Casos extremos da spec 064). O `404` aqui não é sonda
 * de status: é literalmente "documento desconhecido", igual para todo CPF que nunca chegou à
 * candidatura nem à ficha.
 */
export class AggregateAccountDriverNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_ACCOUNT_DRIVER_NOT_FOUND',
      message: 'No application or driver record matches this document',
      status: 404,
    })
  }
}

export class AggregateAccountAlreadyLinkedError extends ApiError {
  public constructor() {
    super({
      code: 'AGGREGATE_ACCOUNT_ALREADY_LINKED',
      message: 'This document already has an account',
      status: 409,
    })
  }
}
