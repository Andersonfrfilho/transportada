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

/** Status HTTP que não são recusa de negócio: infraestrutura passageira, a próxima tentativa serve. */
const NON_BUSINESS_REJECTION_STATUSES = new Set([401, 403, 408, 429])

/**
 * ADR-0075 §6, revisão M2: "Descartar" é para recusa de **negócio** — o servidor examinou o evento
 * e decidiu que ele não vale. Sessão expirada, autenticação, tempo esgotado, limite de taxa e erro
 * do servidor (`401`/`403`/`408`/`429`/5xx) são infraestrutura passageira, como `REQUEST_FAILED`
 * (a causa genérica de `toOutcome` para erro que não veio de `DriverTripRequestError`, inclusive a
 * sessão expirada de `getAccessToken`): descartar apagaria uma entrega que a próxima tentativa
 * enviaria.
 */
function isBusinessRejectionCause(cause: string): boolean {
  if (cause === 'REQUEST_FAILED') return false
  const status = Number.parseInt(cause, 10)
  if (Number.isNaN(status)) return true
  if (NON_BUSINESS_REJECTION_STATUSES.has(status)) return false
  return status < 500 || status > 599
}

/** Recusado pelo servidor por motivo de negócio — o evento ou um anexo dele. */
export function isEventQueueItemDiscardable(item: EventQueueItemView): boolean {
  const isEventDiscardable =
    item.status.state === 'rejected' && isBusinessRejectionCause(item.status.cause)
  const isAttachmentDiscardable =
    item.attachmentRejectionCause !== undefined &&
    isBusinessRejectionCause(item.attachmentRejectionCause)
  return isEventDiscardable || isAttachmentDiscardable
}
