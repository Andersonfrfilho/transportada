/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  assertCameraMeasurementEnabled,
  resolveMeasurementMargin,
} from '../domain/package-box-measurement.policy.js'
import type { CameraMeasurementSettingsPort } from './camera-measurement-settings.port.js'
import type { PackageBoxMeasurement, PackageBoxRepositoryPort } from './package-box.port.js'

export type MeasurePackageBox = {
  execute(input: {
    readonly boxId: string
    readonly context: { readonly companyId: string; readonly userId: string }
    readonly measurement: PackageBoxMeasurement
  }): Promise<boolean>
}

/**
 * Gravar a medida da caixa (spec 085 G005). É `PUT` porque medir de novo a mesma caixa **substitui**
 * a medida — o conferente que errou a fita repete a leitura, e um segundo registro deixaria duas
 * verdades para a mesma caixa.
 *
 * Spec 152 (D5, D14, D17, experimental): `source` diferente de `typed` exige a função ligada na
 * empresa — checado aqui, e não só no schema, porque a leitura da coluna é I/O. O ator do histórico
 * vem sempre do contexto autenticado, nunca do corpo (`CLAUDE.md`).
 */
export function createMeasurePackageBox(dependencies: {
  readonly cameraMeasurementSettings: CameraMeasurementSettingsPort
  readonly repository: PackageBoxRepositoryPort
}): MeasurePackageBox {
  return {
    async execute(input): Promise<boolean> {
      if (input.measurement.source !== 'typed') {
        const enabled = await dependencies.cameraMeasurementSettings.readEnabled({
          companyId: input.context.companyId,
        })
        assertCameraMeasurementEnabled({ enabled, source: input.measurement.source })
      }

      return dependencies.repository.measure({
        boxId: input.boxId,
        companyId: input.context.companyId,
        measuredByUserId: input.context.userId,
        measurement: input.measurement,
        measurementMarginMm: resolveMeasurementMargin(input.measurement.camera),
      })
    },
  }
}
