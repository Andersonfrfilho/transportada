/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 293 T12: **"saí" e "cheguei" no grupo do motorista.** Registra pela camada comum dos eventos
 * (`whatsapp-driver-events.service.ts`), a mesma função do app. Regras (spec 293, 3.3):
 *
 * - comando completo e uma parada possível: registra direto, sem confirmação (decisão 7);
 * - mais de uma candidata: o bot lista as paradas pelo número da primeira nota e o motorista escolhe
 *   pelo número da opção ou da nota; uma nota citada no comando ("cheguei 17234") já escolhe;
 * - "saí" com outra parada a caminho: o app recusa e o bot diz qual (`stop_en_route`);
 * - a parada é citada pela nota e pelo cliente (spec 294 RF17).
 *
 * A localização não entra aqui: o Evolution só entrega texto ao grupo (spec 292 T3), então o evento
 * grava `unavailable`, como já ocorre sem a localização compartilhada.
 */
import {
  describeStopReference,
  resolveArrivalStop,
  resolveDepartureStop,
  type WhatsAppStopCandidate,
  type WhatsAppStopResolution,
} from '../../trips/domain/driver-stop-resolution.policy.js'
import {
  normalizeDriverCommandText,
  WHATSAPP_DRIVER_STOP_COMMAND,
  type WhatsAppDriverStopCommandEvent,
} from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import {
  DRIVER_CHOICE,
  interpretDriverChoice,
} from '../../whatsapp-commands/domain/whatsapp-driver-choice.policy.js'
import { OUT_OF_ORDER_TEXT } from '../../whatsapp-commands/domain/whatsapp-driver-order.policy.js'
import { LOCATION_PROMPT_TEXT } from '../../whatsapp-commands/domain/whatsapp-driver-route-offer.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'
import {
  SENDER_NOT_ALLOWED_TEXT,
  type ResolveWhatsAppSenderRole,
  type WhatsAppSenderRole,
} from './whatsapp-sender-role.service.js'

export const GROUP_STOP_STEP = {
  choose: 'choose',
  confirmOrder: 'confirm_order',
  location: 'location',
} as const

export type GroupStopCandidate = WhatsAppStopCandidate

/** A parada que a oferta da próxima rota guarda no pedido (só ids e o número da nota). */
export type GroupStopRoute = {
  readonly documentNumber?: string | undefined
  readonly stopId: string
}

/**
 * A resposta do registro já em frase para o grupo (a recusa também). `outOfOrder` (spec 294 RF25): a API recusou por fora
 * de ordem e `message` é a pergunta 1/2; `stopId` é a parada pedida e `nextStopId` a próxima do roteiro (na saída).
 */
export type GroupStopRegistration = {
  readonly message: string
  readonly outOfOrder?: { readonly nextStopId?: string; readonly stopId: string }
}

