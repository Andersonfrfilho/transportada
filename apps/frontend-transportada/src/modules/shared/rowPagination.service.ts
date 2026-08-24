/* Copyright (c) 2026 Ada Technology. MIT License. */

export type RowPage<TRow> = Readonly<{
  canGoToPreviousPage: boolean
  firstShown: number
  hasNextPage: boolean
  lastShown: number
  pageCount: number
  pageNumber: number
  rows: readonly TRow[]
  total: number
}>

/**
 * Paginação em memória para tabela de conferência: as linhas já estão todas carregadas, e o corte
 * existe só porque dezenas de milhares de `<tr>` travam a janela ao rolar. Antes disso as tabelas
 * cortavam num teto fixo e resumiam o resto num aviso de rodapé — quem conferia um lote grande não
 * tinha como olhar as últimas linhas.
 *
 * A página pedida é fixada dentro do que existe: trocar o tamanho da página estando na última
 * deixaria a tabela vazia com o total cheio, que lê como "a operação perdeu as linhas".
 */
export function paginateRows<TRow>(
  input: Readonly<{ page: number; pageSize: number; rows: readonly TRow[] }>,
): RowPage<TRow> {
  const total = input.rows.length
  const pageSize = Math.max(1, input.pageSize)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const pageNumber = Math.min(Math.max(1, input.page), pageCount)
  const offset = (pageNumber - 1) * pageSize
  const rows = input.rows.slice(offset, offset + pageSize)

  return {
    canGoToPreviousPage: pageNumber > 1,
    firstShown: total === 0 ? 0 : offset + 1,
    hasNextPage: pageNumber < pageCount,
    lastShown: offset + rows.length,
    pageCount,
    pageNumber,
    rows,
    total,
  }
}

/** O tamanho guardado pode ter vindo de uma versão anterior da tela; fora da lista, cai no padrão. */
export function parsePageSize<TSize extends number>(
  input: Readonly<{ fallback: TSize; sizes: readonly TSize[]; value: string }>,
): TSize {
  const parsed = Number(input.value)

  return input.sizes.find((size) => size === parsed) ?? input.fallback
}
