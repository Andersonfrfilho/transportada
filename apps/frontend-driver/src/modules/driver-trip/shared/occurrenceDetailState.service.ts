/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverRouteOccurrenceDetail,
  RouteOccurrencesReadResult,
} from './driverRouteOccurrence.types'
import { toServerEntry } from './routeOccurrenceView.service'
import type { RouteOccurrenceEntry } from './routeOccurrenceView.types'

/** O que a tela de detalhe desenha: `ready` sem `detail` é só o metadado da lista (fila, ou sem rede). */
export type OccurrenceDetailState =
  | Readonly<{
      detail: DriverRouteOccurrenceDetail | undefined
      entry: RouteOccurrenceEntry
      status: 'ready'
    }>
  | Readonly<{ status: 'loading' | 'notFound' | 'offlineEmpty' | 'tripFinished' }>

export type ResolveOccurrenceDetailStateParams = Readonly<{
  /** Sem rede, consulta pausada ou com erro: vale só o que a lista guardou. */
  isUnreachable: boolean
  /** A linha da lista com este id (servidor ou fila); a fila nunca tem detalhe no servidor. */
  listedEntry: RouteOccurrenceEntry | undefined
  result: RouteOccurrencesReadResult<DriverRouteOccurrenceDetail> | undefined
}>

export function resolveOccurrenceDetailState(
  params: ResolveOccurrenceDetailStateParams,
): OccurrenceDetailState {
  const { isUnreachable, listedEntry, result } = params
  if (listedEntry?.source === 'queue') {
    return { detail: undefined, entry: listedEntry, status: 'ready' }
  }
  if (result?.status === 'tripFinished') return { status: 'tripFinished' }
  if (result?.status === 'notFound') return { status: 'notFound' }
  if (result?.status === 'loaded') {
    const entry =
      listedEntry ?? toServerEntry({ occurrence: result.data, unreadByOccurrenceId: new Map() })
    return { detail: result.data, entry, status: 'ready' }
  }
  if (listedEntry !== undefined) return { detail: undefined, entry: listedEntry, status: 'ready' }
  return { status: isUnreachable ? 'offlineEmpty' : 'loading' }
}
