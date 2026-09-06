/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PackageBoxMeasurement, PackageBoxRepositoryPort } from './package-box.port.js'

export type MeasurePackageBox = {
  execute(input: {
    readonly boxId: string
    readonly context: { readonly companyId: string }
    readonly measurement: PackageBoxMeasurement
  }): Promise<boolean>
}

/**
 * Gravar a medida da caixa (spec 085 G005). É `PUT` porque medir de novo a mesma caixa **substitui**
 * a medida — o conferente que errou a fita repete a leitura, e um segundo registro deixaria duas
 * verdades para a mesma caixa.
 */
export function createMeasurePackageBox(dependencies: {
  readonly repository: PackageBoxRepositoryPort
}): MeasurePackageBox {
  return {
    async execute(input): Promise<boolean> {
      return dependencies.repository.measure({
        boxId: input.boxId,
        companyId: input.context.companyId,
        measurement: input.measurement,
      })
    },
  }
}
