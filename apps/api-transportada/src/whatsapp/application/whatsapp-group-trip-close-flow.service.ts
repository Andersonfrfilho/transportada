/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21: **o atendente encerra a rota pelo grupo do motorista** ("encerrar a rota"), com a mesma
 * função do painel (`POST /trips/:id/close`, spec 223 RF8). O bot confirma antes ("1 - Sim / 2 - Não") e
 * diz quantas notas ainda estão abertas. Só o atendente cadastrado encerra: a tripulação é avisada e
 * ninguém mais registra nada.
 */
import { isCloseTripCommand } from '../../whatsapp-commands/domain/whatsapp-trip-close-command.policy.js'
import type { GroupFlowOutcome, GroupFlowTurn } from './whatsapp-group-request.port.js'
import type { ResolveWhatsAppSenderRole } from './whatsapp-sender-role.service.js'

export const GROUP_TRIP_CLOSE_STEP = { confirm: 'confirm' } as const

export type GroupTripCloseFlowPorts = {
  /** Encerra pela função do painel; recusa de negócio volta como frase para o grupo. */
  readonly close: (input: {
    readonly companyId: string
    readonly phone: string
    readonly tripId: string
  }) => Promise<
    { readonly kind: 'closed' } | { readonly kind: 'refused'; readonly message: string }
  >
  /** A viagem ativa do motorista do grupo e quantas notas dela ainda não fecharam. */
  readonly findActiveTrip: (input: {
    readonly companyId: string
    readonly driverId: string
  }) => Promise<
    | { readonly kind: 'many' }
    | { readonly kind: 'none' }
    | { readonly kind: 'one'; readonly openDocumentCount: number; readonly tripId: string }
  >
  readonly resolveSenderRole: ResolveWhatsAppSenderRole
}

export const GROUP_TRIP_CLOSE_TEXT = {
  attendantOnly: 'Só um atendente cadastrado encerra a rota por aqui.',
  cancelled: 'Certo, a rota continua aberta.',
  closed: 'Rota encerrada. ✅',
  confirm: (openDocumentCount: number) =>
    [
      openDocumentCount === 0
        ? 'Encerrar a rota? Todas as notas já estão fechadas.'
        : `Encerrar a rota? Ainda ${openDocumentCount === 1 ? 'há 1 nota em aberto' : `há ${openDocumentCount} notas em aberto`}.`,
      '1 - Sim',
      '2 - Não',
    ].join('\n'),
  confirmNotUnderstood: 'Responda 1 para encerrar a rota ou 2 para deixá-la aberta.',
  manyTrips: 'O motorista deste grupo tem mais de uma viagem ativa. Encerre pelo painel.',
  noTrip: 'Não encontrei viagem ativa para o motorista deste grupo.',
  unknownSender: 'Só a tripulação ou um atendente cadastrado registra a entrega.',
} as const

const YES = new Set(['1', 'sim', 's', 'confirmo'])
const NO = new Set(['2', 'nao', 'n', 'cancelar'])

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.!?,;:]+$/u, '')
    .trim()

export function createGroupTripCloseFlow(ports: GroupTripCloseFlowPorts) {
  const done = (text: string): GroupFlowOutcome => ({ kind: 'done', replies: [text] })

  return {
    /** O texto é o comando "encerrar a rota"? */
    matches: isCloseTripCommand,

    async begin(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const { companyId, driverId } = turn.request
      const role = await ports.resolveSenderRole({ companyId, driverId, phone: turn.sender })
      if (role.kind === 'unknown') return done(GROUP_TRIP_CLOSE_TEXT.unknownSender)
      if (role.kind === 'crew') return done(GROUP_TRIP_CLOSE_TEXT.attendantOnly)
      const trip = await ports.findActiveTrip({ companyId, driverId })
      if (trip.kind === 'none') return done(GROUP_TRIP_CLOSE_TEXT.noTrip)
      if (trip.kind === 'many') return done(GROUP_TRIP_CLOSE_TEXT.manyTrips)
      return {
        kind: 'continue',
        replies: [GROUP_TRIP_CLOSE_TEXT.confirm(trip.openDocumentCount)],
        state: { tripId: trip.tripId },
        step: GROUP_TRIP_CLOSE_STEP.confirm,
      }
    },

    async answer(turn: GroupFlowTurn): Promise<GroupFlowOutcome> {
      const { companyId, driverId } = turn.request
      const role = await ports.resolveSenderRole({ companyId, driverId, phone: turn.sender })
      if (role.kind !== 'attendant') {
        return { kind: 'not_understood', prompt: '', reason: GROUP_TRIP_CLOSE_TEXT.attendantOnly }
      }
      const answer = normalize(turn.text)
      if (NO.has(answer)) return done(GROUP_TRIP_CLOSE_TEXT.cancelled)
      const tripId = turn.request.state.tripId
      if (!YES.has(answer) || typeof tripId !== 'string') {
        return {
          kind: 'not_understood',
          prompt: '',
          reason: GROUP_TRIP_CLOSE_TEXT.confirmNotUnderstood,
        }
      }
      const result = await ports.close({ companyId, phone: turn.sender, tripId })
      return done(result.kind === 'closed' ? GROUP_TRIP_CLOSE_TEXT.closed : result.message)
    },
  }
}
