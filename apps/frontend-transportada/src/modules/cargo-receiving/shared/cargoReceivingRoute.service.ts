/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { CARGO_RECEIVING_WORKSPACE } from './cargoReceiving.constant'

export const CARGO_RECEIVING_ROUTE = '/recebimento'

const ROUTE_PREFIX = `${CARGO_RECEIVING_ROUTE}/`
const REGISTER_SEGMENT = 'nova'
const DETAIL_SEGMENT = 'detalhe'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export type CargoReceivingRoute =
  | Readonly<{ arrivalId: string; kind: 'detail' | 'separation' }>
  | Readonly<{ kind: 'list' | 'register' }>

export const buildCargoArrivalRegisterRoute = (): string => `${ROUTE_PREFIX}${REGISTER_SEGMENT}`

/** A tela do celular do separador é a rota do próprio id: é a que a equipe abre na doca. */
export const buildCargoArrivalSeparationRoute = (arrivalId: string): string =>
  `${ROUTE_PREFIX}${encodeURIComponent(arrivalId)}`

export const buildCargoArrivalDetailRoute = (arrivalId: string): string =>
  `${buildCargoArrivalSeparationRoute(arrivalId)}/${DETAIL_SEGMENT}`

/** `null` é "este caminho não é do recebimento"; subcaminho desconhecido cai na lista, nunca quebra. */
export function parseCargoReceivingRoute(pathname: string): CargoReceivingRoute | null {
  if (pathname !== CARGO_RECEIVING_ROUTE && !pathname.startsWith(ROUTE_PREFIX)) return null
  const [first, second, ...rest] = pathname
    .slice(ROUTE_PREFIX.length)
    .replace(/\/$/u, '')
    .split('/')
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
