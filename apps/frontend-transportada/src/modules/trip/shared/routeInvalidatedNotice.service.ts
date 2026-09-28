/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripStatus } from './trip.types'

export type RouteInvalidatedNoticeInput = Readonly<{
  isRouteFrozen: boolean
  status: TripStatus
  stopsCount: number
}>

/**
 * Spec 217 D3/D3-bis: trocar o veículo apaga o roteiro e o pedágio congelados de propósito — eles
 * foram calculados com os eixos do caminhão anterior. A viagem volta para `draft`, e o único jeito
 * de repor os dois é o botão que já existe no cabeçalho (`stateActions.planRoute`). Sem este aviso
 * o número some da tela sem explicação.
 *
 * Um rascunho que nunca teve roteiro cai na mesma condição, de propósito (§ spec): falta montar o
 * roteiro é a mesma mensagem, tenha ela vindo de uma troca de veículo ou de uma viagem recém-criada.
 */
export function shouldShowRouteInvalidatedNotice(input: RouteInvalidatedNoticeInput): boolean {
  return input.status === 'draft' && input.stopsCount > 0 && !input.isRouteFrozen
}
