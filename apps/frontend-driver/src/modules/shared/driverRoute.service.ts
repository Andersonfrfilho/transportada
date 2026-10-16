/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * RF5 (ADR-0075 §6, plan D4): seis seções com caminho próprio, navegação por `pushState` e
 * `popstate`, sem biblioteca de roteamento — o mesmo padrão que o painel já usa no `main.tsx`. A
 * casca (`main.tsx`) decide entre a viagem e as notificações por aqui; dentro da viagem, o estado
 * que antes era local em `DriverTripWorkspace.page.tsx` (seção, fila, fotos pendentes) passa a
 * derivar da mesma leitura de rota.
 */
export type DriverRouteSection =
  | 'conversations'
  | 'notifications'
  | 'occurrences'
  | 'pending-proofs'
  | 'profile'
  | 'queue'
  | 'trip'

export const DRIVER_ROUTE_PATH: Readonly<Record<DriverRouteSection, string>> = {
  conversations: '/conversas',
  notifications: '/notificacoes',
  occurrences: '/ocorrencias',
  'pending-proofs': '/fotos',
  profile: '/perfil',
  queue: '/fila',
  trip: '/',
}

const NON_TRIP_ROUTES: ReadonlyArray<readonly [DriverRouteSection, string]> = (
  Object.entries(DRIVER_ROUTE_PATH) as ReadonlyArray<readonly [DriverRouteSection, string]>
).filter(([section]) => section !== 'trip')

/** Caminho desconhecido cai em `trip`: é a tela de entrada, e nunca deve ficar em branco. */
export function resolveDriverRouteSection(pathname: string): DriverRouteSection {
  const match = NON_TRIP_ROUTES.find(
    ([, path]) => pathname === path || pathname.startsWith(`${path}/`),
  )
  return match?.[0] ?? 'trip'
}

export function buildDriverRoutePath(section: DriverRouteSection): string {
  return DRIVER_ROUTE_PATH[section]
}

export type DriverNavigationTarget = Readonly<{
  dispatchEvent: (event: Event) => boolean
  history: Pick<History, 'pushState'>
  location: Readonly<{ pathname: string }>
}>

/** Sem efeito quando já está na seção pedida — evitar uma entrada duplicada no histórico. */
export function navigateToDriverSection(
  section: DriverRouteSection,
  target: DriverNavigationTarget = window,
): void {
  const path = buildDriverRoutePath(section)
  if (target.location.pathname === path) return
  target.history.pushState({}, '', path)
  target.dispatchEvent(new PopStateEvent('popstate'))
}

export type DriverRouteTarget = Readonly<{
  addEventListener: (type: 'popstate', listener: () => void) => void
  location: Readonly<{ pathname: string }>
  removeEventListener: (type: 'popstate', listener: () => void) => void
}>

/** Devolve a função de cancelamento — o padrão de limpeza de `useEffect`. */
export function subscribeDriverRoute(
  onChange: (section: DriverRouteSection) => void,
  target: DriverRouteTarget = window,
): () => void {
  const listener = () => onChange(resolveDriverRouteSection(target.location.pathname))
  target.addEventListener('popstate', listener)
  return () => target.removeEventListener('popstate', listener)
}

export type DriverConversationSubject = Readonly<{ subjectId: string; subjectType: string }>

/** `/conversas/:subjectType/:subjectId`; sem os dois segmentos (ou malformado) é a lista. */
export function parseDriverConversationSubject(
  pathname: string,
): DriverConversationSubject | undefined {
  const prefix = `${DRIVER_ROUTE_PATH.conversations}/`
  if (!pathname.startsWith(prefix)) return undefined
  const segments = pathname.slice(prefix.length).split('/')
  const [subjectType, subjectId] = segments
  if (segments.length !== 2 || !subjectType || !subjectId) return undefined
  try {
    return {
      subjectId: decodeURIComponent(subjectId),
      subjectType: decodeURIComponent(subjectType),
    }
  } catch {
    return undefined
  }
}

export function buildDriverConversationPath(subject: DriverConversationSubject): string {
  return `${DRIVER_ROUTE_PATH.conversations}/${encodeURIComponent(subject.subjectType)}/${encodeURIComponent(subject.subjectId)}`
}

