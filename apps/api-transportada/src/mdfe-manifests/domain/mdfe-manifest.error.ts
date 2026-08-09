/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class MdfeFiscalSettingsMissingError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_FISCAL_SETTINGS_MISSING',
      message: 'The company has no fiscal settings to manifest with.',
      status: 409,
    })
  }
}

export class MdfeManifestMultipleOriginStatesError extends ApiError {
  public constructor(states: readonly string[]) {
    super({
      code: 'MDFE_MANIFEST_MULTIPLE_ORIGIN_STATES',
      message: `A MDF-e starts in a single state, but the selection starts in ${states.join(', ')}.`,
      status: 422,
    })
  }
}

export class MdfeManifestTooManyLoadingCitiesError extends ApiError {
  public constructor(limit: number) {
    super({
      code: 'MDFE_MANIFEST_TOO_MANY_LOADING_CITIES',
      message: `A MDF-e carries at most ${limit} loading municipalities.`,
      status: 422,
    })
  }
}

export class MdfeManifestVehicleNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_VEHICLE_NOT_FOUND',
      message: 'The vehicle is not in the fleet of this company.',
      status: 404,
    })
  }
}

export class MdfeManifestVehicleNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_VEHICLE_NOT_AVAILABLE',
      message: 'A MDF-e travels on an active traction vehicle.',
      status: 422,
    })
  }
}

export class MdfeManifestDriverNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_DRIVER_NOT_FOUND',
      message: 'A driver of the crew is not registered in this company.',
      status: 404,
    })
  }
}

export class MdfeManifestDriverNotAvailableError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_DRIVER_NOT_AVAILABLE',
      message: 'A driver of the crew is not active.',
      status: 422,
    })
  }
}

export class MdfeManifestDriverDuplicatedError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_DRIVER_DUPLICATED',
      message: 'The same driver cannot take two positions in the crew.',
      status: 422,
    })
  }
}

/** Tripulação vazia: a rota direta barra pelo schema, a rota da viagem depende de `trip.drivers`. */
export class MdfeManifestCrewRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_CREW_REQUIRED',
      message: 'A MDF-e travels with at least one driver.',
      status: 422,
    })
  }
}

export class MdfeManifestDocumentsBlockedError extends ApiError {
  public constructor(blocked: readonly { readonly reason: string }[]) {
    super({
      code: 'MDFE_MANIFEST_DOCUMENTS_BLOCKED',
      message: `The selection carries ${blocked.length} CT-e that cannot be manifested.`,
      status: 422,
    })
  }
}

export class MdfeManifestEmptySelectionError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_EMPTY_SELECTION',
      message: 'A MDF-e carries at least one CT-e.',
      status: 422,
    })
  }
}

export class MdfeManifestDestinationStateRequiredError extends ApiError {
  public constructor(options: readonly string[]) {
    super({
      code: 'MDFE_MANIFEST_DESTINATION_STATE_REQUIRED',
      message: `UFFim must be one of the unloading states of the selection: ${options.join(', ')}.`,
      status: 422,
    })
  }
}

export class MdfeManifestNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'MDFE_MANIFEST_NOT_FOUND',
      message: 'Manifest not found.',
      status: 404,
    })
  }
}