export type GroupStopFlowPorts = {
  /** As paradas das viagens ativas do motorista dono do grupo. */
  listStops(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly GroupStopCandidate[]>
  record(input: {
    /** Spec 294 RF19: quem mandou é atendente; o registro vai pelo caminho do escritório (sem ordem, sem "junto"). */
    readonly attendant?: { readonly actorUserId: string }
    readonly companyId: string
    /** Spec 294 RF25: o motorista confirmou gravar fora da ordem da parada. */
    readonly confirmOutOfOrder?: boolean
    readonly driverId: string
    /** A primeira nota da parada: "Marquei a saída junto com a chegada da NF X" (spec 294 RF5). */
    readonly documentNumber?: string | undefined
    readonly event: WhatsAppDriverStopCommandEvent
    /** Por pedido: a mesma mensagem repetida não grava duas vezes. */
    readonly idempotencyKey: string
    readonly stopId: string
  }): Promise<GroupStopRegistration>
  /**
   * Spec 294 RF24: há ponto compartilhado recente (não o consome)? Ausente, o bot não pede a localização
   * antes do "saí"/"cheguei" (como antes da 294).
   */
  hasLocation?(input: { readonly companyId: string; readonly driverId: string }): boolean
  /** Spec 294 RF19: quem escreveu. Ausente, todo remetente é tratado como a tripulação (como antes da 294). */
  resolveSenderRole?: ResolveWhatsAppSenderRole
  /** A frase de "já está a caminho da parada N" e afins, na plateia do grupo. */
  enRouteMessage(input: { readonly companyId: string; readonly sequence: string }): Promise<string>
}

export const GROUP_STOP_TEXT = {
  askStop: (stops: readonly GroupStopCandidate[]) =>
    [
      'Qual parada? Responda com o número da opção ou da nota:',
      ...stops.map((stop, index) => `${index + 1}. ${describeStopReference(stop)}`),
    ].join('\n'),
  noStopArrive: 'Não encontrei parada para registrar a chegada na viagem do motorista deste grupo.',
  noStopDepart: 'Não encontrei parada para registrar a saída na viagem do motorista deste grupo.',
} as const

const REASON = { stop: 'não achei essa parada na lista' } as const

type FlowState = {
  /** Spec 294 RF25: a parada que a API recusou por fora de ordem e a próxima do roteiro, esperando o 1/2. */
  readonly outOfOrderFor?: {
    readonly documentNumber?: string | undefined
    readonly event: WhatsAppDriverStopCommandEvent
    readonly nextStopId?: string | undefined
    readonly stopId: string
  }
  /** Spec 294 RF24: a parada que espera a localização (ou o "pular") antes de registrar. */
  readonly locationFor?: {
    readonly documentNumber?: string | undefined
    readonly event: WhatsAppDriverStopCommandEvent
    readonly stopId: string
  }
  readonly event?: WhatsAppDriverStopCommandEvent | undefined
  readonly stops?:
    | readonly {
        readonly id: string
        readonly isAddressReliable?: boolean | undefined
        readonly label: string
        readonly numbers: readonly string[]
      }[]
    | undefined
}

export function createGroupStopFlow(ports: GroupStopFlowPorts) {
  const resolve = (event: WhatsAppDriverStopCommandEvent, stops: readonly GroupStopCandidate[]) =>
    event === WHATSAPP_DRIVER_STOP_COMMAND.depart
      ? resolveDepartureStop(stops)
      : resolveArrivalStop(stops)

  /** Spec 294 S1: um papel por mensagem; sem a porta, todo remetente é a tripulação (como antes da 294). */
  async function roleOf(turn: GroupFlowTurn): Promise<WhatsAppSenderRole> {
    const role = await ports.resolveSenderRole?.({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      phone: turn.sender,
    })
    return role ?? { kind: 'crew' }
  }

  const refused = (): GroupFlowOutcome => ({ kind: 'done', replies: [SENDER_NOT_ALLOWED_TEXT] })
  const refusedAnswer = (): GroupFlowOutcome => ({
    kind: 'not_understood',
    prompt: '',
    reason: SENDER_NOT_ALLOWED_TEXT,
  })

  async function record(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: {
      readonly confirmOutOfOrder?: boolean
      readonly documentNumber?: string | undefined
      readonly event: WhatsAppDriverStopCommandEvent
      readonly stopId: string
    },
  ): Promise<GroupFlowOutcome> {
    const { documentNumber, event, stopId } = target
    const confirmOutOfOrder = target.confirmOutOfOrder === true
    const attendant = role.kind === 'attendant' ? { actorUserId: role.actorUserId } : undefined
    const result = await ports.record({
      ...(attendant === undefined ? {} : { attendant }),
      ...(confirmOutOfOrder ? { confirmOutOfOrder: true } : {}),
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      documentNumber,
      event,
      idempotencyKey: `whatsapp-group-request:${turn.request.id}`,
      stopId,
    })
    if (result.outOfOrder !== undefined) {
      const state: FlowState = {
        outOfOrderFor: {
          documentNumber,
          event,
          nextStopId: result.outOfOrder.nextStopId,
          stopId: result.outOfOrder.stopId,
        },
      }
      return {
        kind: 'continue',
        replies: [result.message],
        state,
        step: GROUP_STOP_STEP.confirmOrder,
      }
    }
    return { kind: 'done', replies: [result.message] }
  }

  /** "1" confirma fora da ordem; "2" descarta, ou na saída vai à próxima do roteiro; o resto repete a pergunta. */
  async function answerConfirmOrder(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: NonNullable<FlowState['outOfOrderFor']>,
  ): Promise<GroupFlowOutcome> {
    const choice = interpretDriverChoice(turn.text)
    if (choice === DRIVER_CHOICE.first) {
      return record(turn, role, { ...target, confirmOutOfOrder: true })
    }
    if (choice === DRIVER_CHOICE.second || choice === DRIVER_CHOICE.skip) {
      if (target.event === WHATSAPP_DRIVER_STOP_COMMAND.depart && target.nextStopId !== undefined) {
        return record(turn, role, { event: target.event, stopId: target.nextStopId })
      }
      return { kind: 'done', replies: [OUT_OF_ORDER_TEXT.discarded] }
    }
    return {
      kind: 'not_understood',
      prompt: OUT_OF_ORDER_TEXT.notUnderstood,
      reason: 'responda 1 ou 2',
    }
  }

  /** Spec 294 RF24: pede a localização opcional (se não há ponto recente) e só então registra. */
  async function recordOrAsk(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: {
      readonly documentNumber?: string | undefined
      readonly event: WhatsAppDriverStopCommandEvent
      readonly isAddressReliable?: boolean | undefined
      readonly stopId: string
    },
  ): Promise<GroupFlowOutcome> {
    const { companyId, driverId } = turn.request
    const { documentNumber, event, isAddressReliable, stopId } = target
    // O escritório não manda ponto: o atendente registra direto, sem a pergunta da localização.
    if (
      role.kind === 'attendant' ||
      ports.hasLocation === undefined ||
      ports.hasLocation({ companyId, driverId })
    ) {
      return record(turn, role, { documentNumber, event, stopId })
    }
    const state: FlowState = { locationFor: { documentNumber, event, stopId } }
    // Spec 294 RF14: "cheguei" numa parada sem localização certa diz que o ponto corrige o endereço.
    const isUnreliable =
      event === WHATSAPP_DRIVER_STOP_COMMAND.arrive && isAddressReliable === false
    return {
      kind: 'continue',
      replies: [
        isUnreliable ? LOCATION_PROMPT_TEXT.askUnreliableAddress : LOCATION_PROMPT_TEXT.ask,
      ],
      state,
      step: GROUP_STOP_STEP.location,
    }
  }

  async function afterResolution(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    event: WhatsAppDriverStopCommandEvent,
    resolution: WhatsAppStopResolution<GroupStopCandidate>,
    documentNumbers: readonly string[],
  ): Promise<GroupFlowOutcome> {
    switch (resolution.kind) {
      case 'none':
        return {
          kind: 'done',
          replies: [
            event === WHATSAPP_DRIVER_STOP_COMMAND.depart
              ? GROUP_STOP_TEXT.noStopDepart
              : GROUP_STOP_TEXT.noStopArrive,
          ],
        }
      case 'en_route':
        return {
          kind: 'done',
          replies: [
            await ports.enRouteMessage({
              companyId: turn.request.companyId,
              sequence: String(resolution.stop.sequence),
            }),
          ],
        }
      case 'single':
        return recordOrAsk(turn, role, {
          documentNumber: firstNumberOf(resolution.stop),
          event,
          isAddressReliable: resolution.stop.isAddressReliable,
          stopId: resolution.stop.id,
        })
      case 'choose': {
        const mentioned = resolution.stops.filter((stop) =>
          stop.documents.some((document) =>
            documentNumbers.includes(document.number.replace(/^0+/u, '')),
          ),
        )
        if (mentioned.length === 1 && mentioned[0] !== undefined) {
          return recordOrAsk(turn, role, {
            documentNumber: firstNumberOf(mentioned[0]),
            event,
            isAddressReliable: mentioned[0].isAddressReliable,
            stopId: mentioned[0].id,
          })
        }
        const state: FlowState = {
          event,
          stops: resolution.stops.map((stop) => ({
            id: stop.id,
            isAddressReliable: stop.isAddressReliable,
            label: describeStopReference(stop),
            numbers: stop.documents.map((document) => document.number.replace(/^0+/u, '')),
          })),
        }
        return {
          kind: 'continue',
          replies: [GROUP_STOP_TEXT.askStop(resolution.stops)],
          state,
          step: GROUP_STOP_STEP.choose,
        }
      }
    }
  }

  /** "pular" (falado ou digitado) registra sem ponto; o resto repete que o item vai por localização. */
  async function answerLocationStep(
    turn: GroupFlowTurn,
    role: WhatsAppSenderRole,
    target: NonNullable<FlowState['locationFor']>,
  ): Promise<GroupFlowOutcome> {
    const choice = interpretDriverChoice(turn.text)
    if (choice === DRIVER_CHOICE.skip || choice === DRIVER_CHOICE.second) {
      return record(turn, role, target)
    }
    return {
      kind: 'not_understood',
      prompt: LOCATION_PROMPT_TEXT.askAgain,
      reason: 'esse item vai por localização',
    }
  }

  return {
    /** O motorista pediu o evento (comando direto ou menu): resolve a parada e registra ou pergunta. */
    async begin(
      turn: GroupFlowTurn,
      event: WhatsAppDriverStopCommandEvent,
      documentNumbers: readonly string[],
    ): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refused()
      const stops = await ports.listStops({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      return afterResolution(turn, role, event, resolve(event, stops), documentNumbers)
    },

    /** "1" na oferta da próxima rota: a saída da parada oferecida, pelo mesmo registro do "saí". */
    async departStop(turn: GroupFlowTurn, stop: GroupStopRoute): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refused()
      return recordOrAsk(turn, role, {
        documentNumber: stop.documentNumber,
        event: WHATSAPP_DRIVER_STOP_COMMAND.depart,
        stopId: stop.stopId,
      })
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refusedAnswer()
      const state = turn.request.state as FlowState
      if (turn.request.step === GROUP_STOP_STEP.location && state.locationFor !== undefined) {
        return answerLocationStep(turn, role, state.locationFor)
      }
      if (turn.request.step === GROUP_STOP_STEP.confirmOrder && state.outOfOrderFor !== undefined) {
        return answerConfirmOrder(turn, role, state.outOfOrderFor)
      }
      const stops = state.stops ?? []
      const event = state.event ?? WHATSAPP_DRIVER_STOP_COMMAND.arrive
      const picked = pickStop(stops, turn.text)
      if (picked === undefined) {
        return {
          kind: 'not_understood',
          prompt: [
            'Qual parada? Responda com o número da opção ou da nota:',
            ...stops.map((stop, index) => `${index + 1}. ${stop.label}`),
          ].join('\n'),
          reason: REASON.stop,
        }
      }
      return recordOrAsk(turn, role, {
        documentNumber: picked.numbers[0],
        event,
        isAddressReliable: picked.isAddressReliable,
        stopId: picked.id,
      })
    },

    /** A localização compartilhada chegou com o pedido de localização aberto: registra com ela (o ponto está lembrado). */
    async locationReceived(turn: GroupFlowTurn): Promise<GroupFlowOutcome | null> {
      const target = (turn.request.state as FlowState).locationFor
      if (turn.request.step !== GROUP_STOP_STEP.location || target === undefined) return null
      const role = await roleOf(turn)
      if (role.kind === 'unknown') return refusedAnswer()
      return record(turn, role, target)
    },
  }
}

const firstNumberOf = (stop: GroupStopCandidate): string | undefined =>
  stop.documents[0]?.number.replace(/^0+/u, '')

function pickStop<Stop extends { readonly id: string; readonly numbers: readonly string[] }>(
  stops: readonly Stop[],
  text: string,
): Stop | undefined {
  const normalized = normalizeDriverCommandText(text)
  const digits = normalized.replace(/\D/gu, '').replace(/^0+/u, '')
  if (digits === '') return undefined
  const byNumber = stops.filter((stop) => stop.numbers.includes(digits))
  if (byNumber.length === 1) return byNumber[0]
  return /^\d{1,2}$/u.test(normalized) ? stops[Number(normalized) - 1] : undefined
}
