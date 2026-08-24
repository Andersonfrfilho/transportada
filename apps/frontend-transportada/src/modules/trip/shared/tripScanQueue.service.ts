/* Copyright (c) 2026 Ada Technology. MIT License. */
import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'

export type TripScanEntryStatus = 'linked' | 'linking' | 'refused' | 'resolving'

export type TripScanEntry = Readonly<{
  accessKey: string
  issueKey?: string
  status: TripScanEntryStatus
}>

export type TripScanQueue = readonly TripScanEntry[]

export type AcceptScannedTextInput = Readonly<{ queue: TripScanQueue; text: string }>

/** `accessKey` só vem preenchida quando a leitura virou linha nova — é ela que autoriza a busca. */
export type TripScanAcceptance = Readonly<{ accessKey?: string; queue: TripScanQueue }>

export type MarkScanEntryInput = Readonly<{
  accessKey: string
  issueKey?: string
  queue: TripScanQueue
  status: TripScanEntryStatus
}>

const PENDING_STATUSES: readonly TripScanEntryStatus[] = ['linking', 'resolving']

/**
 * A câmera devolve o que estiver na frente dela e a leitura dispara a cada quadro: leitura sem
 * chave é descartada em silêncio, e a nota já lida — inclusive a recusada — não vira segunda linha
 * nem segunda chamada enquanto estiver na lista.
 */
export function acceptScannedText({ queue, text }: AcceptScannedTextInput): TripScanAcceptance {
  const accessKey = extractNfeAccessKey(text)
  if (accessKey === undefined) return { queue }
  if (queue.some((entry) => entry.accessKey === accessKey)) return { queue }

  return { accessKey, queue: [...queue, { accessKey, status: 'resolving' }] }
}

/** Veredito chega fora de ordem: o que perdeu a linha dele não pode ressuscitá-la. */
export function markScanEntry({
  accessKey,
  issueKey,
  queue,
  status,
}: MarkScanEntryInput): TripScanQueue {
  if (!queue.some((entry) => entry.accessKey === accessKey)) return queue

  return queue.map((entry) =>
    entry.accessKey === accessKey
      ? { accessKey, status, ...(issueKey === undefined ? {} : { issueKey }) }
      : entry,
  )
}

export function isTripScanEntryPending(entry: TripScanEntry): boolean {
  return PENDING_STATUSES.includes(entry.status)
}
