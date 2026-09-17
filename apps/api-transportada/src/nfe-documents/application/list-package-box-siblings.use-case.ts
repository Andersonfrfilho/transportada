/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isLowConfidenceFamily } from '../domain/package-box-family.policy.js'
import { PackageBoxNotFoundError } from '../domain/package-box-measurement.error.js'
import type { ListPackageBoxSiblingsResult, PackageBoxRepositoryPort } from './package-box.port.js'

export type ListPackageBoxSiblings = {
  execute(input: {
    readonly boxId: string
    readonly context: { readonly companyId: string }
  }): Promise<ListPackageBoxSiblingsResult>
}

/**
 * As irmãs de uma caixa (spec 155 G003): a família de variação (replicável, D1) e o grupo de
 * embalagem (só agrupa a tela, nunca replica — D3), sempre separadas em duas listas.
 */
export function createListPackageBoxSiblings(dependencies: {
  readonly repository: PackageBoxRepositoryPort
}): ListPackageBoxSiblings {
  return {
    async execute(input): Promise<ListPackageBoxSiblingsResult> {
      const siblings = await dependencies.repository.getSiblings({
        boxId: input.boxId,
        companyId: input.context.companyId,
      })
      if (siblings === null) throw new PackageBoxNotFoundError()

      return {
        ...siblings,
        isLowConfidenceFamily:
          siblings.family.length > 0 &&
          isLowConfidenceFamily([
            siblings.originVariantLabel,
            ...siblings.family.map((sibling) => sibling.variantLabel),
          ]),
      }
    },
  }
}
