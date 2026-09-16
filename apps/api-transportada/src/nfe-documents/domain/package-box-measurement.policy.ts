/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PackageBoxMeasurementSource } from './package-box-measurement.constant.js'
import { PackageBoxCameraMeasurementDisabledError } from './package-box-measurement.error.js'

export type PackageBoxCameraMeasurementMargins = {
  readonly lengthMarginMm?: number | undefined
  readonly widthMarginMm?: number | undefined
  readonly heightMarginMm?: number | undefined
}

/**
 * D17: a maior das três margens é a que a caixa grava (`measurement_margin_mm`) — `null` quando a
 * câmera não participou da medida (`source: typed`) ou não propôs margem nenhuma.
 */
export function resolveMeasurementMargin(
  camera: PackageBoxCameraMeasurementMargins | undefined,
): number | null {
  if (camera === undefined) return null
  const margins = [camera.lengthMarginMm, camera.widthMarginMm, camera.heightMarginMm].filter(
    (margin): margin is number => margin !== undefined,
  )
  return margins.length === 0 ? null : Math.max(...margins)
}

/**
 * D14: `typed` grava sempre. `camera`/`camera_adjusted` exigem a função ligada na empresa — checado
 * aqui, e não só na tela, porque uma aba aberta antes do desligamento continua mandando `PUT`.
 */
export function assertCameraMeasurementEnabled(input: {
  readonly enabled: boolean
  readonly source: PackageBoxMeasurementSource
}): void {
  if (input.source !== 'typed' && !input.enabled) {
    throw new PackageBoxCameraMeasurementDisabledError()
  }
}
