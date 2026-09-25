/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * RF5 (ADR-0075 §6, plan D4): cinco seções com caminho próprio, navegação por `pushState` e
 * `popstate`, sem biblioteca de roteamento — o mesmo padrão que o painel já usa no `main.tsx`. A
 * casca (`main.tsx`) decide entre a viagem e as notificações por aqui; dentro da viagem, o estado
 * que antes era local em `DriverTripWorkspace.page.tsx` (seção, fila, fotos pendentes) passa a
 * derivar da mesma leitura de rota.
 */
export type DriverRouteSection = 'notifications' | 'pending-proofs' | 'profile' | 'queue' | 'trip'

export const DRIVER_ROUTE_PATH: Readonly<Record<DriverRouteSection, string>> = {
  notifications: '/notificacoes',
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
