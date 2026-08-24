/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'
import { resolveProgressPercent } from '@/modules/shared/progress.service'

import type { CteEmissionGroupingMode, CteEmissionPreview } from './cteEmission.service'

/**
 * Fatia da seleção que vira uma requisição. Abaixo do teto por requisição da API, para o corpo caber
 * no limite de 1 MiB e para o progresso avançar em passos que o operador enxerga.
 */
export const CTE_EMISSION_CHUNK_SIZE = 200

/** Projeção é leitura; a API responde em milissegundos, então três em voo saturam sem enfileirar. */
export const CTE_EMISSION_PREVIEW_CONCURRENCY = 3

/** Criação abre transação e grava itens: duas em voo é o teto seguro para o pool da API. */
export const CTE_EMISSION_CREATE_CONCURRENCY = 2

/**
 * Tamanhos de página da tabela de conferência. O teto de 200 existe porque acima disso a tabela
 * vira dezenas de milhares de linhas no DOM e a janela trava ao rolar — antes da paginação esse
 * número era um corte seco, e as linhas além dele só existiam como um aviso de rodapé.
 */
export const CTE_EMISSION_PAGE_SIZES = [50, 100, 200] as const

export type CteEmissionPageSize = (typeof CTE_EMISSION_PAGE_SIZES)[number]

export const CTE_EMISSION_DEFAULT_PAGE_SIZE: CteEmissionPageSize = 50

export function parseCteEmissionPageSize(value: string): CteEmissionPageSize {
  const parsed = Number(value)

  return CTE_EMISSION_PAGE_SIZES.find((size) => size === parsed) ?? CTE_EMISSION_DEFAULT_PAGE_SIZE
}

