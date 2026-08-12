/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export class NfseEmissionProfileNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_PROFILE_NOT_FOUND',
      message: 'NFS-e emission profile was not found',
      status: 404,
    })
  }
}

export class NfseEmissionProfileVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_PROFILE_VERSION_CONFLICT',
      message: 'NFS-e emission profile was changed by another request',
      status: 409,
    })
  }
}

export class NfseEmissionProfileNameTakenError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_PROFILE_NAME_TAKEN',
      message: 'NFS-e emission profile name is already in use',
      status: 409,
    })
  }
}

export class NfseProviderCredentialVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_CREDENTIAL_VERSION_CONFLICT',
      message: 'NFS-e provider credential was changed by another request',
      status: 409,
    })
  }
}

/**
 * Uma única falha para tudo que envolve o segredo em repouso: chave errada, envelope adulterado,
 * AAD de outro tenant. Diferenciar os motivos na resposta é dizer ao atacante o que tentar depois.
 */
export class NfseProviderCredentialUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_CREDENTIAL_UNAVAILABLE',
      message: 'NFS-e provider credential is unavailable',
      status: 500,
    })
  }
}
