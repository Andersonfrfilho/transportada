/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262: as recusas da chave da FeriadosAPI, cada uma com código estável e mensagem fixa — nenhuma carrega a
 * chave, o id da linha nem o motivo do cofre.
 */
import { ApiError } from '../../shared/api.error.js'
import {
  HOLIDAY_PROVIDER_SETTINGS_ERROR_CODE as CODE,
  HOLIDAY_PROVIDER_TOKEN_RULE_MESSAGE,
} from './holiday-provider-settings.constant.js'

/** Uma resposta só para tudo que envolve o segredo em repouso: o motivo real não sai da API. */
export class HolidayProviderTokenUnavailableError extends ApiError {
  public constructor() {
    super({
      code: CODE.HOLIDAY_PROVIDER_TOKEN_UNAVAILABLE,
      message: 'Holiday provider token is unavailable',
      status: 500,
    })
  }
}

/** Recusa o formato sem ecoar o valor: o campo e a regra, nunca a chave. */
export class HolidayProviderTokenFormatError extends ApiError {
  public constructor() {
    super({
      code: CODE.HOLIDAY_PROVIDER_TOKEN_INVALID,
      details: [{ field: 'token', message: HOLIDAY_PROVIDER_TOKEN_RULE_MESSAGE }],
      message: 'The token does not follow the accepted format',
      status: 400,
    })
  }
}

/** Dois administradores salvaram ao mesmo tempo, ou a versão citada ficou velha: recarregar e decidir de novo. */
export class HolidayProviderSettingsVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: CODE.HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT,
      message: 'The holiday provider settings changed: reload and try again',
      status: 409,
    })
  }
}
