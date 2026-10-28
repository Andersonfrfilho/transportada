/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTripStop } from './driverTrip.types'

/**
 * Pedido do motorista (27/10): "a gente fica meio perdida na barra de rolagem" — cada parada vira
 * uma página, com ida e volta, e a lista inteira fica a um toque ("Ver todas"). É escolha do
 * motorista, por aparelho (Perfil). Tudo derivado do que já está no aparelho: funciona sem sinal e
 * sem `useEffect` sincronizando estado.
 */
export type StopViewMode = 'list' | 'paged'

export const STOP_VIEW_MODE_STORAGE_KEY = 'transportada-driver:stop-view-mode'

/** O padrão é a página: só `list` gravado, de propósito, devolve a lista. */
export function parseStopViewMode(raw: string | null | undefined): StopViewMode {
  return raw === 'list' ? 'list' : 'paged'
}

/** A escolha de navegar vale enquanto a parada atual for a mesma de quando ele tocou. */
export type StopPageOverride = Readonly<{ stopId: string; whenCurrentWas: string | undefined }>

export function resolvePageStopId(input: {
  readonly currentStopId: string | undefined
  readonly override: StopPageOverride | undefined
  readonly stops: readonly DriverTripStop[]
}): string | undefined {
  const { currentStopId, override, stops } = input
  if (
    override !== undefined &&
    override.whenCurrentWas === currentStopId &&
    stops.some((stop) => stop.id === override.stopId)
  ) {
    return override.stopId
  }
  return currentStopId ?? stops[stops.length - 1]?.id
}

export function neighborStopId(input: {
  readonly direction: 'next' | 'previous'
  readonly stopId: string | undefined
  readonly stops: readonly DriverTripStop[]
}): string | undefined {
  const index = input.stops.findIndex((stop) => stop.id === input.stopId)
  if (index === -1) return undefined
  return input.stops[index + (input.direction === 'next' ? 1 : -1)]?.id
}

/**
 * "Ver todas" abre a lista só até a parada atual mudar (concluiu, iniciou outra rota): aí a tela
 * volta sozinha à página da parada que importa.
 */
export function isPagedViewActive(input: {
  readonly currentStopId: string | undefined
  readonly mode: StopViewMode
  readonly searchTerm: string
  readonly showListWhenCurrentWas: { readonly currentStopId: string | undefined } | undefined
}): boolean {
  if (input.mode !== 'paged' || input.searchTerm !== '') return false
  const shown = input.showListWhenCurrentWas
  return shown === undefined || shown.currentStopId !== input.currentStopId
}
