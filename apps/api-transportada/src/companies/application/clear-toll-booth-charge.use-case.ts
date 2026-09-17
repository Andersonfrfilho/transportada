/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Apaga o ajuste — nunca grava zero (spec 095 D1). Dali em diante a praça volta a valer a tarifa
 * do catálogo, e `0.00` gravado à mão continua sendo isenção afirmada por gente, distinta de
 * ausência.
 */
import type { TollBoothAxleChargeGapCachePort } from '../../toll-booths/application/toll-booth-axle-charge-gap-cache.port.js'
import type { TollBoothChargePort, TollBoothChargeSelection } from './toll-booth-charge.port.js'

export function createClearTollBoothChargeUseCase(input: {
  readonly axleChargeGapCache: TollBoothAxleChargeGapCachePort
  readonly charges: TollBoothChargePort
}): {
  readonly execute: (request: TollBoothChargeSelection) => Promise<void>
} {
  return {
    execute: async (request) => {
      await input.charges.clearAdjustment(request)
      // Spec 154 T503, defeito 2: remover o ajuste também pode mudar a contagem do RF2.
      input.axleChargeGapCache.invalidate(request.companyId)
    },
  }
}
