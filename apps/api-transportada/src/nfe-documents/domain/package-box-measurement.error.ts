/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * D14: a função nasce desligada por empresa, e desligar precisa valer também para uma aba que ficou
 * aberta antes do desligamento — por isso a recusa vive no use case, não só na tela.
 */
export class PackageBoxCameraMeasurementDisabledError extends ApiError {
  public constructor() {
    super({
      code: 'PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED',
      message: 'Camera measurement is disabled for this company.',
      status: 422,
    })
  }
}
