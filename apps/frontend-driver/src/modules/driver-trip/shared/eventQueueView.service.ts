/* Cópia por valor de apps/frontend-transportada/src/modules/driver-trip/shared/eventQueueView.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverFieldReport, DriverTripStop } from './driverTrip.types'
import type { AttachmentGroupEntries, QueuedAttachment } from './offlineAttachments.service'
import type { DriverTripErrorDetail, QueuedReport } from './offlineQueue.service'
import { resolveRejectionCauseCode } from './rejectionCauseLabel.service'

/** Spec 206 RF8b: só este código dispara o motivo e o atalho — qualquer outra recusa fica genérica. */
const DEPART_BLOCKED_CODE = 'TRIP_HAS_STOP_EN_ROUTE'

/**
 * Spec 082 D7: o que a tela de eventos pendentes imprime, derivado da fila sem tocar em DOM. O
 * estado é lido do item como ele está gravado — a tela não inventa nada por cima (ADR-0045 §5).
 */
export type EventQueueItemStatus =
  | Readonly<{ attempts: number; state: 'failed' }>
  | Readonly<{
      cause: string
      /** Spec 206 D9/RF8b: `error.details` da recusa (409 en-route), quando a API os manda. */
      details?: readonly DriverTripErrorDetail[]
      state: 'rejected'
    }>
  | Readonly<{ state: 'queued' }>
  /** Spec 189 T9.2: gravado sem rede, esperando o dono confirmar ("Confirmar em lote"). */
  | Readonly<{ state: 'unverified' }>

/** Spec 218: o anexo do canhoto que o grupo guarda — o que a captura precisa para nascer "anexada". */
export type QueuedProofAttachmentView = Readonly<{
  attachmentKey: string
  blob: Blob
  documentId: string
  kind: QueuedAttachment['kind']
}>

export type EventQueueItemView = Readonly<{
  attachmentCount: number
  /**
   * Recusa **do anexo**, não do evento: o evento aceito permanece aceito, e esta causa aparece ao
   * lado como problema do arquivo — o reenvio manual só re-POSTa o anexo.
   */
  attachmentRejectionCause?: string
  /**
   * Spec 179 (T303): a nota da ocorrência com foto — é por ela que o cartão diz "na fila". Spec
   * 207: o mesmo campo, para o grupo órfão `kind: 'proof'` — é o que diz de qual nota é a foto ou
   * assinatura do canhoto ainda pendente, para oferecer "Remover" só enquanto ela está aqui. Spec
   * 206: também em `deliver`/`return` — é o que `resolveEnRouteStopId` usa para saber se as notas
   * pendentes da parada a caminho já foram todas resolvidas na fila (D9).
   */
  documentId?: string
  idempotencyKey: string
  /** `proof` é o grupo de anexos cujo evento já subiu — só os arquivos ainda aguardam. */
  kind: DriverFieldReport['kind'] | 'proof'
  /** Spec 218: os anexos do grupo (espera, evento ou órfão), só quando há algum. */
  proofAttachments?: readonly QueuedProofAttachmentView[]
  queuedAt: string
  /**
   * Pedido do usuário (25/09), spec 082: em `arrive` — é o que "Cheguei" libera. Spec 206: também em
   * `depart`/`cancelDeparture` — é o que `resolveEnRouteStopId` segue sem esperar o servidor.
   */
  stopId?: string
  status: EventQueueItemStatus
}>

function toProofAttachments(
  group: readonly QueuedAttachment[],
): Pick<EventQueueItemView, 'proofAttachments'> {
  if (group.length === 0) return {}
  return {
    proofAttachments: group.map(({ attachmentKey, blob, documentId, kind }) => ({
      attachmentKey,
      blob,
      documentId,
      kind,
    })),
  }
}

