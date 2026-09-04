/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport } from './driverTrip.types'
import type { AttachmentGroupEntries } from './offlineAttachments.service'
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
  /**
   * Recusa **do anexo**, não do evento: o evento aceito permanece aceito, e esta causa aparece ao
   * lado como problema do arquivo — o reenvio manual só re-POSTa o anexo.
   */
  attachmentRejectionCause?: string
  idempotencyKey: string
  /** `proof` é o grupo de anexos cujo evento já subiu — só os arquivos ainda aguardam. */
  kind: DriverFieldReport['kind'] | 'proof'
  queuedAt: string
  status: EventQueueItemStatus
}>

function toStatus(item: QueuedReport): EventQueueItemStatus {
  if (item.rejectionCause !== undefined) return { cause: item.rejectionCause, state: 'rejected' }
  if (item.attempts > 0) return { attempts: item.attempts, state: 'failed' }
  return { state: 'queued' }
}

export function buildEventQueueView(input: {
  readonly attachments: AttachmentGroupEntries
  readonly queued: readonly QueuedReport[]
}): readonly EventQueueItemView[] {
  const groupByKey = new Map(input.attachments)
  const queuedKeys = new Set(input.queued.map((item) => item.report.idempotencyKey))

  const eventViews = input.queued.map((item): EventQueueItemView => {
    const group = groupByKey.get(item.report.idempotencyKey) ?? []
    const attachmentCause = group.find(
      (attachment) => attachment.rejectionCause !== undefined,
    )?.rejectionCause
    return {
      attachmentCount: group.length,
      ...(attachmentCause === undefined ? {} : { attachmentRejectionCause: attachmentCause }),
      idempotencyKey: item.report.idempotencyKey,
      kind: item.report.kind,
      queuedAt: item.createdAt,
      status: toStatus(item),
    }
  })

  /** Evento já aceito com anexo ainda por subir: o grupo aparece como item próprio, nunca some. */
  const orphanViews = input.attachments
    .filter(([eventKey, group]) => !queuedKeys.has(eventKey) && group.length > 0)
    .map(([eventKey, group]): EventQueueItemView => {
      const cause = group.find(
        (attachment) => attachment.rejectionCause !== undefined,
      )?.rejectionCause
      return {
        attachmentCount: group.length,
        ...(cause === undefined ? {} : { attachmentRejectionCause: cause }),
        idempotencyKey: eventKey,
        kind: 'proof',
        queuedAt: group[0]?.capturedAt ?? '',
        status: cause === undefined ? { state: 'queued' } : { cause, state: 'rejected' },
      }
    })

  return [...eventViews, ...orphanViews]
}

/** "Enviar todos" só faz sentido com algo enviável — rejeitado é decisão do servidor, item a item. */
export function hasSendableEvents(items: readonly EventQueueItemView[]): boolean {
  return items.some((item) => item.status.state !== 'rejected')
}
