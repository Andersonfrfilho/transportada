/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/eventQueueView.service.ts (ADR-0075 §7). */
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
  /** Spec 189 T9.2: gravado sem rede, esperando o dono confirmar ("Confirmar em lote"). */
  | Readonly<{ state: 'unverified' }>

export type EventQueueItemView = Readonly<{
  attachmentCount: number
  /**
   * Recusa **do anexo**, não do evento: o evento aceito permanece aceito, e esta causa aparece ao
   * lado como problema do arquivo — o reenvio manual só re-POSTa o anexo.
   */
  attachmentRejectionCause?: string
  /** Spec 179 (T303): a nota da ocorrência com foto — é por ela que o cartão diz "na fila". */
  documentId?: string
  idempotencyKey: string
  /** `proof` é o grupo de anexos cujo evento já subiu — só os arquivos ainda aguardam. */
  kind: DriverFieldReport['kind'] | 'proof'
  queuedAt: string
  status: EventQueueItemStatus
}>

function toStatus(item: QueuedReport): EventQueueItemStatus {
  if (item.rejectionCause !== undefined) return { cause: item.rejectionCause, state: 'rejected' }
  if (item.isUnverified === true) return { state: 'unverified' }
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
    const report = item.report
    /** A foto da ocorrência mora no próprio item: sobe junto dele, e conta como anexo dele. */
    const carriesPhoto = report.kind === 'documentOccurrence' && report.photo !== null
    return {
      attachmentCount: group.length + (carriesPhoto ? 1 : 0),
      ...(attachmentCause === undefined ? {} : { attachmentRejectionCause: attachmentCause }),
      ...(report.kind === 'documentOccurrence' ? { documentId: report.documentId } : {}),
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
        status:
          cause !== undefined
            ? { cause, state: 'rejected' }
            : group.some((attachment) => attachment.isUnverified === true)
              ? { state: 'unverified' }
              : { state: 'queued' },
      }
    })

  return [...eventViews, ...orphanViews]
}

/**
 * "Enviar todos" só faz sentido com algo enviável — rejeitado é decisão do servidor, item a item, e
 * o não verificado espera a confirmação do dono, na faixa própria.
 */
export function hasSendableEvents(items: readonly EventQueueItemView[]): boolean {
  return items.some(
    (item) => item.status.state !== 'rejected' && item.status.state !== 'unverified',
  )
}
