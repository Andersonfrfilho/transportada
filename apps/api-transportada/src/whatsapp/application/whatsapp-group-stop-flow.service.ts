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
 * - nada de nome de cliente nem endereço no grupo: a parada é citada só pelo número da nota.
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
} from '../../whatsapp-commands/domain/whatsapp-driver-stop.policy.js'
import {
  normalizeDriverCommandText,
  WHATSAPP_DRIVER_STOP_COMMAND,
  type WhatsAppDriverStopCommandEvent,
} from '../../whatsapp-commands/domain/whatsapp-driver-command.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'

export const GROUP_STOP_STEP = { choose: 'choose' } as const

export type GroupStopCandidate = WhatsAppStopCandidate

/** A resposta do registro já em frase para o grupo (a recusa também). */
export type GroupStopRegistration = { readonly message: string }

export type GroupStopFlowPorts = {
  /** As paradas das viagens ativas do motorista dono do grupo. */
  listStops(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly GroupStopCandidate[]>
  record(input: {
    readonly companyId: string
    readonly driverId: string
    readonly event: WhatsAppDriverStopCommandEvent
    /** Por pedido: a mesma mensagem repetida não grava duas vezes. */
    readonly idempotencyKey: string
    readonly stopId: string
  }): Promise<GroupStopRegistration>
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
  readonly event?: WhatsAppDriverStopCommandEvent | undefined
  readonly stops?:
    | readonly {
        readonly id: string
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

  async function record(
    turn: GroupFlowTurn,
    event: WhatsAppDriverStopCommandEvent,
    stopId: string,
  ): Promise<GroupFlowOutcome> {
    const result = await ports.record({
      companyId: turn.request.companyId,
      driverId: turn.request.driverId,
      event,
      idempotencyKey: `whatsapp-group-request:${turn.request.id}`,
      stopId,
    })
    return { kind: 'done', replies: [result.message] }
  }

  async function afterResolution(
    turn: GroupFlowTurn,
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
        return record(turn, event, resolution.stop.id)
      case 'choose': {
        const mentioned = resolution.stops.filter((stop) =>
          stop.documents.some((document) =>
            documentNumbers.includes(document.number.replace(/^0+/u, '')),
          ),
        )
        if (mentioned.length === 1 && mentioned[0] !== undefined) {
          return record(turn, event, mentioned[0].id)
        }
        const state: FlowState = {
          event,
          stops: resolution.stops.map((stop) => ({
            id: stop.id,
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

  return {
    /** O motorista pediu o evento (comando direto ou menu): resolve a parada e registra ou pergunta. */
    async begin(
      turn: GroupFlowTurn,
      event: WhatsAppDriverStopCommandEvent,
      documentNumbers: readonly string[],
    ): Promise<GroupFlowOutcome> {
      const stops = await ports.listStops({
        companyId: turn.request.companyId,
        driverId: turn.request.driverId,
      })
      return afterResolution(turn, event, resolve(event, stops), documentNumbers)
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const state = turn.request.state as FlowState
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
      return record(turn, event, picked.id)
    },
  }
}

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
