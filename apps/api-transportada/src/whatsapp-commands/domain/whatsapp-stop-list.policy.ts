/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 300 T3.2 (RF4–RF7b, T0.1 D2/D3): a lista "Qual parada?" do grupo e da conversa individual. Funções puras: a
 * lista sai daqui com o bloco de `whatsapp-message-format.policy.ts`, e a opção é o NÚMERO DA PARADA (RF5).
 */
import type { WhatsAppStopCandidate } from '../../trips/domain/driver-stop-resolution.policy.js'
import { spokenOptionNumber } from './whatsapp-driver-journey.policy.js'
import {
  formatNotUnderstood,
  formatReplyHint,
  formatStopBlock,
  STOP_LIST_VISIBLE_LIMIT,
  type MessageStop,
} from './whatsapp-message-format.policy.js'

const CLOSED_DOCUMENT = new Set(['delivered', 'returned'])
const SEQUENCE_MAX_DIGITS = 2

export const STOP_LIST_TEXT = {
  arriveTitle: '📍 *Em qual parada você chegou?*',
  departTitle: '🚚 *Para qual parada você saiu?*',
  locationMissing: '📎 _Mande sua localização pelo clipe para ver distância e tempo._',
  nextOnRoute: (sequence: number, total: number) =>
    `👉 *PARADA ${sequence} de ${total}* · _próxima da rota_`,
  notFoundDocument: (digits: string) => `Não achei a nota ${digits} nesta viagem.`,
  notFoundStop: (sequence: number) => `Não achei a parada ${sequence} nesta viagem.`,
  notFoundText: 'Não achei essa parada na lista.',
} as const

/** O que a lista sabe de distância e tempo (o `StopListTravel` do leitor tem esta forma). */
export type StopListTravelView = {
  readonly byStopId: ReadonlyMap<string, { readonly distance: string; readonly duration: string }>
  readonly isLocationMissing: boolean
}

export type FormatStopListParams = {
  /** As paradas pendentes na ordem da rota; a primeira é a próxima. */
  readonly stops: readonly WhatsAppStopCandidate[]
  readonly title: string
  /** Quantas paradas a viagem tem (o "M" de "PARADA N de M"). */
  readonly totalStops: number
  readonly travel?: StopListTravelView | undefined
}

export type StopListOption = {
  readonly id: string
  readonly numbers: readonly string[]
  /** Ausente em pedido aberto antes da spec 300: a opção volta a ser a posição na lista. */
  readonly sequence?: number | undefined
}

export function toMessageStop(
  stop: Pick<
    WhatsAppStopCandidate,
    'city' | 'coordinate' | 'district' | 'documents' | 'id' | 'sequence'
  >,
  totalStops: number,
  travel: StopListTravelView | undefined,
): MessageStop {
  const open = stop.documents.filter((document) => !CLOSED_DOCUMENT.has(document.separationStatus))
  const [first, ...others] = open.length > 0 ? open : stop.documents
  const leg = travel?.byStopId.get(stop.id)
  return {
    city: stop.city,
    clientName: first?.recipientName?.trim() ?? '',
    coordinate: stop.coordinate,
    distance: leg?.distance,
    district: stop.district,
    duration: leg?.duration,
    invoiceNumber: first?.number ?? '',
    otherInvoiceNumbers: others.map((document) => document.number),
    sequence: stop.sequence,
    total: totalStops,
  }
}

function describeRange(sequences: readonly number[]): string {
  return `${Math.min(...sequences)} a ${Math.max(...sequences)}`
}

function buildListFooter(hiddenStops: readonly WhatsAppStopCandidate[]): string {
  if (hiddenStops.length === 0) {
    return formatReplyHint('Responda com o número da parada ou da nota.')
  }
  const range = describeRange(hiddenStops.map((stop) => stop.sequence))
  const count = `${hiddenStops.length} ${hiddenStops.length === 1 ? 'parada' : 'paradas'}`
  return formatReplyHint(`E mais ${count} (${range}): responda com o número da parada ou da nota.`)
}

export function formatStopList(params: FormatStopListParams): string {
  const visible = params.stops.slice(0, STOP_LIST_VISIBLE_LIMIT)
  const hidden = params.stops.slice(STOP_LIST_VISIBLE_LIMIT)
  const blocks = visible.map((stop, index) =>
    formatStopBlock({
      detail: 'list',
      stop: toMessageStop(stop, params.totalStops, params.travel),
      ...(index === 0
        ? {
            header: STOP_LIST_TEXT.nextOnRoute(stop.sequence, params.totalStops),
            quote: 'right' as const,
          }
        : {}),
    }),
  )
  const closing = [
    buildListFooter(hidden),
    ...(params.travel?.isLocationMissing === true ? [STOP_LIST_TEXT.locationMissing] : []),
  ]
  return [params.title, ...blocks, closing.join('\n')].join('\n\n')
}

/** O hint do "não entendi" da lista: "_Responda com o número da parada (3 a 7) ou da nota._". */
export function describeStopListHint(options: readonly StopListOption[]): string {
  const sequences = options.flatMap((option) =>
    option.sequence === undefined ? [] : [option.sequence],
  )
  return formatReplyHint(
    sequences.length === 0
      ? 'Responda com o número da parada ou da nota.'
      : `Responda com o número da parada (${describeRange(sequences)}) ou da nota.`,
  )
}

/** O "não entendi" da lista, no padrão (RF3b, RF5): o motivo e a instrução com o intervalo das paradas. */
export function describeStopListNotUnderstood(
  options: readonly StopListOption[],
  reason: string,
): string {
  return `${formatNotUnderstood({ reason })}\n${describeStopListHint(options)}`
}

export type StopListPick<Option extends StopListOption> =
  | { readonly kind: 'picked'; readonly option: Option }
  | { readonly kind: 'not_found'; readonly reason: string }

/**
 * RF5: o número da parada escolhe a parada; o número da nota continua valendo. Número de parada fora da lista (e nota
 * que não está nela) volta `not_found` com o motivo do desenho.
 */
export function pickStopFromList<Option extends StopListOption>(
  options: readonly Option[],
  text: string,
): StopListPick<Option> {
  const digitBlocks = text.match(/\d+/gu) ?? []
  if (digitBlocks.length > 1) return { kind: 'not_found', reason: STOP_LIST_TEXT.notFoundText }
  const digits = (digitBlocks[0] ?? '').replace(/^0+/u, '')
  const wanted =
    digits !== '' && digits.length <= SEQUENCE_MAX_DIGITS
      ? Number(digits)
      : spokenOptionNumber(text)
  const hasSequences = options.some((option) => option.sequence !== undefined)
  if (wanted !== undefined) {
    const bySequence = options.find((option) => option.sequence === wanted)
    if (bySequence !== undefined) return { kind: 'picked', option: bySequence }
    const byPosition = hasSequences ? undefined : options[wanted - 1]
    if (byPosition !== undefined) return { kind: 'picked', option: byPosition }
  }
  const byNumber = digits === '' ? [] : options.filter((option) => option.numbers.includes(digits))
  const [only] = byNumber
  if (byNumber.length === 1 && only !== undefined) return { kind: 'picked', option: only }
  if (wanted !== undefined && digits.length <= SEQUENCE_MAX_DIGITS) {
    return { kind: 'not_found', reason: STOP_LIST_TEXT.notFoundStop(wanted) }
  }
  return {
    kind: 'not_found',
    reason: digits === '' ? STOP_LIST_TEXT.notFoundText : STOP_LIST_TEXT.notFoundDocument(digits),
  }
}
