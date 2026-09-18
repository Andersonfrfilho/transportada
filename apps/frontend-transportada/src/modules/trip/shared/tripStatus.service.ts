/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripStatus } from './trip.types'

/** ADR-0043 §2 (D2): a partir daqui a carga já está na rua — nenhuma nota entra, nenhuma sai, e a
 * ordem das paradas está congelada no `trip_stop_snapshot`. */
const DISPATCHED_STATUSES: readonly TripStatus[] = [
  'dispatched',
  'in_transit',
  'on_delivery_route',
  'completed',
]

export function isTripDispatched(status: TripStatus): boolean {
  return DISPATCHED_STATUSES.includes(status)
}

/** Mesma porta de não-retorno que `checkTripAcceptsLinkage` no backend (T013): vincular, desvincular
 * e reordenar parada só funcionam antes de `dispatched`, e nunca numa viagem cancelada. */
export function isTripEditable(status: TripStatus): boolean {
  return status !== 'cancelled' && !isTripDispatched(status)
}

/**
 * ADR-0043 §1: separar e carregar são trabalho de **barracão** — espelha o ramo não-`isStreetWork`
 * de `checkTripAcceptsDocumentWork`. `draft` não basta: sem roteiro planejado o backend recusa com
 * `TRIP_ROUTE_NOT_PLANNED`, então oferecer o botão ali é oferecer uma falha garantida.
 */
export function canSeparateOrLoadDocuments(status: TripStatus): boolean {
  return status === 'route_planned' || status === 'separating' || status === 'loading'
}

/**
 * Spec 156 T8b, ADR-0067: entregar/devolver deixaram de ter porta própria aqui — os botões de
 * `TripStopList`/`TripStateActions` passaram a obedecer só `allowedActions`
 * (`fieldActionCapabilities.canDocument`), a mesma fonte que `TripFieldActions` (T8) já usa. Uma
 * cópia da máquina de estados no cliente era exatamente o risco que a T8 apontava para as ações de
 * campo — o servidor decide, o cliente só mostra.
 */
