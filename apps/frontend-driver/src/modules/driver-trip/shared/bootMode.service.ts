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

  /**
   * ⚠️ Só o sucesso desliga. O `stop()` vinha antes do `authenticate`, e um `init` que rejeitava
   * (Keycloak caiu entre a sonda e o `init`) apagava a reconexão para sempre: a app ficava no
   * snapshot sem sessão até alguém recarregar. Rejeitou, o próximo `online` ou tique tenta de novo.
   */
  async function attempt(): Promise<void> {
    const isReachable = await input.probe()
    if (isSettled || !isReachable) return
    if (!input.captureRegistry.isIdle()) {
      waitForIdle()
      return
    }
    try {
      await input.authenticate()
      stop()
    } catch {
      /** Continua agendado: o temporizador e o `online` seguem ligados. */
    }
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

/**
 * O boot inteiro (spec 189 T9.2 A3), na ordem que a ADR-0075 §8 exige: o esqueleto **antes** de
 * qualquer espera (a sonda leva até 5 s, e página em branco parece app travada), a sonda e o
 * snapshot, a decisão, e só então o `init`. Um `init` que rejeita — Keycloak respondeu à sonda e caiu
 * logo depois — cai no mesmo caminho do boot sem rede: o snapshot válido, ou a tela vazia, e a
 * autenticação reagendada por quem abre esse caminho. Nunca a página em branco.
 */
export async function runDriverBoot(input: {
  readonly authenticate: () => Promise<void>
  readonly now: () => Date
  readonly probe: () => Promise<boolean>
  readonly readLastSnapshot: () => Promise<OwnedTripSnapshot | undefined>
  readonly renderLoading: () => void
  readonly startOffline: (snapshot: OwnedTripSnapshot | undefined) => void
}): Promise<void> {
  input.renderLoading()

  const [isReachable, lastSnapshot] = await Promise.all([
    input.probe(),
    /** IndexedDB indisponível (aba privada, cota) é o mesmo que não ter snapshot. */
    input.readLastSnapshot().catch(() => undefined),
  ])

  function offlineSnapshot(): OwnedTripSnapshot | undefined {
    const mode = resolveBootMode({ isReachable: false, now: input.now(), snapshot: lastSnapshot })
    return mode === 'offline-snapshot' ? lastSnapshot : undefined
  }

  if (
    resolveBootMode({ isReachable, now: input.now(), snapshot: lastSnapshot }) !== 'authenticate'
  ) {
    input.startOffline(offlineSnapshot())
    return
  }

  try {
    await input.authenticate()
  } catch {
    input.startOffline(offlineSnapshot())
  }
}
