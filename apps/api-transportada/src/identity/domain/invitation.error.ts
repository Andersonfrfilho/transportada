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
