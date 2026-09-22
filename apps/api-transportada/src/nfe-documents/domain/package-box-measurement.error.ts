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

/**
 * Spec 155 (G003, G005): caixa de origem ou alvo que não existe nesta empresa. A mesma resposta
 * serve os dois casos — caixa de outra empresa é indistinguível de caixa inexistente para quem
 * procurou, mesmo padrão de `AddressCorrectionAddressNotFoundError`.
 */
export class PackageBoxNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'PACKAGE_BOX_NOT_FOUND',
      message: 'Package box was not found for this company.',
      status: 404,
    })
  }
}

/** Spec 155 (D4, G005): a origem precisa ter medida própria antes de poder ser copiada. */
export class PackageBoxReplicationSourceNotMeasuredError extends ApiError {
  public constructor() {
    super({
      code: 'PACKAGE_BOX_REPLICATION_SOURCE_NOT_MEASURED',
      message: 'The source package box does not have a measurement to replicate.',
      status: 422,
    })
  }
}

/** Spec 155 (D1, G005): só a família de variação replica — o grupo de embalagem nunca. */
export class PackageBoxReplicationTargetOutsideFamilyError extends ApiError {
  public constructor() {
    super({
      code: 'PACKAGE_BOX_REPLICATION_TARGET_OUTSIDE_FAMILY',
      message: 'The target package box is not in the same variation family as the source.',
      status: 422,
    })
  }
}

/**
 * Spec 155 (D4, G005, G007): alvo com `measured_at` preenchido é recusado, nunca sobrescrito — é a
 * garantia por escrito do operador ("não remover medida que já existe"), agora também para replicar.
 */
export class PackageBoxReplicationTargetAlreadyMeasuredError extends ApiError {
  public constructor() {
    super({
      code: 'PACKAGE_BOX_REPLICATION_TARGET_ALREADY_MEASURED',
      message: 'The target package box already has a measurement.',
      status: 409,
    })
  }
}
