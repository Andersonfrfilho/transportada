/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_PREVIEW_ITEM_STATES } from './cargoPreview.constant'
import type {
  CargoPreviewItem,
  CargoPreviewItemState,
  CargoPreviewRouteGroup,
} from './cargoPreview.types'
import { readUrlList, writeUrlList } from './cargoTableSort.service'

export type CargoPreviewDetailFilters = Readonly<{
  routeNames: readonly string[]
  states: readonly CargoPreviewItemState[]
}>

export const EMPTY_CARGO_PREVIEW_DETAIL_FILTERS: CargoPreviewDetailFilters = {
  routeNames: [],
  states: [],
}

/** Um grupo da tela: o roteiro (ou "sem roteiro", `null`), a carga que o servidor ligou a ele e as linhas. */
export type CargoPreviewRouteSection = Readonly<{
  group: CargoPreviewRouteGroup | undefined
  items: readonly CargoPreviewItem[]
  routeName: string | null
}>

export function hasCargoPreviewDetailFilters(filters: CargoPreviewDetailFilters): boolean {
  return filters.routeNames.length > 0 || filters.states.length > 0
}

/**
 * O servidor filtra por UM estado e UM roteiro. Com um valor só o filtro vai ao servidor (a página já vem
 * certa, e o cursor por linha acompanha); com vários, o servidor devolve tudo e o cliente filtra o que veio.
 */
export function resolveCargoPreviewItemServerFilters(
  filters: CargoPreviewDetailFilters,
): Readonly<{ routeName?: string; state?: CargoPreviewItemState }> {
  const [routeName] = filters.routeNames
  const [state] = filters.states
  return {
    ...(filters.routeNames.length === 1 && routeName !== undefined ? { routeName } : {}),
    ...(filters.states.length === 1 && state !== undefined ? { state } : {}),
  }
}

export function applyCargoPreviewItemFilters(
  input: Readonly<{ filters: CargoPreviewDetailFilters; items: readonly CargoPreviewItem[] }>,
): readonly CargoPreviewItem[] {
  const { routeNames, states } = input.filters
  return input.items.filter(
    (item) =>
      (states.length === 0 || states.includes(item.matchState)) &&
      (routeNames.length === 0 || (item.routeName !== null && routeNames.includes(item.routeName))),
  )
}

/** Roteiros na ordem da API, linhas na da planilha; sem roteiro vai por último. Só entra grupo com linha. */
export function buildCargoPreviewRouteSections(
  input: Readonly<{
    items: readonly CargoPreviewItem[]
    routes: readonly CargoPreviewRouteGroup[]
  }>,
): readonly CargoPreviewRouteSection[] {
  const ordered = [...input.items].sort((left, right) => left.rowNumber - right.rowNumber)
  const sections: CargoPreviewRouteSection[] = input.routes.map((group) => ({
    group,
    items: ordered.filter((item) => item.routeName === group.routeName),
    routeName: group.routeName,
  }))
  sections.push({
    group: undefined,
    items: ordered.filter((item) => item.routeName === null),
    routeName: null,
  })
  return sections.filter((section) => section.items.length > 0)
}

function isItemState(value: string): value is CargoPreviewItemState {
  return CARGO_PREVIEW_ITEM_STATES.some((state) => state === value)
}

/** URL inventada não quebra a tela: estado desconhecido é ignorado; o roteiro é só texto, comparado depois. */
export function parseCargoPreviewDetailFilters(search: string): CargoPreviewDetailFilters {
  const parameters = new URLSearchParams(search)
  return {
    routeNames: [...new Set(readUrlList(parameters.get('route')))],
    states: [...new Set(readUrlList(parameters.get('state')).filter(isItemState))],
  }
}

export function serializeCargoPreviewDetailFilters(
  input: Readonly<{ filters: CargoPreviewDetailFilters; search: string }>,
): string {
  const parameters = new URLSearchParams(input.search)
  writeUrlList({ name: 'state', parameters, values: input.filters.states })
  writeUrlList({ name: 'route', parameters, values: input.filters.routeNames })
  const serialized = parameters.toString()
  return serialized === '' ? '' : `?${serialized}`
}
