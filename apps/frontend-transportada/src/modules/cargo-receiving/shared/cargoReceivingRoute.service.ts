/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { CONTRACTORS_WORKSPACE, CONTRACTORS_WORKSPACE_ROUTE } from './cargoPreview.constant'
import { CARGO_RECEIVING_WORKSPACE } from './cargoReceiving.constant'

export const CARGO_RECEIVING_ROUTE = '/recebimento'

const ROUTE_PREFIX = `${CARGO_RECEIVING_ROUTE}/`
const REGISTER_SEGMENT = 'nova'
const DETAIL_SEGMENT = 'detalhe'
const PREVIEWS_SEGMENT = 'previas'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export type CargoReceivingRoute =
  | Readonly<{ arrivalId: string; kind: 'detail' | 'separation' }>
  | Readonly<{ kind: 'list' | 'previews' | 'register' }>
  | Readonly<{ kind: 'preview-detail'; previewId: string }>

export const buildCargoArrivalRegisterRoute = (): string => `${ROUTE_PREFIX}${REGISTER_SEGMENT}`

/** A tela do celular do separador é a rota do próprio id: é a que a equipe abre na doca. */
export const buildCargoArrivalSeparationRoute = (arrivalId: string): string =>
  `${ROUTE_PREFIX}${encodeURIComponent(arrivalId)}`

export const buildCargoArrivalDetailRoute = (arrivalId: string): string =>
  `${buildCargoArrivalSeparationRoute(arrivalId)}/${DETAIL_SEGMENT}`

export const buildCargoPreviewListRoute = (): string => `${ROUTE_PREFIX}${PREVIEWS_SEGMENT}`

export const buildCargoPreviewDetailRoute = (previewId: string): string =>
  `${buildCargoPreviewListRoute()}/${encodeURIComponent(previewId)}`

/** Prévia com id que não é UUID, ou com subcaminho, cai na lista de prévias: nunca quebra. */
function parsePreviewRoute(segments: readonly string[]): CargoReceivingRoute {
  const [, previewId, ...rest] = segments
  if (previewId === undefined || rest.length > 0 || !UUID_PATTERN.test(previewId)) {
    return { kind: 'previews' }
  }
  return { kind: 'preview-detail', previewId }
}

/** `null` é "este caminho não é do recebimento"; subcaminho desconhecido cai na lista, nunca quebra. */
export function parseCargoReceivingRoute(pathname: string): CargoReceivingRoute | null {
  if (pathname !== CARGO_RECEIVING_ROUTE && !pathname.startsWith(ROUTE_PREFIX)) return null
  const segments = pathname.slice(ROUTE_PREFIX.length).replace(/\/$/u, '').split('/')
  if (segments[0] === PREVIEWS_SEGMENT) return parsePreviewRoute(segments)
  const [first, second, ...rest] = segments
  if (first === undefined || first === '' || rest.length > 0) return { kind: 'list' }
  if (first === REGISTER_SEGMENT && second === undefined) return { kind: 'register' }
  if (!UUID_PATTERN.test(first)) return { kind: 'list' }
  if (second === undefined) return { arrivalId: first, kind: 'separation' }
  return second === DETAIL_SEGMENT ? { arrivalId: first, kind: 'detail' } : { kind: 'list' }
}

function navigate(input: Readonly<{ navigator: WorkspaceNavigator; path: string }>): void {
  input.navigator.pushPath(input.path)
  input.navigator.rememberWorkspace(CARGO_RECEIVING_WORKSPACE)
  input.navigator.dispatchPopState()
}

export const navigateToCargoArrivals = (navigator: WorkspaceNavigator): void =>
  navigate({ navigator, path: CARGO_RECEIVING_ROUTE })

export const navigateToCargoArrivalRegister = (navigator: WorkspaceNavigator): void =>
  navigate({ navigator, path: buildCargoArrivalRegisterRoute() })

export const navigateToCargoArrivalSeparation = (
  input: Readonly<{ arrivalId: string; navigator: WorkspaceNavigator }>,
): void =>
  navigate({ navigator: input.navigator, path: buildCargoArrivalSeparationRoute(input.arrivalId) })

export const navigateToCargoArrivalDetail = (
  input: Readonly<{ arrivalId: string; navigator: WorkspaceNavigator }>,
): void =>
  navigate({ navigator: input.navigator, path: buildCargoArrivalDetailRoute(input.arrivalId) })

export const navigateToCargoPreviews = (navigator: WorkspaceNavigator): void =>
  navigate({ navigator, path: buildCargoPreviewListRoute() })

export const navigateToCargoPreviewDetail = (
  input: Readonly<{ navigator: WorkspaceNavigator; previewId: string }>,
): void =>
  navigate({ navigator: input.navigator, path: buildCargoPreviewDetailRoute(input.previewId) })

/** O perfil de recebimento mora na ficha do contratante (Clientes, aba Contratantes): é para lá que se vai ligá-lo. */
export function navigateToContractors(navigator: WorkspaceNavigator): void {
  navigator.pushPath(CONTRACTORS_WORKSPACE_ROUTE)
  navigator.rememberWorkspace(CONTRACTORS_WORKSPACE)
  navigator.dispatchPopState()
}