export type CteEmissionPage<TRow> = Readonly<{
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
 * A página pedida é fixada dentro do que existe: trocar o tamanho da página estando na última
 * deixaria a tabela vazia com o total cheio, que lê como "a emissão perdeu as linhas" — o susto
 * que esta tela justamente não pode dar.
 */
export function paginateEmissionRows<TRow>(
  input: Readonly<{ page: number; pageSize: number; rows: readonly TRow[] }>,
): CteEmissionPage<TRow> {
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

export type CteEmissionChunk = Readonly<{
  documentIds: readonly string[]
  index: number
}>

export type CteEmissionChunkResult<TValue> = Readonly<{
  chunk: CteEmissionChunk
  errorCode: null | string
  value: TValue | null
}>

export type CteEmissionProgressEvent = Readonly<{
  completed: number
  errorCount: number
  total: number
}>

export type CteEmissionProgress = Readonly<{
  completed: number
  errorCount: number
  isComplete: boolean
  percent: number
  total: number
}>

/**
 * `per_invoice` trata cada nota isoladamente, então fatiar não muda nenhum CT-e. Já
 * `sender_recipient` agrupa notas do mesmo par remetente/destinatário no mesmo CT-e — uma fatia que
 * caísse no meio de um par emitiria dois CT-es onde a regra pede um, e isso é erro fiscal. Com o
 * par de cada nota em mãos a fatia respeita o par inteiro, e um par maior que a fatia sai sozinho e
 * maior; sem esse mapa não há como provar o corte, e a seleção vai numa requisição só.
 */
export function chunkEmissionSelection(
  input: Readonly<{
    documentIds: readonly string[]
    groupKeyByDocumentId?: ReadonlyMap<string, string>
    groupingMode: CteEmissionGroupingMode
    size?: number
  }>,
): readonly CteEmissionChunk[] {
  const documentIds = [...new Set(input.documentIds)]
  if (documentIds.length === 0) return []

  const size = Math.max(1, input.size ?? CTE_EMISSION_CHUNK_SIZE)
  if (input.groupingMode !== 'sender_recipient') return sliceBySize({ documentIds, size })

  const groups = groupByPair({ documentIds, groupKeyByDocumentId: input.groupKeyByDocumentId })
  if (groups === null) return [{ documentIds, index: 0 }]

  return packGroups({ groups, size })
}

/**
 * Fila de concorrência limitada: uma fatia que falha não derruba as irmãs, e o progresso avança a
 * cada conclusão para a barra andar durante a emissão em vez de saltar no fim.
 */
export async function runEmissionQueue<TValue>(
  input: Readonly<{
    chunks: readonly CteEmissionChunk[]
    concurrency: number
    onProgress?: (event: CteEmissionProgressEvent) => void
    run: (chunk: CteEmissionChunk) => Promise<TValue>
  }>,
): Promise<readonly CteEmissionChunkResult<TValue>[]> {
  const total = input.chunks.length
  const results: CteEmissionChunkResult<TValue>[] = []
  let nextIndex = 0
  let completed = 0
  let errorCount = 0

  async function consume(): Promise<void> {
    for (let current = nextIndex++; current < total; current = nextIndex++) {
      const chunk = input.chunks[current]
      if (chunk === undefined) return
      try {
        const value = await input.run(chunk)
        results[current] = { chunk, errorCode: null, value }
      } catch (error) {
        errorCount += 1
        results[current] = { chunk, errorCode: readErrorCode(error), value: null }
      }
      completed += 1
      input.onProgress?.({ completed, errorCount, total })
    }
  }

  const lanes = Math.min(Math.max(1, input.concurrency), Math.max(1, total))
  await Promise.all(Array.from({ length: lanes }, consume))

  return results
}

export function resolveEmissionProgress(
  input: Readonly<{ completed: number; errorCount: number; total: number }>,
): CteEmissionProgress {
  const total = Math.max(0, input.total)
  const completed = Math.min(Math.max(0, input.completed), total)

  return {
    completed,
    errorCount: input.errorCount,
    isComplete: total > 0 && completed === total,
    percent: resolveProgressPercent({ completed, total }),
    total,
  }
}

/**
 * Junta as projeções das fatias numa só para a tela continuar mostrando um lote conceitual. O total
 * é somado em escala inteira — `Number` sobre `numeric(_, 4)` perderia centavo já na terceira fatia.
 */
export function mergeEmissionPreviews(
  previews: readonly CteEmissionPreview[],
): CteEmissionPreview | null {
  const [first] = previews
  if (first === undefined) return null

  const blocked = previews.flatMap((preview) => preview.blocked)
  const projections = previews.flatMap((preview) => preview.projections)

  return {
    blocked,
    projections,
    suggestedName: first.suggestedName,
    summary: {
      blockedCount: blocked.length,
      documentCount: previews.reduce((sum, preview) => sum + preview.summary.documentCount, 0),
      projectedCount: projections.length,
      totalAmount: sumScaledAmounts(previews.map((preview) => preview.summary.totalAmount)),
    },
  }
}

export function readErrorCode(error: unknown): null | string {
  return error instanceof Error ? error.message : null
}

function sliceBySize(
  input: Readonly<{ documentIds: readonly string[]; size: number }>,
): readonly CteEmissionChunk[] {
  const chunks: CteEmissionChunk[] = []
  for (let offset = 0; offset < input.documentIds.length; offset += input.size) {
    chunks.push({
      documentIds: input.documentIds.slice(offset, offset + input.size),
      index: chunks.length,
    })
  }

  return chunks
}

/** `null` quando alguma nota selecionada não está no mapa: sem o par dela, fatiar é adivinhação. */
function groupByPair(
  input: Readonly<{
    documentIds: readonly string[]
    groupKeyByDocumentId: ReadonlyMap<string, string> | undefined
  }>,
): readonly (readonly string[])[] | null {
  if (input.groupKeyByDocumentId === undefined) return null

  const groups = new Map<string, string[]>()
  for (const documentId of input.documentIds) {
    const groupKey = input.groupKeyByDocumentId.get(documentId)
    if (groupKey === undefined) return null
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), documentId])
  }

  return [...groups.values()]
}

function packGroups(
  input: Readonly<{ groups: readonly (readonly string[])[]; size: number }>,
): readonly CteEmissionChunk[] {
  const chunks: CteEmissionChunk[] = []
  let current: string[] = []

  for (const group of input.groups) {
    if (current.length > 0 && current.length + group.length > input.size) {
      chunks.push({ documentIds: current, index: chunks.length })
      current = []
    }
    current.push(...group)
  }
  if (current.length > 0) chunks.push({ documentIds: current, index: chunks.length })

  return chunks
}
