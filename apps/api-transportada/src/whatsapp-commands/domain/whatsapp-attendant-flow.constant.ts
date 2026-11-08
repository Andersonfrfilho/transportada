/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21 — o atendente direto com o bot (conversa individual): baixa de uma ou várias notas e
 * encerrar a rota. Ids de nó, `actionKind` e chaves de contexto, num lugar só (grafo e FlowActions
 * importam daqui).
 *
 * ⚠️ O `context` da sessão é jsonb persistido: só ids opacos e o comando interpretado, nunca nome de
 * cliente ou placa.
 */
import { formatOpenDocumentsLine, formatTripClosed } from './whatsapp-message-format.policy.js'

export const ATTENDANT_FLOW_ACTION_KIND = {
  closeRouter: 'attendant.close_router',
  fieldCommand: 'attendant.field_command',
  tripRouter: 'attendant.trip_router',
} as const

export const ATTENDANT_FLOW_NODE = {
  closeMenu: 'attendant_close_menu',
  closeRouter: 'attendant_close_router',
  fieldCommand: 'attendant_field_command',
  tripEntry: 'attendant_trip_entry',
  tripRouter: 'attendant_trip_router',
} as const

export const ATTENDANT_FLOW_CONTEXT_KEY = {
  closeAnswer: 'attendantCloseAnswer',
  closeOpenNumbers: 'attendantCloseOpenNumbers',
  fieldCommand: 'attendantFieldCommand',
  listPage: 'attendantListPage',
  tripAnswer: 'attendantTripAnswer',
  tripId: 'attendantTripId',
} as const

export const ATTENDANT_CLOSE_ANSWER = {
  cancel: 'attendant_close_no',
  confirm: 'attendant_close_yes',
} as const

export const ATTENDANT_TEXT = {
  askNumbers: 'Mande "entreguei" com o número das notas, por exemplo: entreguei 17234 17235.',
  cancelled: 'Certo, a rota continua aberta.',
  closeFailed: 'Não consegui encerrar a rota agora. Confira a viagem no painel.',
  closed: formatTripClosed,
  confirm: formatOpenDocumentsLine,
  noRoadTrips: 'Não há viagem na rua para encerrar.',
  tooManyNotes: (limit: number) => `Mande no máximo ${limit} notas por vez.`,
  tripChoice: 'Toque na viagem que você quer encerrar.',
  tripNotFound: (number: string) => `Não encontrei a NF ${number} em uma viagem na rua.`,
  tripUnavailable: 'Esta viagem não está mais na rua.',
} as const
