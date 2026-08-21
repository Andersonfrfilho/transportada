/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class FleetVehicleNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'FLEET_VEHICLE_NOT_FOUND', message: 'Fleet vehicle not found', status: 404 })
  }
}

export class FleetVehicleVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_VERSION_CONFLICT',
      message: 'Fleet vehicle was changed by another request',
      status: 409,
    })
  }
}

export class FleetVehiclePlateTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_PLATE_TAKEN',
      message: 'Another vehicle of this company already uses the plate',
      status: 409,
    })
  }
}

/**
 * Por que o catálogo falhou. Sem isto, um 429 de cota e um provedor fora do ar chegam ao log com a
 * mesma cara, e o operador não sabe se espera ou se abre chamado.
 */
export const FLEET_VEHICLE_CATALOG_FAILURE = {
  MALFORMED_BODY: 'malformed_body',
  PROVIDER_STATUS: 'provider_status',
  TRANSPORT: 'transport',
} as const

export type FleetVehicleCatalogFailure =
  (typeof FLEET_VEHICLE_CATALOG_FAILURE)[keyof typeof FLEET_VEHICLE_CATALOG_FAILURE]

/** Sem detalhe do provedor na mensagem: a URL do catálogo não pode acabar num log. */
export class FleetVehicleCatalogFailedError extends ApiError {
  public readonly failure: FleetVehicleCatalogFailure

  /** Ausente em falha de transporte: não houve resposta a que atribuir código. */
  public readonly providerStatus: number | undefined

  public constructor(input: {
    readonly failure: FleetVehicleCatalogFailure
    readonly providerStatus?: number
  }) {
    super({
      code: 'FLEET_VEHICLE_CATALOG_FAILED',
      message: 'Vehicle catalog provider failed',
      status: 502,
    })
    this.failure = input.failure
    this.providerStatus = input.providerStatus
  }
}

export class FleetDriverNotFoundError extends ApiError {
  public constructor() {
    super({ code: 'FLEET_DRIVER_NOT_FOUND', message: 'Fleet driver not found', status: 404 })
  }
}

export class FleetDriverVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_VERSION_CONFLICT',
      message: 'Fleet driver was changed by another request',
      status: 409,
    })
  }
}

export class FleetDriverTaxIdTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_TAX_ID_TAKEN',
      message: 'Another driver of this company already uses the tax id',
      status: 409,
    })
  }
}

export class FleetDriverLicenseNumberTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_LICENSE_NUMBER_TAKEN',
      message: 'Another driver of this company already uses the license number',
      status: 409,
    })
  }
}

export class FleetDriverMembershipTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_MEMBERSHIP_TAKEN',
      message: 'Another driver of this company already uses the membership',
      status: 409,
    })
  }
}

export class FleetDriverMembershipNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_MEMBERSHIP_NOT_FOUND',
      message: 'Membership does not belong to this company',
      status: 422,
    })
  }
}
