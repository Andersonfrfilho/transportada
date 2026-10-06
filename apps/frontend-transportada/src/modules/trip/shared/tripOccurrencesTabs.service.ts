/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (revisão do painel M8): as abas de `/ocorrencias`. A aba Tipos é do cadastro, então só existe
 * para quem pode gerir as configurações; a aba ativa vive em `?tab=`, para recarregar manter a tela.
 */
export type TripOccurrencesTabId = 'feed' | 'types'

export const TRIP_OCCURRENCES_TAB_PARAMETER = 'tab'

export function listTripOccurrencesTabs(
  input: Readonly<{ canManageSettings: boolean }>,
): readonly TripOccurrencesTabId[] {
  return input.canManageSettings ? ['feed', 'types'] : ['feed']
}

/** Aba desconhecida, ou que a pessoa não pode ver, abre o feed: nunca uma tela vazia. */
export function resolveTripOccurrencesTab(
  input: Readonly<{ tabs: readonly TripOccurrencesTabId[]; value: null | string | undefined }>,
): TripOccurrencesTabId {
  return input.tabs.find((tab) => tab === input.value) ?? 'feed'
}

export function readTripOccurrencesTabParameter(search: string): null | string {
  return new URLSearchParams(search).get(TRIP_OCCURRENCES_TAB_PARAMETER)
}

/** O feed é a aba padrão e não suja a URL. */
export function buildTripOccurrencesTabSearch(tab: TripOccurrencesTabId): string {
  return tab === 'feed' ? '' : `?${TRIP_OCCURRENCES_TAB_PARAMETER}=${tab}`
}
