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

/** Acima disso a tabela vira dezenas de milhares de linhas no DOM e a janela trava ao rolar. */
export const CTE_EMISSION_MAX_VISIBLE_ROWS = 200

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
 * caísse no meio de um par emitiria dois CT-es onde a regra pede um, e isso é erro fiscal. Por isso
 * esse modo sai numa fatia só, e o teto por requisição continua valendo para ele.
 */
export function chunkEmissionSelection(
  input: Readonly<{
    documentIds: readonly string[]
    groupingMode: CteEmissionGroupingMode
    size?: number
  }>,
): readonly CteEmissionChunk[] {
  const documentIds = [...new Set(input.documentIds)]
  if (documentIds.length === 0) return []
  if (input.groupingMode === 'sender_recipient') return [{ documentIds, index: 0 }]

  const size = Math.max(1, input.size ?? CTE_EMISSION_CHUNK_SIZE)
  const chunks: CteEmissionChunk[] = []
  for (let offset = 0; offset < documentIds.length; offset += size) {
    chunks.push({ documentIds: documentIds.slice(offset, offset + size), index: chunks.length })
  }

  return chunks
}

/** Nome do lote por fatia — sem sufixo quando a seleção coube numa só, para não poluir a tela. */
export function buildChunkBatchName(
  input: Readonly<{ index: number; name: string; total: number }>,
): string {
  if (input.total <= 1) return input.name
  return `${input.name} (${input.index + 1}/${input.total})`
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
