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

/** Sem detalhe do provedor na mensagem: a URL do catálogo não pode acabar num log. */
export class FleetVehicleCatalogFailedError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_CATALOG_FAILED',
      message: 'Vehicle catalog provider failed',
      status: 502,
    })
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
