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

/** Feature 147 D1: `00` só é ausência real de carroceria no cavalo — todo o resto precisa escolher. */
export class FleetVehicleBodyTypeRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_BODY_TYPE_REQUIRED',
      message: 'Vehicle type requires a body type other than 00',
      status: 400,
    })
  }
}

/** Feature 147 D1: carroceria no cavalo mandaria `tpCar` errado ao MDF-e — quem carrega é a carreta. */
export class FleetVehicleBodyTypeNotApplicableError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_BODY_TYPE_NOT_APPLICABLE',
      message: 'Tractor unit only accepts body type 00',
      status: 400,
    })
  }
}

/** Feature 147 D3: a carreta padrão só existe no cavalo — nos outros tipos o campo não se aplica. */
export class FleetVehicleDefaultTrailerRequiresTractorError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR',
      message: 'Only a tractor unit can have a default trailer',
      status: 400,
    })
  }
}

/**
 * T18 (revisão): a carreta padrão não pode ser o próprio veículo — espelha o CHECK
 * `fleet_vehicles_default_trailer_not_self` (`fleet.schema.ts`). O caso legítimo (apontar a si
 * mesmo) nunca chega da apresentação porque o formulário não oferece o próprio veículo na lista;
 * este erro é a tradução de quem escrever direto na API.
 */
export class FleetVehicleDefaultTrailerSelfReferenceError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_DEFAULT_TRAILER_SELF_REFERENCE',
      message: 'A vehicle cannot be its own default trailer',
      status: 400,
    })
  }
}

/** Feature 147 D3: o apontado existe na empresa, mas não é uma carreta ativa. */
export class FleetVehicleDefaultTrailerNotATrailerError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_DEFAULT_TRAILER_NOT_A_TRAILER',
      message: 'Default trailer must be an active trailer of this company',
      status: 400,
    })
  }
}

/**
 * Feature 147 D3: uma carreta que é padrão de algum cavalo, ou que puxa uma viagem aberta, não
 * pode virar tração — o vínculo ficaria pendurado num veículo que deixou de ser carreta.
 */
export class FleetVehicleRoleChangeBlockedError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_VEHICLE_ROLE_CHANGE_BLOCKED',
      message: 'Trailer is a default trailer or is linked to an open trip',
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

/**
 * O e-mail é o login do usuário que o motorista abre, e o provedor de identidade o quer único no
 * realm. A mensagem não diz de quem é o e-mail: isso enumeraria usuário de outra empresa.
 */
export class FleetDriverEmailTakenError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_EMAIL_TAKEN',
      message: 'Another user already uses the e-mail',
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

/** O usuário do motorista recebe o código por e-mail ou WhatsApp: sem um dos dois não há convite. */
export class FleetDriverContactRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'FLEET_DRIVER_CONTACT_REQUIRED',
      message: 'Driver needs an e-mail or a phone to receive the invitation',
      status: 422,
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
