/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'
import type { QueuedReport } from './offlineQueue.service'

/**
 * Spec 082 D7: o que a tela de eventos pendentes imprime, derivado da fila sem tocar em DOM. O
 * estado é lido do item como ele está gravado — a tela não inventa nada por cima (ADR-0045 §5).
 */
export type EventQueueItemStatus =
  | Readonly<{ attempts: number; state: 'failed' }>
  | Readonly<{ cause: string; state: 'rejected' }>
  | Readonly<{ state: 'queued' }>

export type EventQueueItemView = Readonly<{
  attachmentCount: number
  idempotencyKey: string
  kind: DriverFieldReport['kind']
  queuedAt: string
  status: EventQueueItemStatus
}>

function toStatus(item: QueuedReport): EventQueueItemStatus {
  if (item.rejectionCause !== undefined) return { cause: item.rejectionCause, state: 'rejected' }
  if (item.attempts > 0) return { attempts: item.attempts, state: 'failed' }
  return { state: 'queued' }
}

export function buildEventQueueView(input: {
  readonly attachmentCounts: Readonly<Record<string, number>>
  readonly queued: readonly QueuedReport[]
}): readonly EventQueueItemView[] {
  return input.queued.map((item) => ({
    attachmentCount: input.attachmentCounts[item.report.idempotencyKey] ?? 0,
    idempotencyKey: item.report.idempotencyKey,
    kind: item.report.kind,
    queuedAt: item.createdAt,
    status: toStatus(item),
  }))
}

/** "Enviar todos" só faz sentido com algo enviável — rejeitado é decisão do servidor, item a item. */
export function hasSendableEvents(items: readonly EventQueueItemView[]): boolean {
  return items.some((item) => item.status.state !== 'rejected')
}
