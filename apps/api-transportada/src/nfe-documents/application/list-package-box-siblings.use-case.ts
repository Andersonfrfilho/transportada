/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { PackageBoxNotFoundError } from '../domain/package-box-measurement.error.js'
import type { PackageBoxRepositoryPort, PackageBoxSiblings } from './package-box.port.js'

export type ListPackageBoxSiblings = {
  execute(input: {
    readonly boxId: string
    readonly context: { readonly companyId: string }
  }): Promise<PackageBoxSiblings>
}

/**
 * As irmãs de uma caixa (spec 155 G003): a família de variação (replicável, D1) e o grupo de
 * embalagem (só agrupa a tela, nunca replica — D3), sempre separadas em duas listas.
 */
export function createListPackageBoxSiblings(dependencies: {
  readonly repository: PackageBoxRepositoryPort
}): ListPackageBoxSiblings {
  return {
    async execute(input): Promise<PackageBoxSiblings> {
      const siblings = await dependencies.repository.getSiblings({
        boxId: input.boxId,
        companyId: input.context.companyId,
      })
      if (siblings === null) throw new PackageBoxNotFoundError()

      return siblings
    },
  }
}
