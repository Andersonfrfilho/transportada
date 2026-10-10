/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A chave guardada não abre. Uma resposta só para tudo (chaveiro sem a chave do envelope, AAD de outra linha,
 * envelope malformado, plaintext fora do formato): a mensagem é fixa e nunca carrega a chave, o id da linha
 * nem o motivo do cofre.
 */
export class HolidayProviderTokenUnreadableError extends Error {
  override readonly name = 'HolidayProviderTokenUnreadableError'

  constructor() {
    super('holiday_provider_token_unreadable')
  }
}
