/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import type { PackageBoxUnitSanityRejectionCode } from './package-box-unit-sanity.policy.js'

/**
 * Spec 163, RF03: unidade implausível (ex.: "216 cm" num frasco) é rejeitada, nunca corrigida. O
 * código é o primeiro motivo da sanidade; os demais vão em `details`.
 */
export class PackageBoxUnitRejectedError extends ApiError {
  public readonly reasons: readonly PackageBoxUnitSanityRejectionCode[]

  public constructor(reasons: readonly PackageBoxUnitSanityRejectionCode[]) {
    super({
      code: reasons[0] ?? 'UNIT_EDGE_OUT_OF_RANGE',
      details: reasons.map((reason) => ({ field: 'unit', message: reason })),
      message: 'The package box unit measurement is not plausible.',
      status: 422,
    })
    this.reasons = reasons
  }
}
