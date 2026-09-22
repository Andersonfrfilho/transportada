/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  estimateStorablePackageBoxFromUnit,
  type PackageBoxEstimate,
} from '../domain/package-box-estimate.policy.js'
import { PackageBoxNotFoundError } from '../domain/package-box-measurement.error.js'
import { evaluatePackageBoxUnitSanity } from '../domain/package-box-unit-sanity.policy.js'
import { PackageBoxUnitRejectedError } from '../domain/package-box-unit.error.js'
import type {
  PackageBoxStoredEstimate,
  PackageBoxUnit,
  PackageBoxUnitRepositoryPort,
  PackageBoxUnitSource,
} from './package-box-unit.port.js'

export type RecordPackageBoxUnitInput = {
  readonly boxId: string
  readonly context: { readonly companyId: string }
  readonly source: PackageBoxUnitSource
  readonly unit: PackageBoxUnit
  readonly unitsPerBox?: number | undefined
}

export type RecordPackageBoxUnitResult = {
  readonly estimate: PackageBoxEstimate | undefined
}

export type RecordPackageBoxUnit = {
  execute(input: RecordPackageBoxUnitInput): Promise<RecordPackageBoxUnitResult>
}

/**
 * Spec 163, P1 + RF03 + RF04: grava a medida da unidade e recalcula a caixa estimada. A estimativa
 * nunca vira medida (RNF02): o repositório não recebe campo de medida real, e só escreve a
 * estimativa enquanto a caixa não foi medida. `companyId` vem sempre do contexto autenticado.
 */
export function createRecordPackageBoxUnit(dependencies: {
  readonly now?: () => Date
  readonly repository: PackageBoxUnitRepositoryPort
}): RecordPackageBoxUnit {
  const now = dependencies.now ?? (() => new Date())
  return {
    async execute(input): Promise<RecordPackageBoxUnitResult> {
      const sanity = evaluatePackageBoxUnitSanity(input.unit)
      if (!sanity.accepted) throw new PackageBoxUnitRejectedError(sanity.reasons)

      const target = await dependencies.repository.findUnitTarget({
        boxId: input.boxId,
        companyId: input.context.companyId,
      })
      if (target === null) throw new PackageBoxNotFoundError()

      const estimate = estimateStorablePackageBoxFromUnit({
        unit: input.unit,
        unitsPerBox: input.unitsPerBox ?? target.unitsPerBox,
      })
      const storedEstimate: PackageBoxStoredEstimate | null =
        estimate === undefined ? null : { ...estimate, estimatedAt: now() }

      const saved = await dependencies.repository.saveUnit({
        boxId: input.boxId,
        companyId: input.context.companyId,
        estimate: storedEstimate,
        unit: input.unit,
        unitSource: input.source,
        unitsPerBox: input.unitsPerBox,
      })
      if (!saved) throw new PackageBoxNotFoundError()

      return { estimate }
    },
  }
}