export function navigateToDriverConversation(
  subject: DriverConversationSubject,
  target: DriverNavigationTarget = window,
): void {
  const path = buildDriverConversationPath(subject)
  if (target.location.pathname === path) return
  target.history.pushState({}, '', path)
  target.dispatchEvent(new PopStateEvent('popstate'))
}

export const DRIVER_OCCURRENCE_KINDS = ['document', 'stop'] as const
export type DriverOccurrenceRouteKind = (typeof DRIVER_OCCURRENCE_KINDS)[number]

export type DriverOccurrenceRoute = Readonly<{ id: string; kind: DriverOccurrenceRouteKind }>

/** `/ocorrencias/:kind/:id`; a lista, kind desconhecido, segmentos a mais ou malformado não são detalhe. */
export function parseDriverOccurrenceRoute(pathname: string): DriverOccurrenceRoute | undefined {
  const prefix = `${DRIVER_ROUTE_PATH.occurrences}/`
  if (!pathname.startsWith(prefix)) return undefined
  const segments = pathname.slice(prefix.length).split('/')
  const [kind, id] = segments
  const knownKind = DRIVER_OCCURRENCE_KINDS.find((candidate) => candidate === kind)
  if (segments.length !== 2 || knownKind === undefined || !id) return undefined
  try {
    return { id: decodeURIComponent(id), kind: knownKind }
  } catch {
    return undefined
  }
}

export function buildDriverOccurrencePath(route: DriverOccurrenceRoute): string {
  return `${DRIVER_ROUTE_PATH.occurrences}/${route.kind}/${encodeURIComponent(route.id)}`
}

export function navigateToDriverOccurrence(
  route: DriverOccurrenceRoute,
  target: DriverNavigationTarget = window,
): void {
  const path = buildDriverOccurrencePath(route)
  if (target.location.pathname === path) return
  target.history.pushState({}, '', path)
  target.dispatchEvent(new PopStateEvent('popstate'))
}

/** O filtro da lista: as ocorrências de uma nota (`?nota=`) ou só as de parada de uma parada (`?parada=`). */
export type DriverOccurrenceListFilter = Readonly<{ documentId?: string; stopId?: string }>

export function buildDriverOccurrenceListPath(filter: DriverOccurrenceListFilter): string {
  const base = DRIVER_ROUTE_PATH.occurrences
  if (filter.documentId !== undefined)
    return `${base}?nota=${encodeURIComponent(filter.documentId)}`
  if (filter.stopId !== undefined) return `${base}?parada=${encodeURIComponent(filter.stopId)}`
  return base
}

export function parseDriverOccurrenceListFilter(search: string): DriverOccurrenceListFilter {
  const params = new URLSearchParams(search)
  const documentId = params.get('nota')
  if (documentId) return { documentId }
  const stopId = params.get('parada')
  return stopId ? { stopId } : {}
}

/** Sempre empurra: o filtro mora na query, que o `pathname` do alvo não enxerga. */
export function navigateToDriverOccurrenceList(
  filter: DriverOccurrenceListFilter,
  target: DriverNavigationTarget = window,
): void {
  target.history.pushState({}, '', buildDriverOccurrenceListPath(filter))
  target.dispatchEvent(new PopStateEvent('popstate'))
}

const STOP_HASH_PREFIX = '#stop-'

/** `/#stop-<id>`: a rota com a parada em destaque; quem abre a viagem rola até ela e põe o foco. */
export function buildDriverStopPath(stopId: string): string {
  return `${DRIVER_ROUTE_PATH.trip}${STOP_HASH_PREFIX}${encodeURIComponent(stopId)}`
}

export function parseDriverStopHash(hash: string): string | undefined {
  if (!hash.startsWith(STOP_HASH_PREFIX)) return undefined
  const encoded = hash.slice(STOP_HASH_PREFIX.length)
  if (encoded === '') return undefined
  try {
    return decodeURIComponent(encoded)
  } catch {
    return undefined
  }
}

/** Sempre empurra: o destaque mora no hash, que o `pathname` do alvo não enxerga. */
export function navigateToDriverStop(
  stopId: string,
  target: DriverNavigationTarget = window,
): void {
  target.history.pushState({}, '', buildDriverStopPath(stopId))
  target.dispatchEvent(new PopStateEvent('popstate'))
}
