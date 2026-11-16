/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF25: **a conferência de fora de ordem** que o bot faz a partir do `409 TRIP_STOP_OUT_OF_ORDER` da API
 * (a regra mora lá; o bot só mostra a pergunta). Textos e a leitura das paradas, iguais no grupo e na conversa
 * individual. O atendente nunca vê isto: o escritório não passa pela ordem.
 */

import type { WhatsAppStopCandidate } from '../../trips/domain/driver-stop-resolution.policy.js'
import {
  DISCARDED_TEXT,
  formatNotUnderstood,
  formatOptions,
  formatReplyHint,
  formatSpokenChoices,
  formatStopBlock,
  type MessageStop,
} from './whatsapp-message-format.policy.js'
import { plainText } from './whatsapp-stop-card.policy.js'
import { toMessageStop, type StopListTravelView } from './whatsapp-stop-list.policy.js'

/** A parada como a pergunta a cita: número da sequência, primeira nota e cliente (e o bloco, quando se conhece). */
export type OrderStopLabel = {
  /** Spec 300: o bloco da parada no desenho (bairro, cidade, mapa, distância); ausente, só nota e cliente. */
  readonly block?: MessageStop | undefined
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

export type OrderStopLabelExtras = {
  /** Quantas paradas a viagem tem (o "M" de "PARADA N de M"). */
  readonly total: number
  readonly travel?: StopListTravelView | undefined
}

export function toOrderStopLabel(
  stop: Pick<WhatsAppStopCandidate, 'documents' | 'sequence'> &
    Partial<Pick<WhatsAppStopCandidate, 'city' | 'coordinate' | 'district' | 'id'>>,
  extras?: OrderStopLabelExtras,
): OrderStopLabel {
  const [first] = stop.documents
  return {
    ...(extras === undefined || stop.id === undefined
      ? {}
      : { block: toMessageStop({ ...stop, id: stop.id }, extras.total, extras.travel) }),
    client: plainText(first?.recipientName ?? ''),
    number: first === undefined ? '' : stripZeros(first.number),
    sequence: stop.sequence,
  }
}

const OFF_ROUTE_TITLE = '⚠️ *Fora da rota sugerida*'

function describeOrderBlock(stop: OrderStopLabel, header: string): string {
  const block: MessageStop = stop.block ?? {
    clientName: stop.client,
    invoiceNumber: stop.number,
    sequence: stop.sequence,
    total: 0,
  }
  return formatStopBlock({ detail: 'list', header, quote: 'off-route', stop: block })
}

export const OUT_OF_ORDER_TEXT = {
  discarded: DISCARDED_TEXT,
  keepCurrent: (sequence: string | number) =>
    `Certo, a *parada ${sequence}* continua a caminho. Quando chegar, mande *cheguei*.`,
  switchFailed: (sequence: string | number) =>
    `Não consegui cancelar a saída da *parada ${sequence}*. Fale com o escritório.`,
  notUnderstood: 'Responda *1* ou *2*.',
  question: {
    /** Saída que não é a próxima do roteiro (spec 300, fluxo 2). */
    depart: (input: {
      readonly next: OrderStopLabel
      /** As outras paradas em aberto, oferecidas como opção 3, 4… (o motorista pode ir para qualquer uma). */
      readonly others?: readonly OrderStopLabel[]
      readonly requested: OrderStopLabel
    }) =>
      [
        OFF_ROUTE_TITLE,
        `A rota sugere ir antes para a *parada ${input.next.sequence}*. Se achar melhor, pode seguir para a ${input.requested.sequence}.`,
        '',
        describeOrderBlock(
          input.requested,
          `🚚 *VOCÊ ESCOLHEU · PARADA ${input.requested.sequence}*`,
        ),
        '',
        describeOrderBlock(input.next, `👉 *PRÓXIMA DA ROTA · PARADA ${input.next.sequence}*`),
        '',
        ...((input.others ?? []).length === 0
          ? []
          : [
              '*Outras paradas*',
              ...(input.others ?? []).flatMap((other) => [
                describeOrderBlock(other, `🔀 *PARADA ${other.sequence}*`),
                '',
              ]),
            ]),
        '*Para onde você vai?*',
        formatOptions([
          { action: `Seguir para a *parada ${input.requested.sequence}*`, icon: '✅' },
          { action: `Ir para a *parada ${input.next.sequence}*`, icon: '👉' },
          ...(input.others ?? []).map((other) => ({
            action: `Ir para a *parada ${other.sequence}*`,
            icon: '🔀',
          })),
        ]),
        '',
        formatReplyHint(
          `Responda ${(input.others ?? []).length === 0 ? '1 ou 2' : `de 1 a ${2 + (input.others ?? []).length}`}. É a opção da lista, não o número da parada.`,
        ),
      ].join('\n'),
    /** "Saí" para outra parada com a parada atual a caminho: oferece cancelar a saída dela e sair para a nova. */
    switchDeparture: (input: {
      readonly current: OrderStopLabel
      readonly requested: OrderStopLabel
    }) =>
      [
        OFF_ROUTE_TITLE,
        `A *parada ${input.current.sequence}* está a caminho. Quer cancelar a saída dela e sair para a *parada ${input.requested.sequence}*?`,
        '',
        describeOrderBlock(
          input.requested,
          `🚚 *VOCÊ ESCOLHEU · PARADA ${input.requested.sequence}*`,
        ),
        '',
        '*Quer trocar?*',
        formatOptions([
          {
            action: `Sim, sair para a *parada ${input.requested.sequence}*`,
            icon: '✅',
          },
          { action: `Não, continuar na *parada ${input.current.sequence}*`, icon: '↩️' },
        ]),
        '',
        formatReplyHint('Responda 1 ou 2. É a opção da lista, não o número da parada.'),
      ].join('\n'),
    /** Chegada em outra parada que não a iniciada (spec 300, fluxo 3). */
    arrive: (input: { readonly current: OrderStopLabel; readonly requested: OrderStopLabel }) =>
      [
        OFF_ROUTE_TITLE,
        `Você está a caminho da *parada ${input.current.sequence}*, e este "cheguei" é da *parada ${input.requested.sequence}*. Se achar melhor, pode registrar.`,
        '',
        describeOrderBlock(input.requested, `📍 *CHEGADA · PARADA ${input.requested.sequence}*`),
        '',
        formatOptions([
          { action: `Cheguei na *parada ${input.requested.sequence}*`, icon: '✅' },
          { action: 'Foi engano, descartar', icon: '↩️' },
        ]),
        '',
        formatReplyHint(`A parada ${input.current.sequence} continua aberta. Responda 1 ou 2.`),
      ].join('\n'),
    /** Entrega de nota de outra parada que não a iniciada (spec 300, fluxo 5). */
    deliver: (input: {
      readonly current: OrderStopLabel
      readonly documentNumber?: string
      readonly requested: OrderStopLabel
    }) =>
      [
        OFF_ROUTE_TITLE,
        `Você está na *parada ${input.current.sequence}*, e a NF \`${input.documentNumber ?? input.requested.number}\` é da *parada ${input.requested.sequence}*. Se achar melhor, pode registrar.`,
        '',
        describeOrderBlock(input.requested, `✅ *ENTREGA · PARADA ${input.requested.sequence}*`),
        '',
        formatOptions([
          { action: `Entreguei na *parada ${input.requested.sequence}*`, icon: '✅' },
          { action: 'Foi engano, descartar', icon: '↩️' },
        ]),
        '',
        formatReplyHint(`A parada ${input.current.sequence} continua aberta. Responda 1 ou 2.`),
      ].join('\n'),
  },
} as const

/** O "Responda *1* para … ou *2* para …." do "não entendi" de fora de ordem, pelo evento e pelas paradas. */
export function describeOutOfOrderChoices(input: {
  readonly event: OutOfOrderEvent
  /** A outra parada da pergunta: a próxima do roteiro (saída). */
  readonly other?: number | undefined
  readonly requested?: number | undefined
}): string {
  const { event, other, requested } = input
  if (requested === undefined) return OUT_OF_ORDER_TEXT.notUnderstood
  if (event === OUT_OF_ORDER_EVENT.depart) {
    if (other === undefined) return OUT_OF_ORDER_TEXT.notUnderstood
    return formatSpokenChoices([
      { action: `seguir para a *parada ${requested}*` },
      { action: `ir para a *parada ${other}*` },
    ])
  }
  const action =
    event === OUT_OF_ORDER_EVENT.deliver
      ? `registrar a entrega na *parada ${requested}*`
      : `registrar a chegada na *parada ${requested}*`
  return formatSpokenChoices([{ action }, { action: 'descartar' }])
}

/** O "não entendi" completo da conversa individual (o grupo junta o motivo pelo pedido). */
export function describeOutOfOrderNotUnderstood(
  input: Parameters<typeof describeOutOfOrderChoices>[0],
): string {
  return formatNotUnderstood({ reason: describeOutOfOrderChoices(input) })
}

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
  /** Só na saída: as outras paradas em aberto, oferecidas como mais opções. */
  readonly others?: readonly OrderStopLabel[]
  readonly violation: OutOfOrderViolation
}): string {
  const { documentNumber, event, labels, others, violation } = input
  const labelOf = (stopId: string | null, sequence: number): OrderStopLabel =>
    (stopId === null ? undefined : labels.get(stopId)) ?? { client: '', number: '', sequence }
  const requested = labelOf(violation.requestedStopId, violation.requestedSequence)
  if (event === OUT_OF_ORDER_EVENT.depart && violation.nextSequence !== null) {
    return OUT_OF_ORDER_TEXT.question.depart({
      next: labelOf(violation.nextStopId, violation.nextSequence),
      ...(others === undefined ? {} : { others }),
      requested,
    })
  }
  const current = labelOf(
    violation.currentStopId,
    violation.currentSequence ?? violation.nextSequence ?? 0,
  )
  if (event === OUT_OF_ORDER_EVENT.deliver) {
    return OUT_OF_ORDER_TEXT.question.deliver({
      current,
      ...(documentNumber === undefined ? {} : { documentNumber }),
      requested,
    })
  }
  return OUT_OF_ORDER_TEXT.question.arrive({ current, requested })
}
