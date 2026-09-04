/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripCandidateDocument } from './trip.types'

/**
 * Esta tela é a da **sugestão**: manda as notas e a frota ao roteirizador, que decide quais notas
 * vão em qual caminhão, e o aceite cria uma viagem por veículo. Montar à mão é a outra porta
 * (`Nova viagem`), e o par de botões que escolhia entre as duas só transferia ao operador uma
 * decisão que a tela já tinha tomado ao ser aberta.
 */
export type TripRouteAssemblyDraft = Readonly<{
  driverIds: readonly string[]
  vehicleIds: readonly string[]
}>

export type TripRouteAssemblySelection = Readonly<{
  /** Notas do pool que já saíram em outra viagem — contadas, nunca escolhidas em silêncio. */
  alreadyOnTrip: readonly TripCandidateDocument[]
  eligible: readonly TripCandidateDocument[]
}>

export type TripRouteAssemblyIssue = 'driverRequired' | 'noDocument' | 'vehicleRequired'

export function validateRouteAssembly(input: {
  readonly draft: TripRouteAssemblyDraft
  readonly selection: TripRouteAssemblySelection
}): readonly TripRouteAssemblyIssue[] {
  const issues: TripRouteAssemblyIssue[] = []
  if (input.selection.eligible.length === 0) issues.push('noDocument')
  if (input.draft.driverIds.length === 0) issues.push('driverRequired')
  if (input.draft.vehicleIds.length === 0) issues.push('vehicleRequired')
  return issues
}

export const EMPTY_TRIP_ROUTE_ASSEMBLY: TripRouteAssemblyDraft = {
  driverIds: [],
  vehicleIds: [],
}
