/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DRIVER_TRIP_PATH } from './driverWorkspace.service'

/**
 * ADR-0075 §6: o que o painel faz com quem abre a entrada do motorista, depois que ele ganhou app
 * própria. A decisão é pura e recebe tudo de fora — o boot é quem lê a variável, a fila e o modo de
 * exibição.
 *
 * - `stay`: o painel serve `/minha-viagem` como sempre. É o resultado **sem o interruptor**.
 * - `redirect`: fila antiga vazia; o motorista vai para a casa nova.
 * - `install-screen`: fila vazia, mas aberto pelo ícone antigo (`standalone`) — um
 *   `location.replace` para outra origem sairia do `scope` e cairia numa aba solta.
 * - `pending-screen`: há o que enviar da fila antiga, que mora no IndexedDB **desta** origem e só
 *   sai daqui. Vem antes de tudo.
 */
export type DriverAppRedirectMode = 'install-screen' | 'pending-screen' | 'redirect' | 'stay'

export type DriverAppRedirectInput = Readonly<{
  /** `readDriverAppUrl()`: `undefined` é o interruptor desligado. */
  driverAppUrl: string | undefined
  /** Só vale na raiz: em `/minha-viagem` o caminho já diz de quem é a tela. */
  isFieldOnlyUser: boolean
  isStandalone: boolean
  pathname: string
  /** `countPending(...).total` da fila antiga. */
  pendingTotal: number
}>

export function resolveDriverAppRedirect(input: DriverAppRedirectInput): DriverAppRedirectMode {
  if (input.driverAppUrl === undefined) return 'stay'

  const isDriverEntry =
    input.pathname === DRIVER_TRIP_PATH || (input.pathname === '/' && input.isFieldOnlyUser)
  if (!isDriverEntry) return 'stay'

  if (input.pendingTotal > 0) return 'pending-screen'
  if (input.isStandalone) return 'install-screen'
  return 'redirect'
}

/**
 * Rede de segurança em runtime (revisão M1): `VITE_DRIVER_APP_URL` já é validada no build contra
 * `VITE_APP_URL` (`vite.config.ts`, `assertDriverAppUrlBuildsClean`), mas o valor de um serviço
 * pode mudar entre o build e o deploy do painel. Comparar a origem aqui, antes de todo
 * `location.replace(driverAppUrl)` automático, evita um laço de redirect consigo mesmo — URL
 * ilegível conta como "é a própria origem", porque não redirecionar é sempre o lado seguro.
 */
export function isDriverAppUrlOwnOrigin(
  input: Readonly<{ driverAppUrl: string; origin: string }>,
): boolean {
  try {
    return new URL(input.driverAppUrl).origin === input.origin
  } catch {
    return true
  }
}

/** O ícone antigo instalado abre o painel sem barra de endereço; no iOS o sinal é `standalone`. */
export function isStandaloneDisplay(
  target: Readonly<{
    matchMedia: (query: string) => Readonly<{ matches: boolean }>
    navigator: object
  }>,
): boolean {
  if (target.matchMedia('(display-mode: standalone)').matches) return true
  return 'standalone' in target.navigator && target.navigator.standalone === true
}

export const DRIVER_LEGACY_BEACON_PATH = '/_driver-legacy-served'
export const DRIVER_LEGACY_BEACON_MODE = 'pending-screen'

/**
 * A medida que autoriza remover o módulo antigo (ADR-0075 §6): zero destes em 14 dias de log de
 * produção. Sai **só** da tela de pendências — conta de escritório abrindo `/minha-viagem` seria
 * ruído — e vai para a própria origem, sem usuário nem identificador no corpo.
 */
export function sendDriverLegacyBeacon(
  target: Readonly<{ sendBeacon: (url: string, data: string) => boolean }>,
): void {
  target.sendBeacon(DRIVER_LEGACY_BEACON_PATH, DRIVER_LEGACY_BEACON_MODE)
}
