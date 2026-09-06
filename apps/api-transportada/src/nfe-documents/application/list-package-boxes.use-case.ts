/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  buildMeasurementQueue,
  reduceToGtin13,
  type MeasurementQueue,
} from '../domain/package-box-queue.policy.js'
import type {
  PackageBoxFilters,
  PackageBoxRepositoryPort,
  PackageBoxView,
} from './package-box.port.js'

export type ListPackageBoxesResult = {
  readonly coveredCount: number
  readonly items: readonly (PackageBoxView & {
    readonly cumulativeShare: number
    readonly share: number
    readonly withinCoverage: boolean
  })[]
  readonly totalVolumes: number
}

export type ListPackageBoxes = {
  execute(input: {
    readonly context: { readonly companyId: string }
    readonly filters: PackageBoxFilters & { readonly scanned?: string }
    readonly limit: number
  }): Promise<ListPackageBoxesResult>
}

/**
 * A fila do conferente (spec 085 G005). A ordem e o acumulado saem da política, não da consulta: o
 * banco sabe quanto cada caixa transportou, mas é o domínio que decide até onde medir compensa.
 *
 * ⚠️ A etiqueta bipada passa por `reduceToGtin13` **aqui**, e não no repositório: o DUN-14 da caixa
 * e o GTIN-13 do produto são a mesma coisa para quem procura, e o SQL não deve saber disso.
 */
export function createListPackageBoxes(dependencies: {
  readonly repository: PackageBoxRepositoryPort
}): ListPackageBoxes {
  return {
    async execute(input): Promise<ListPackageBoxesResult> {
      const { scanned, ...filters } = input.filters
      const items = await dependencies.repository.list({
        companyId: input.context.companyId,
        filters: {
          ...filters,
          ...(scanned === undefined ? {} : { scanCodes: buildScanCodes(scanned) }),
        },
        limit: input.limit,
      })

      const queue: MeasurementQueue = buildMeasurementQueue({
        items: items.map((item) => ({
          id: item.id,
          measured: item.measuredAt !== null,
          transportedVolumes: item.transportedVolumes,
        })),
      })
      const byId = new Map(items.map((item) => [item.id, item]))

      return {
        coveredCount: queue.coveredCount,
        items: queue.entries.flatMap((entry) => {
          const item = byId.get(entry.id)
          return item === undefined
            ? []
            : [
                {
                  ...item,
                  cumulativeShare: entry.cumulativeShare,
                  share: entry.share,
                  withinCoverage: entry.withinCoverage,
                },
              ]
        }),
        totalVolumes: queue.totalVolumes,
      }
    },
  }
}

/**
 * Os códigos que a etiqueta lida pode ser: ela mesma, e o GTIN-13 dela quando a redução se aplica.
 *
 * ⚠️ **Leitura ilegível devolve lista vazia, não ausência de filtro.** Código com prefixo de
 * Application Identifier, ITF-14 com dígito perdido ou etiqueta suja fazem `reduceToGtin13`
 * devolver `null`; tratar isso como "sem filtro" mostrava as cinquenta primeiras caixas da fila
 * como se a busca tivesse dado resultado, e o conferente media a primeira da lista — que não é a
 * que está na mão dele.
 */
function buildScanCodes(scanned: string): readonly string[] {
  const trimmed = scanned.trim()
  if (trimmed === '') return []
  const reduced = reduceToGtin13(trimmed)
  return reduced === null || reduced === trimmed ? [trimmed] : [trimmed, reduced]
}
