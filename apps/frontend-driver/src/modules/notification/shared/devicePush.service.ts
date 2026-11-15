/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Ativar e desativar o push deste aparelho. Puro de React e do DOM: tudo que toca o navegador entra por
 * `PushEnvironment`, para o contrato rodar sem navegador. O motorista **toca** para ativar (o pedido de
 * permissão sem toque é bloqueado por Chrome e Safari), e toda falha vira um motivo visível: a versão
 * anterior engolia o erro e o aparelho nunca era cadastrado sem ninguém saber por quê.
 */

export type PushDeviceState = 'denied' | 'off' | 'on' | 'unsupported'

export type PushFailureReason =
  | 'denied'
  | 'no_key'
  | 'register_failed'
  | 'subscribe_failed'
  | 'timeout'
  | 'unregister_failed'

export type PushActionResult =
  | { readonly ok: true; readonly state: PushDeviceState }
  | { readonly ok: false; readonly reason: PushFailureReason }

export type PushSubscriptionLike = {
  readonly endpoint: string
  readonly expirationTime: number | null
  readonly getKey: (name: 'auth' | 'p256dh') => ArrayBuffer | null
  readonly unsubscribe: () => Promise<boolean>
}

export type PushEnvironment = {
  readonly getSubscription: () => Promise<PushSubscriptionLike | null>
  readonly getVapidPublicKey: () => Promise<string | undefined>
  readonly isSupported: () => boolean
  readonly permission: () => NotificationPermission
  readonly readStoredDeviceId: () => string | null
  readonly registerWebPush: (subscription: {
    readonly endpoint: string
    readonly expirationTime: number | null
    readonly keys: { readonly auth: string; readonly p256dh: string }
  }) => Promise<{ readonly id: string }>
  readonly requestPermission: () => Promise<NotificationPermission>
  readonly storeDeviceId: (id: string | null) => void
  readonly subscribe: (applicationServerKey: Uint8Array) => Promise<PushSubscriptionLike>
  readonly unregisterDevice: (id: string) => Promise<void>
  /** Prazo de cada espera de rede ou do navegador. */
  readonly timeoutMs?: number
}

export const PUSH_STEP_TIMEOUT_MS = 10_000
export const PUSH_DEVICE_ID_STORAGE_KEY = 'transportada:driver:push-device-id'
export const PUSH_DISABLED_STORAGE_KEY = 'transportada:driver:push-disabled'

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return output
}

export function arrayBufferToBase64Url(buffer: ArrayBuffer | null): string {
  if (buffer === null) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

class PushTimeoutError extends Error {}

async function within<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PushTimeoutError('timeout')), timeoutMs)
  })
  try {
    return await Promise.race([work, deadline])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** O estado que a tela mostra, lido do navegador e do aparelho cadastrado (nunca do servidor). */
export async function readPushState(environment: PushEnvironment): Promise<PushDeviceState> {
  if (!environment.isSupported()) return 'unsupported'
  if (environment.permission() === 'denied') return 'denied'
  if (environment.permission() !== 'granted') return 'off'
  if (environment.readStoredDeviceId() === null) return 'off'
  return (await environment.getSubscription()) === null ? 'off' : 'on'
}

export async function enablePush(environment: PushEnvironment): Promise<PushActionResult> {
  const timeoutMs = environment.timeoutMs ?? PUSH_STEP_TIMEOUT_MS
  if (!environment.isSupported()) return { ok: true, state: 'unsupported' }
  try {
    const permission =
      environment.permission() === 'granted'
        ? 'granted'
        : await within(environment.requestPermission(), timeoutMs)
    if (permission !== 'granted') return { ok: false, reason: 'denied' }

    const publicKey = await within(environment.getVapidPublicKey(), timeoutMs).catch((error) => {
      if (error instanceof PushTimeoutError) throw error
      return undefined
    })
    if (publicKey === undefined || publicKey === '') return { ok: false, reason: 'no_key' }

    let subscription: PushSubscriptionLike
    try {
      subscription =
        (await within(environment.getSubscription(), timeoutMs)) ??
        (await within(environment.subscribe(urlBase64ToUint8Array(publicKey)), timeoutMs))
    } catch (error) {
      if (error instanceof PushTimeoutError) throw error
      return { ok: false, reason: 'subscribe_failed' }
    }

    try {
      const device = await within(
        environment.registerWebPush({
          endpoint: subscription.endpoint,
          expirationTime: subscription.expirationTime,
          keys: {
            auth: arrayBufferToBase64Url(subscription.getKey('auth')),
            p256dh: arrayBufferToBase64Url(subscription.getKey('p256dh')),
          },
        }),
        timeoutMs,
      )
      environment.storeDeviceId(device.id)
    } catch (error) {
      if (error instanceof PushTimeoutError) throw error
      return { ok: false, reason: 'register_failed' }
    }
    return { ok: true, state: 'on' }
  } catch (error) {
    if (error instanceof PushTimeoutError) return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'subscribe_failed' }
  }
}

/**
 * Desativar é ação de privacidade: o aparelho local sai primeiro (inscrição do navegador e id guardado),
 * então mesmo com a API fora do ar o push deixa de chegar a este aparelho. A falha do DELETE é dita ao
 * motorista, mas o estado local já está desligado.
 */
export async function disablePush(environment: PushEnvironment): Promise<PushActionResult> {
  const timeoutMs = environment.timeoutMs ?? PUSH_STEP_TIMEOUT_MS
  const deviceId = environment.readStoredDeviceId()
  try {
    const subscription = await within(environment.getSubscription(), timeoutMs)
    if (subscription !== null) await within(subscription.unsubscribe(), timeoutMs)
  } catch {
    // Sem inscrição legível não há o que cancelar no navegador; o cadastro na API segue abaixo.
  }
  environment.storeDeviceId(null)
  if (deviceId === null) return { ok: true, state: 'off' }
  try {
    await within(environment.unregisterDevice(deviceId), timeoutMs)
    return { ok: true, state: 'off' }
  } catch {
    return { ok: false, reason: 'unregister_failed' }
  }
}
