/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6b: os códigos estáveis da entrada da prévia por e-mail no perfil. Contratante inexistente ou de
 * outra empresa é o `ContractorNotFoundError` de sempre (404).
 */
import { ApiError } from '../../shared/api.error.js'
import type { PreviewAllowlistField } from './contractor-preview-email.constant.js'

/** O endereço de entrada exige as duas listas (o banco recusa token sem elas): a mensagem diz quais faltam. */
export class ReceivingProfileAllowlistsRequiredError extends ApiError {
  public constructor(missing: readonly PreviewAllowlistField[]) {
    super({
      code: 'RECEIVING_PROFILE_ALLOWLISTS_REQUIRED',
      details: missing.map((field) => ({
        field,
        message: 'The inbound address requires this list to have at least one entry',
      })),
      message: 'Both allowlists must be filled in while the preview e-mail address is active',
      status: 422,
    })
  }
}

/** O CHECK do banco recusou uma lista que a validação deixou passar: nunca 500, e o código é estável. */
export class ReceivingProfileAllowlistsInvalidError extends ApiError {
  public constructor() {
    super({
      code: 'RECEIVING_PROFILE_ALLOWLISTS_INVALID',
      message: 'An allowlist entry is not valid',
      status: 422,
    })
  }
}

/** O domínio de entrada é o da configuração de e-mail da empresa (spec 143): sem ela não há endereço a montar. */
export class ReceivingProfileInboundDomainNotConfiguredError extends ApiError {
  public constructor() {
    super({
      code: 'RECEIVING_PROFILE_INBOUND_DOMAIN_NOT_CONFIGURED',
      message: 'The company has no inbound e-mail domain configured',
      status: 409,
    })
  }
}