function toStatus(item: QueuedReport): EventQueueItemStatus {
  if (item.rejectionCause !== undefined) {
    return {
      cause: item.rejectionCause,
      ...(item.rejectionDetails === undefined ? {} : { details: item.rejectionDetails }),
      state: 'rejected',
    }
  }
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
    const carriesPhoto =
      (report.kind === 'documentOccurrence' && report.photo !== null) ||
      report.kind === 'stopOccurrencePhoto'
    return {
      attachmentCount: group.length + (carriesPhoto ? 1 : 0),
      ...(attachmentCause === undefined ? {} : { attachmentRejectionCause: attachmentCause }),
      ...(report.kind === 'documentOccurrence' ||
      report.kind === 'deliver' ||
      report.kind === 'return'
        ? { documentId: report.documentId }
        : {}),
      idempotencyKey: item.report.idempotencyKey,
      kind: item.report.kind,
      ...toProofAttachments(group),
      queuedAt: item.createdAt,
      ...(report.kind === 'arrive' || report.kind === 'depart' || report.kind === 'cancelDeparture'
        ? { stopId: report.stopId }
        : {}),
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
        ...(group[0]?.documentId === undefined ? {} : { documentId: group[0].documentId }),
        idempotencyKey: eventKey,
        kind: 'proof',
        ...toProofAttachments(group),
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

export type QueuedProofAttachments = Readonly<{
  /** Spec 220: a mercadoria acumula — todas as fotos da nota que a fila ainda guarda, não só a última. */
  cargo: readonly QueuedProofAttachmentView[]
  photo?: QueuedProofAttachmentView
  signature?: QueuedProofAttachmentView
}>

/**
 * Spec 218: o que a fila ainda guarda do canhoto de uma nota, por kind — o último de cada vence
 * (um "Refazer" enfileira outro). Qualquer grupo serve: a espera do gate, o do evento de entrega ou
 * o órfão de uma entrega que já subiu. É daqui que a captura nasce "anexada" depois do remonte.
 */
export function resolveQueuedProofAttachments(input: {
  readonly documentId: string
  readonly queueView: readonly EventQueueItemView[]
}): QueuedProofAttachments {
  const ofDocument = input.queueView
    .flatMap((item) => item.proofAttachments ?? [])
    .filter((attachment) => attachment.documentId === input.documentId)
  const photo = ofDocument.findLast((attachment) => attachment.kind === 'photo')
  const signature = ofDocument.findLast((attachment) => attachment.kind === 'signature')
  return {
    cargo: ofDocument.filter((attachment) => attachment.kind === 'cargo'),
    ...(photo === undefined ? {} : { photo }),
    ...(signature === undefined ? {} : { signature }),
  }
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

/**
 * Spec 206 RF8: o número da parada do item ("Iniciar rota — parada N") — `undefined` quando a
 * parada saiu do snapshot (viagem trocada, cartão sumido); a tela cai no rótulo sem número.
 */
export function resolveEventQueueStopSequence(input: {
  readonly item: EventQueueItemView
  readonly stops: readonly DriverTripStop[]
}): number | undefined {
  if (input.item.stopId === undefined) return undefined
  return input.stops.find((stop) => stop.id === input.item.stopId)?.sequence
}

export type EventQueueDepartBlock = Readonly<{
  blockingStopId: string
  blockingStopSequence: number
}>

function detailValue(
  details: readonly DriverTripErrorDetail[] | undefined,
  field: string,
): string | undefined {
  return details?.find((detail) => detail.field === field)?.message
}

/**
 * Spec 206 D9/RF8b: a `blockingStopId` que o `409` mandou em `error.details` — o caso em que a
 * tela não viu o bloqueio (outro aparelho, item enfileirado antes do snapshot que trouxe o "a
 * caminho"). `resolveEnRouteStopId` local não sabe disso: só o servidor sabia, no instante da
 * recusa. A sequência prefere a do snapshot atual (mais fresca); sem a parada ali (saiu da
 * viagem), cai na que o próprio servidor mandou.
 */
function resolveServerDepartBlock(input: {
  readonly details: readonly DriverTripErrorDetail[] | undefined
  readonly stops: readonly DriverTripStop[]
}): EventQueueDepartBlock | undefined {
  const blockingStopId = detailValue(input.details, 'enRouteStopId')
  if (blockingStopId === undefined) return undefined

  const knownStop = input.stops.find((stop) => stop.id === blockingStopId)
  if (knownStop !== undefined) {
    return { blockingStopId, blockingStopSequence: knownStop.sequence }
  }

  const sequenceFromServer = Number(detailValue(input.details, 'enRouteStopSequence'))
  if (!Number.isFinite(sequenceFromServer)) return undefined
  return { blockingStopId, blockingStopSequence: sequenceFromServer }
}

/**
 * Spec 206 RF8b: o `depart` recusado por `409 TRIP_HAS_STOP_EN_ROUTE` não pode sumir calado — a
 * tela precisa do motivo ("Outra parada está a caminho — feche a parada N") e do atalho até ela.
 *
 * Duas fontes, nesta ordem: 1) o `blockingStopId` que o próprio `409` mandou em `error.details` —
 * o único jeito de acertar a parada quando a tela não viu o bloqueio (D9); 2) sem isso (resposta
 * antiga, sem `details`), a parada que `resolveEnRouteStopId` (D9) diz estar a caminho AGORA — que
 * cobre o caso comum, mas pode devolver `undefined` se ela já fechou entre a recusa e agora.
 */
export function resolveEventQueueDepartBlock(input: {
  readonly enRouteStopId: string | undefined
  readonly item: EventQueueItemView
  readonly stops: readonly DriverTripStop[]
}): EventQueueDepartBlock | undefined {
  if (input.item.kind !== 'depart') return undefined
  if (input.item.status.state !== 'rejected') return undefined
  if (resolveRejectionCauseCode(input.item.status.cause) !== DEPART_BLOCKED_CODE) return undefined

  const fromServer = resolveServerDepartBlock({
    details: input.item.status.details,
    stops: input.stops,
  })
  if (fromServer !== undefined) return fromServer

  if (input.enRouteStopId === undefined) return undefined
  const blockingStop = input.stops.find((stop) => stop.id === input.enRouteStopId)
  if (blockingStop === undefined) return undefined

  return { blockingStopId: blockingStop.id, blockingStopSequence: blockingStop.sequence }
}
