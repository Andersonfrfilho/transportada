/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { ApiErrorDetail } from '../../shared/api.types.js'

export class FreightRegionNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'FREIGHT_REGION_NOT_FOUND', message: 'Freight region not found', status: 404 })
  }
}

export class FreightRegionVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_VERSION_CONFLICT',
      message: 'Freight region was changed by another request',
      status: 409,
    })
  }
}

/** O código impresso é a chave natural da importação: dois cadastros com ele desfazem a chave. */
export class FreightRegionCodeTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_CODE_TAKEN',
      message: 'Another region of this company already uses the route code',
      status: 409,
    })
  }
}

export class FreightRegionUnknownError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_UNKNOWN',
      message: 'Region does not belong to this company',
      status: 422,
    })
  }
}

/** Cobertura de cidade sem cidade é linha que não cobre nada — o CHECK da tabela diz o mesmo. */
export class FleetDriverRegionCityRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_REGION_CITY_REQUIRED',
      message: 'City coverage requires a city and a two letter UF',
      status: 400,
    })
  }
}

/** Zona com cidade é zona disfarçada: apagar a cidade em silêncio guardaria outra cobertura. */
export class FleetDriverRegionCityUnexpectedError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_REGION_CITY_UNEXPECTED',
      message: 'Zone coverage must not carry a city',
      status: 400,
    })
  }
}

/** O arquivo é do cliente: o motivo da recusa tem de dizer a linha, senão não há como corrigir. */
export class FreightRegionImportInvalidError extends ApiError {
  public constructor(details: readonly ApiErrorDetail[]) {
    super({
      code: 'FREIGHT_REGION_IMPORT_INVALID',
      details,
      message: 'Freight region file could not be read',
      status: 400,
    })
  }
}

/**
 * Arquivo sem nenhuma rota inativaria a tabela inteira, e é a tabela que o motorista está ligado.
 * Upload que veio vazio é upload errado — não é a transportadora deixando de atender tudo.
 */
export class FreightRegionImportEmptyError extends ApiError {
  public constructor() {
    super({
      code: 'FREIGHT_REGION_IMPORT_EMPTY',
      message: 'Freight region file carries no route',
      status: 400,
    })
  }
}
