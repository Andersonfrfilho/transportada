/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  PackageBoxMeasurementExportPage,
  PackageBoxMeasurementExportRepositoryPort,
} from './package-box-measurement-export.port.js'

export type ListPackageBoxMeasurements = {
  execute(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly from: string | undefined
    readonly limit: number
    readonly to: string | undefined
  }): Promise<PackageBoxMeasurementExportPage>
}

/**
 * Spec 152 (T5, experimental): camada fina, como `createListNfeDocumentEvents` (spec 149 D19) — o
 * join com a caixa e a resolução do ator por membership são responsabilidade do repositório.
 */
export function createListPackageBoxMeasurements(dependencies: {
  readonly repository: PackageBoxMeasurementExportRepositoryPort
}): ListPackageBoxMeasurements {
  return {
    execute(input) {
      return dependencies.repository.listMeasurements(input)
    },
  }
}
