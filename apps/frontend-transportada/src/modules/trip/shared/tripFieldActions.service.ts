/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DocumentAllowedAction,
  StopAllowedAction,
  TripAllowedAction,
  TripAllowedActions,
} from './tripAllowedActions.validation'
import type { TripDriverLine } from './trip.types'

export type FieldActionCapabilities = Readonly<{
  canDocument: (documentId: string, action: DocumentAllowedAction) => boolean
  canStop: (stopId: string, action: StopAllowedAction) => boolean
  canTrip: (action: TripAllowedAction) => boolean
}>

const EMPTY_CAPABILITIES: FieldActionCapabilities = {
  canDocument: () => false,
  canStop: () => false,
  canTrip: () => false,
}

/**
 * Spec 156 T8 (t7-design §2.6): sem a lista — API antiga na janela de deploy, consulta que ainda
 * não voltou, ou resposta malformada que `parseTripAllowedActions` recusou — nenhuma ação de campo
 * aparece. Falha **fechada**, nunca aberta: o botão oferecido por engano vira 403/409 na mão de quem
 * clicou, e o silêncio de um botão a menos é sempre o lado seguro.
 */
export function resolveFieldActionCapabilities(
  actions: TripAllowedActions | undefined,
): FieldActionCapabilities {
  if (actions === undefined) return EMPTY_CAPABILITIES

  return {
    canDocument: (documentId, action) => (actions.documents[documentId] ?? []).includes(action),
    canStop: (stopId, action) => (actions.stops[stopId] ?? []).includes(action),
    canTrip: (action) => actions.trip.includes(action),
  }
}

/** ADR-0067 §2 (D3): sem escolha explícita, a autoria vai para o motorista de `position = 1`. */
export function resolveDefaultOnBehalfDriverId(
  drivers: readonly Pick<TripDriverLine, 'driverId' | 'position'>[],
): string | undefined {
  return drivers.find((driver) => driver.position === 1)?.driverId
}

/** Spec 156 D3: a tela só mostra o seletor quando há motorista para escolher — um só não é escolha. */
export function hasMultipleDrivers(drivers: readonly unknown[]): boolean {
  return drivers.length > 1
}
