/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * A única recusa da ativação. Código expirado, já usado, revogado, inexistente ou simplesmente
 * errado chegam todos aqui — a mensagem não pode deixar deduzir qual dos casos aconteceu, nem
 * confirmar que aquele convite existe.
 */
export class InvitationCodeRejectedError extends ApiError {
  public constructor() {
    super({
      code: 'INVITATION_CODE_REJECTED',
      message: 'Activation code is invalid or no longer usable.',
      status: 400,
    })
    this.name = 'InvitationCodeRejectedError'
  }
}

export class InvitationAlreadyAcceptedError extends ApiError {
  public constructor() {
    super({
      code: 'INVITATION_ALREADY_ACCEPTED',
      message: 'This person has already activated the access.',
      status: 409,
    })
    this.name = 'InvitationAlreadyAcceptedError'
  }
}

export class LastCompanyAdminError extends ApiError {
  public constructor() {
    super({
      code: 'LAST_COMPANY_ADMIN',
      message: 'The company would be left without any company-admin.',
      status: 409,
    })
    this.name = 'LastCompanyAdminError'
  }
}

/**
 * ADR-0076 §8: suspender não revoga o convite, então um vínculo suspenso ainda pode ter convite
 * `pending` — e é o reenvio do administrador que recusa reentregar o código enquanto o vínculo não
 * volta a `active`. Reativar é o caminho: reenviar não reabilita ninguém.
 */
export class CompanyUserSuspendedError extends ApiError {
  public constructor() {
    super({
      code: 'COMPANY_USER_SUSPENDED',
      message: 'Company user is suspended.',
      status: 409,
    })
    this.name = 'CompanyUserSuspendedError'
  }
}
