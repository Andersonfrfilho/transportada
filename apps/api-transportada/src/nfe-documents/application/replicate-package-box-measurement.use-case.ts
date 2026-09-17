/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PackageBoxRepositoryPort } from './package-box.port.js'

export type ReplicatePackageBoxMeasurement = {
  execute(input: {
    readonly boxId: string
    readonly context: { readonly companyId: string; readonly userId: string }
    readonly targetIds: readonly string[]
  }): Promise<{ readonly replicatedCount: number }>
}

/**
 * Copia a medida de uma caixa para as irmãs da mesma família (spec 155 D1, D4, D6, G004). A
 * validação (origem medida, alvo na empresa e na família, alvo ainda sem medida) mora no
 * repositório: ela lê a origem e os alvos dentro da mesma transação que grava, e o ator do
 * histórico vem sempre do contexto autenticado, nunca do corpo.
 */
export function createReplicatePackageBoxMeasurement(dependencies: {
  readonly repository: PackageBoxRepositoryPort
}): ReplicatePackageBoxMeasurement {
  return {
    async execute(input): Promise<{ readonly replicatedCount: number }> {
      const replicatedCount = await dependencies.repository.replicate({
        boxId: input.boxId,
        companyId: input.context.companyId,
        measuredByUserId: input.context.userId,
        targetIds: input.targetIds,
      })

      return { replicatedCount }
    },
  }
}
