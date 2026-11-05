/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF25: **a conferência de fora de ordem** que o bot faz a partir do `409 TRIP_STOP_OUT_OF_ORDER` da API
 * (a regra mora lá; o bot só mostra a pergunta). Textos e a leitura das paradas, iguais no grupo e na conversa
 * individual. O atendente nunca vê isto: o escritório não passa pela ordem.
 */

/** A parada como a pergunta a cita: número da sequência, primeira nota e cliente. */
export type OrderStopLabel = {
  readonly client: string
  readonly number: string
  readonly sequence: number
}

export const OUT_OF_ORDER_EVENT = {
  arrive: 'arrive',
  deliver: 'deliver',
  depart: 'depart',
} as const

export type OutOfOrderEvent = (typeof OUT_OF_ORDER_EVENT)[keyof typeof OUT_OF_ORDER_EVENT]

const stripZeros = (value: string) => value.replace(/^0+(?=\d)/u, '')

export function toOrderStopLabel(stop: {
  readonly documents: readonly {
    readonly number: string
    readonly recipientName?: string | undefined
  }[]
  readonly sequence: number
}): OrderStopLabel {
  const [first] = stop.documents
  return {
    client: first?.recipientName?.trim() ?? '',
    number: first === undefined ? '' : stripZeros(first.number),
    sequence: stop.sequence,
  }
}

/** "NF 17234 — Padaria Sol"; sem cliente, só a nota; sem nota, só a parada. */
function nameOf(stop: OrderStopLabel, number: string = stop.number): string {
  const note = number === '' ? '' : `NF ${number}`
  if (note === '') return stop.client
  return stop.client === '' ? note : `${note} — ${stop.client}`
}

const stopWord = (stop: OrderStopLabel, number?: string) => {
  const name = nameOf(stop, number)
  return name === '' ? `parada ${stop.sequence}` : `parada ${stop.sequence} (${name})`
}

export const OUT_OF_ORDER_TEXT = {
  discarded: 'Certo, descartei e não registrei nada.',
  notUnderstood: 'Responda 1 ou 2.',
  question: {
    /** Saída que não é a próxima do roteiro. */
    depart: (input: { readonly next: OrderStopLabel; readonly requested: OrderStopLabel }) =>
      [
        `A próxima no roteiro é a ${stopWord(input.next)}. Quer mesmo iniciar a parada ${input.requested.sequence}?`,
        `*1* - Sim, a ${input.requested.sequence}`,
        `*2* - Não, a ${input.next.sequence}`,
      ].join('\n'),
    /** Chegada ou entrega de outra parada que não a iniciada. */
    fromCurrent: (input: {
      readonly current: OrderStopLabel
      readonly documentNumber?: string
      readonly event: 'arrive' | 'deliver'
      readonly requested: OrderStopLabel
    }) => {
      const isDelivery = input.event === OUT_OF_ORDER_EVENT.deliver
      const where = isDelivery
        ? `esta nota é da ${stopWord(input.requested, input.documentNumber)}`
        : `você está chegando na ${stopWord(input.requested)}`
      return [
        `⚠️ Você iniciou a rota para a ${stopWord(input.current)}, mas ${where}.`,
        `*1* - ${isDelivery ? 'Entreguei a' : 'Cheguei na'} parada ${input.requested.sequence} mesmo`,
        `*2* - Foi engano${isDelivery ? ', descartar' : ''}`,
      ].join('\n')
    },
  },
} as const

/** O que a recusa de fora de ordem da API diz (o mesmo `StopOrderViolation` da regra). */
export type OutOfOrderViolation = {
  readonly currentSequence: number | null
  readonly currentStopId: string | null
  readonly nextSequence: number | null
  readonly nextStopId: string | null
  readonly requestedSequence: number
  readonly requestedStopId: string
}

/** A pergunta 1/2 do bot; parada sem rótulo conhecido fica só com a sequência. */
export function describeOutOfOrderViolation(input: {
  /** A nota que a baixa quis fechar, para "esta nota é da NF …" (só na entrega). */
  readonly documentNumber?: string | undefined
  readonly event: OutOfOrderEvent
  readonly labels: ReadonlyMap<string, OrderStopLabel>
  readonly violation: OutOfOrderViolation
}): string {
  const { documentNumber, event, labels, violation } = input
  const labelOf = (stopId: string | null, sequence: number): OrderStopLabel =>
    (stopId === null ? undefined : labels.get(stopId)) ?? { client: '', number: '', sequence }
  const requested = labelOf(violation.requestedStopId, violation.requestedSequence)
  if (event === OUT_OF_ORDER_EVENT.depart && violation.nextSequence !== null) {
    return OUT_OF_ORDER_TEXT.question.depart({
      next: labelOf(violation.nextStopId, violation.nextSequence),
      requested,
    })
  }
  return OUT_OF_ORDER_TEXT.question.fromCurrent({
    current: labelOf(
      violation.currentStopId,
      violation.currentSequence ?? violation.nextSequence ?? 0,
    ),
    ...(documentNumber === undefined ? {} : { documentNumber }),
    event:
      event === OUT_OF_ORDER_EVENT.deliver ? OUT_OF_ORDER_EVENT.deliver : OUT_OF_ORDER_EVENT.arrive,
    requested,
  })
}
