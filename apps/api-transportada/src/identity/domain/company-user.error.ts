/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Cobre tanto "não existe" quanto "existe em outra empresa" — a mensagem não pode confirmar
 * qual dos dois é o caso, nem carregar o id do usuário ou da empresa.
 */
export class CompanyUserNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_USER_NOT_FOUND',
      message: 'Company user was not found.',
      status: 404,
    })
    this.name = 'CompanyUserNotFoundError'
  }
}

export class SelfMembershipRemovalError extends ApiError {
  public constructor() {
    super({
      code: 'SELF_MEMBERSHIP_REMOVAL',
      message: 'A user cannot remove their own membership.',
      status: 409,
    })
    this.name = 'SelfMembershipRemovalError'
  }
}
