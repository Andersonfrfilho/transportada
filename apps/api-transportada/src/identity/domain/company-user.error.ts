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

/**
 * O `username` é o login: precisa ser único no provedor de identidade. A mensagem não diz de quem
 * é o login já usado — isso enumeraria usuários de outras empresas para quem só administra a sua.
 */
export class DuplicateUsernameError extends ApiError {
  public constructor() {
    super({
      code: 'USERNAME_ALREADY_TAKEN',
      message: 'Username is already taken.',
      status: 409,
    })
    this.name = 'DuplicateUsernameError'
  }
}

/**
 * Vínculo na aplicação sem identidade externa correspondente é estado inconsistente: falha alto,
 * porque continuar significaria mudar o banco sem que o provedor de identidade acompanhe.
 */
export class IdentitySubjectNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'IDENTITY_SUBJECT_NOT_FOUND',
      message: 'Identity provider subject was not found for the user.',
      status: 409,
    })
    this.name = 'IdentitySubjectNotFoundError'
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
