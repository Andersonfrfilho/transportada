/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CTE_BATCH_ITEM_STATUS } from './cteBatchItem.types'

/** O worker fecha a emissão em segundos — sem releitura a tela envelhece em "Submetido" até o F5. */
export const CTE_BATCH_PROGRESS_INTERVAL_MS = 3000

/** Estados que ainda mudam sozinhos: quem os move é o worker, não um novo comando do operador. */
const TRANSMITTING_BATCH_STATUSES: readonly string[] = ['in_flight', 'submitted']
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
