/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS } from '../domain/package-box-measurement.constant.js'
import type { ListPackageBoxes, ListPackageBoxesResult } from './list-package-boxes.use-case.js'

export type ExportPendingPackageBoxesResult = {
  readonly items: ListPackageBoxesResult['items']
  /** `true` só quando havia mais pendentes que o teto — o arquivo não é a fila inteira. */
  readonly truncated: boolean
}

export type ExportPendingPackageBoxes = {
  execute(input: {
    readonly context: { readonly companyId: string }
  }): Promise<ExportPendingPackageBoxesResult>
}

/**
 * Tudo o que falta medir, para o arquivo da aba Caixas. ⚠️ É a **mesma** fila de
 * `createListPackageBoxes` — mesma consulta, mesma ordem do que mais roda —, só que sem a janela de
 * 200 da tela: uma segunda ordenação aqui faria o arquivo discordar da fila que o conferente vê.
 *
 * Busca teto + 1 para saber se cortou sem contar a tabela. `maxItems` é injetável só para o
 * contrato não precisar inserir dez mil linhas.
 */
export function createExportPendingPackageBoxes(dependencies: {
  readonly listPackageBoxes: ListPackageBoxes
  readonly maxItems?: number
}): ExportPendingPackageBoxes {
  const maxItems = dependencies.maxItems ?? PACKAGE_BOX_PENDING_EXPORT_MAX_ITEMS
  /** Erro de montagem, no boot: teto zero devolveria sempre lista vazia com `truncated: true`. */
  if (!Number.isInteger(maxItems) || maxItems < 1) {
    throw new RangeError('maxItems must be a positive integer')
  }

  return {
    async execute(input): Promise<ExportPendingPackageBoxesResult> {
      const queue = await dependencies.listPackageBoxes.execute({
        context: input.context,
        filters: { status: 'pending' },
        limit: maxItems + 1,
      })

      return {
        items: queue.items.slice(0, maxItems),
        truncated: queue.items.length > maxItems,
      }
    },
  }
}
