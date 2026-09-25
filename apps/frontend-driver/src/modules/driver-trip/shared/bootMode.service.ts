/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CaptureRegistry } from './captureRegistry.service'
import { isTripSnapshotUsable, type OwnedTripSnapshot } from './tripSnapshot.service'

/**
 * Boot sem rede (plan D4, ADR-0075 §8). A decisão acontece **antes** do `keycloak.init`: o
 * `check-sso` sem `silentCheckSsoRedirectUri` navega a página inteira, e nenhuma exceção dele chega
 * ao código — esperar a falha do `init` não serve. E a entrada é a sonda, não `navigator.onLine`,
 * que diz `true` com sinal fraco e o Keycloak sem responder.
 */
export const IDENTITY_PROBE_TIMEOUT_MS = 5_000

/**
 * Com sinal fraco o `online` nunca dispara — o navegador acha que já está online. A sonda repete
 * neste intervalo, o mesmo do temporizador de drenagem (plan D5).
 */
export const REAUTHENTICATION_RETRY_MS = 30_000

export type BootMode = 'authenticate' | 'offline-empty' | 'offline-snapshot'

export type ProbeFetch = (
  url: string,
  init: Readonly<{ cache: 'no-store'; signal: AbortSignal }>,
) => Promise<Readonly<{ ok: boolean }>>

export async function probeIdentityProvider(input: {
  readonly fetch: ProbeFetch
  readonly keycloakUrl: string
  readonly realm: string
  readonly timeoutMs?: number
}): Promise<boolean> {
  const url = `${input.keycloakUrl}/realms/${encodeURIComponent(input.realm)}/.well-known/openid-configuration`
  try {
    const response = await input.fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(input.timeoutMs ?? IDENTITY_PROBE_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    /** Sem rede, sem DNS ou sem resposta no prazo: tudo é "não dá para autenticar agora". */
    return false
  }
}

export function resolveBootMode(input: {
  readonly isReachable: boolean
  readonly now: Date
  readonly snapshot: OwnedTripSnapshot | undefined
}): BootMode {
  if (input.isReachable) return 'authenticate'
  if (input.snapshot === undefined) return 'offline-empty'
  return isTripSnapshotUsable({ now: input.now, stored: input.snapshot })
    ? 'offline-snapshot'
    : 'offline-empty'
}

export type ReconnectTarget = Readonly<{
  addEventListener: (type: 'online', listener: () => void) => void
  clearInterval: (id: number) => void
  removeEventListener: (type: 'online', listener: () => void) => void
  setInterval: (handler: () => void, timeout: number) => number
}>

/**
 * A autenticação adiada: a cada `online` (e a cada intervalo, pelo sinal fraco) a app sonda de novo.
 * Com o Keycloak respondendo, `authenticate` — que é o `keycloak.init`, e ele navega a página — só
 * roda com o registro de capturas vazio. Com captura aberta, espera o `close` e sonda outra vez,
 * porque a rede pode ter caído durante a captura. Roda uma vez só; devolve o cancelamento.
 */
export function scheduleAuthenticationOnReconnect(input: {
  readonly authenticate: () => Promise<void>
  readonly captureRegistry: Pick<CaptureRegistry, 'isIdle' | 'onIdle'>
  readonly probe: () => Promise<boolean>
  readonly target: ReconnectTarget
}): () => void {
  let isSettled = false
  let isAttempting = false
  let unsubscribeIdle: (() => void) | undefined

  function stop(): void {
    isSettled = true
    input.target.removeEventListener('online', handleReconnect)
    input.target.clearInterval(intervalId)
    unsubscribeIdle?.()
    unsubscribeIdle = undefined
  }

  function waitForIdle(): void {
    unsubscribeIdle ??= input.captureRegistry.onIdle(() => {
      unsubscribeIdle?.()
      unsubscribeIdle = undefined
      handleReconnect()
    })
  }

  async function attempt(): Promise<void> {
    const isReachable = await input.probe()
    if (isSettled || !isReachable) return
    if (!input.captureRegistry.isIdle()) {
      waitForIdle()
      return
    }
    stop()
    await input.authenticate()
  }

  function handleReconnect(): void {
    if (isSettled || isAttempting) return
    isAttempting = true
    void attempt().finally(() => {
      isAttempting = false
    })
  }

  input.target.addEventListener('online', handleReconnect)
  const intervalId = input.target.setInterval(handleReconnect, REAUTHENTICATION_RETRY_MS)

  return stop
}
