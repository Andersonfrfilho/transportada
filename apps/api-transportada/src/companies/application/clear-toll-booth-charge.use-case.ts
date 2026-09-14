/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Apaga o ajuste — nunca grava zero (spec 095 D1). Dali em diante a praça volta a valer a tarifa
 * do catálogo, e `0.00` gravado à mão continua sendo isenção afirmada por gente, distinta de
 * ausência.
 */
import type { TollBoothChargePort, TollBoothChargeSelection } from './toll-booth-charge.port.js'

export function createClearTollBoothChargeUseCase(input: {
  readonly charges: TollBoothChargePort
}): {
  readonly execute: (request: TollBoothChargeSelection) => Promise<void>
} {
  return {
    execute: (request) => input.charges.clearAdjustment(request),
  }
}
