/* Copyright (c) 2026 Ada Technology. MIT License. */
import { resolveProgressPercent } from '@/modules/shared/progress.service'

import { CTE_BATCH_ITEM_STATUS } from './cteBatchItem.types'

/** O worker fecha a emissão em segundos — sem releitura a tela envelhece em "Submetido" até o F5. */
export const CTE_BATCH_PROGRESS_INTERVAL_MS = 3000

/** Estados que ainda mudam sozinhos: quem os move é o worker, não um novo comando do operador. */
const TRANSMITTING_BATCH_STATUSES: readonly string[] = ['in_flight', 'submitted']

/** Onde um lote transmitido para de andar. Fora daqui, a leitura ainda deve alguma coisa. */
const SETTLED_BATCH_STATUSES: readonly string[] = ['cancelled', 'done', 'error']
const TRANSMITTING_ITEM_STATUSES: readonly string[] = [
  CTE_BATCH_ITEM_STATUS.IN_FLIGHT,
  CTE_BATCH_ITEM_STATUS.PENDING,
  CTE_BATCH_ITEM_STATUS.RETRY_SCHEDULED,
]

type ProgressPage = Readonly<{ items: readonly Readonly<{ status: string }>[] }>

export function isCteBatchTransmitting(status: string): boolean {
  return TRANSMITTING_BATCH_STATUSES.includes(status)
}

export function isCteItemTransmitting(status: string): boolean {
  return TRANSMITTING_ITEM_STATUSES.includes(status)
}

/** `false` desliga o polling do TanStack Query: só relê enquanto houver transição pendente. */
function resolveProgressInterval(
  page: ProgressPage | undefined,
  isTransmitting: (status: string) => boolean,
): false | number {
  if (page === undefined) return false
  return page.items.some((item) => isTransmitting(item.status))
    ? CTE_BATCH_PROGRESS_INTERVAL_MS
    : false
}

export function resolveCteBatchProgressInterval(page: ProgressPage | undefined): false | number {
  return resolveProgressInterval(page, isCteBatchTransmitting)
}

export function resolveCteItemProgressInterval(page: ProgressPage | undefined): false | number {
  return resolveProgressInterval(page, isCteItemTransmitting)
}

export type CteBatchTransmissionSummary = Readonly<{
  isComplete: boolean
  percent: number
  settled: number
  total: number
  transmitting: number
}>

/**
 * A fila de submissão mede o que a API aceitou, não o que a SEFAZ respondeu — dizer "transmitido"
 * ali marcava 100% com o item ainda em voo. Aqui o progresso vem do estado relido de cada lote, e
 * lote ausente da página conta como em trânsito: dado que não chegou não vira conclusão.
 *
 * Só estado terminal encerra. Entre o POST e a primeira releitura a lista ainda devolve
 * "Rascunho", e ler essa ausência de transmissão como conclusão piscava 100% logo após o clique.
 */
export function resolveCteBatchTransmissionSummary(
  input: Readonly<{
    batchIds: readonly string[]
    batches: readonly Readonly<{ id: string; status: string }>[]
  }>,
): CteBatchTransmissionSummary {
  const statusById = new Map(input.batches.map((batch) => [batch.id, batch.status]))
  const settled = input.batchIds.filter((batchId) => {
    const status = statusById.get(batchId)
    return status !== undefined && SETTLED_BATCH_STATUSES.includes(status)
  }).length
  const total = input.batchIds.length

  return {
    isComplete: total > 0 && settled === total,
    percent: resolveProgressPercent({ completed: settled, total }),
    settled,
    total,
    transmitting: total - settled,
  }
}

/** Barra parada sem contador parece tela travada: o operador precisa ver a próxima releitura chegar. */
export function resolveSecondsUntilNextRefresh(
  input: Readonly<{ intervalMs: number; now: number; updatedAt: number }>,
): number {
  const elapsed = Math.max(0, input.now - input.updatedAt)

  return Math.max(0, Math.ceil((input.intervalMs - elapsed) / 1_000))
}
