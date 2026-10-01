/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverReturnReason } from './driverTrip.types'
import type { EventQueueItemView } from './eventQueueView.service'

/**
 * Pedido do usuário (25/09): "registrei uma ocorrência e nada aconteceu?" — o toque de entregar,
 * devolver ou registrar uma ocorrência de parada entra na mesma fila offline de sempre
 * (`offlineQueue.service.ts`), e o motorista precisa VER isso. `kind` é o mesmo de `DriverFieldReport`
 * para as três ações que ganham retorno visível; `documentOccurrence` (a ocorrência da nota) já tem
 * o próprio `notDelivered.service.ts:resolveNotDeliveredStatus` — esta função cobre o resto.
 */
export type DocumentActivityKind = 'deliver' | 'occurrence' | 'return'

export type DocumentActivityStatus = 'queued' | 'rejected' | 'sent'

/** O que a tela guarda no toque: a chave que o toque gerou, e a hora local para a linha de estado. */
export type DocumentActivityRecord = Readonly<{ at: string; key: string }>

/** RF (25/09): entregue com o mesmo retorno de "na fila"/"enviada" que a devolução e a ocorrência. */
export type DocumentActivityView = Readonly<{ at: string; status: DocumentActivityStatus }>

/** A devolução carrega o motivo — é ele que a linha imprime ao lado da hora. */
export type DocumentReturnActivityView = Readonly<{
  at: string
  reason: DriverReturnReason
  status: DocumentActivityStatus
}>

/**
 * A chave é a mesma que o toque gerou (`createIdempotencyKey`), guardada no componente que fez o
 * toque. Sem ela (a página recarregou no meio) a linha simplesmente não aparece — melhor calado que
 * "enviado" errado, mesma regra do RF5 da spec 179.
 */
export function resolveDocumentActivityStatus(input: {
  readonly key: string | undefined
  readonly kind: DocumentActivityKind
  readonly queueView: readonly EventQueueItemView[]
  readonly sentReportKeys: ReadonlySet<string>
}): DocumentActivityStatus | undefined {
  if (input.key === undefined) return undefined
  const queued = input.queueView.find(
    (item) => item.kind === input.kind && item.idempotencyKey === input.key,
  )
  if (queued !== undefined) return queued.status.state === 'rejected' ? 'rejected' : 'queued'
  if (input.sentReportKeys.has(input.key)) return 'sent'
  return undefined
}

/**
 * O marcador do cabeçalho da parada: existe se a parada teve um "Deu problema" registrado, ou se
 * qualquer nota dela tem uma ocorrência (o painel "Registrar ocorrência" da nota, ou a foto do "Não
 * entreguei"). O status de cada uma (na fila, enviada, recusada) não importa aqui — o marcador é
 * sobre TER ocorrência, não sobre o destino dela.
 */
export function stopHasOccurrenceMarker(input: {
  readonly documentIds: readonly string[]
  readonly documentOccurrenceIds: ReadonlySet<string>
  readonly stopOccurrenceKey: string | undefined
}): boolean {
  if (input.stopOccurrenceKey !== undefined) return true
  return input.documentIds.some((documentId) => input.documentOccurrenceIds.has(documentId))
}

/**
 * Pedido do usuário (25/09): "Cheguei" libera a entrega. Chegada é o `arrivedAt` do snapshot **ou**
 * um "Cheguei" já na mesma fila offline que o acordeão usa para o resto da parada — a API deriva a
 * chegada da própria entrega (spec 082, ADR-0045), então isto é regra de tela: o motorista toca
 * "Cheguei", o item entra na fila, e as ações liberam na hora, sem esperar confirmação do servidor.
 */
export function isStopArrivalRecorded(input: {
  readonly arrivedAt: string | null
  readonly queueView: readonly EventQueueItemView[]
  readonly sentReportKeys?: ReadonlySet<string>
  readonly stopId: string
  readonly tappedReports?: readonly TappedStopReport[]
}): boolean {
  if (input.arrivedAt !== null) return true
  return withSentTappedReports(input).some(
    (item) => item.kind === 'arrive' && item.stopId === input.stopId,
  )
}

/** O que a tela guarda no toque de parada ou nota: o suficiente para recriar o item que a fila apagou. */
export type TappedStopReport = Pick<
  EventQueueItemView,
  'documentId' | 'idempotencyKey' | 'kind' | 'queuedAt' | 'stopId'
>

/**
 * A drenagem apaga o item da fila antes de o GET trazer o snapshot novo — sem isto o botão regride
 * ao estado velho e pisca. A chave em `sentReportKeys` segura o toque até o snapshot alcançá-lo, a
 * mesma rede de `resolveDocumentActivityStatus`.
 */
export function withSentTappedReports(input: {
  readonly queueView: readonly EventQueueItemView[]
  readonly sentReportKeys?: ReadonlySet<string> | undefined
  readonly tappedReports?: readonly TappedStopReport[] | undefined
}): readonly EventQueueItemView[] {
  const { queueView, sentReportKeys, tappedReports } = input
  if (sentReportKeys === undefined || tappedReports === undefined) return queueView
  const queuedKeys = new Set(queueView.map((item) => item.idempotencyKey))
  const sentButGone = tappedReports
    .filter((report) => sentReportKeys.has(report.idempotencyKey))
    .filter((report) => !queuedKeys.has(report.idempotencyKey))
    .map(
      (report): EventQueueItemView => ({
        ...report,
        attachmentCount: 0,
        status: { state: 'queued' },
      }),
    )
  return [...queueView, ...sentButGone]
}
