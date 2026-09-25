/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverTrip } from './driverTrip.types'

/** RF15 (ADR-0075 §8): o teto — no máximo um envio por minuto, com a app aberta. */
export const LOCATION_SHARING_INTERVAL_MS = 60_000

/** A carga na rua: as três fases em que a API aceita o ping (`TRIP_ON_ROAD_STATUSES`). */
const ON_ROAD_TRIP_STATUSES: ReadonlySet<string> = new Set([
  'dispatched',
  'in_transit',
  'on_delivery_route',
])

/** A API guarda sete casas, e a coordenada vai em texto para não carregar erro binário. */
const COORDINATE_DECIMALS = 7

const GEOLOCATION_PERMISSION_DENIED = 1
const GEOLOCATION_POSITION_UNAVAILABLE = 2

/**
 * Code M6 (spec 189 T9.2): sem sinal (debaixo de viaduto, garagem) é transitório — só a negação de
 * permissão é definitiva. Manter o `watch` aberto já bastaria em teoria, mas alguns aparelhos param
 * de chamar o `error`/`success` depois do primeiro `POSITION_UNAVAILABLE`; reabrir o `watch` depois
 * de um tempo é o que garante que ele volta a tentar sozinho.
 */
export const POSITION_UNAVAILABLE_RETRY_DELAY_MS = 30_000

/** `waiting`: GPS observado, sem posição ainda. `unavailable`: GPS negado ou sem sinal nenhum. */
export type LocationSharingStatus = 'off' | 'sharing' | 'unavailable' | 'waiting'

export type SharedPosition = Readonly<{ latitude: string; longitude: string }>

export type ShouldShareLocationParams = Readonly<{
  hasConsent: boolean
  isVisible: boolean
  trips: readonly DriverTrip[]
}>

/**
 * As três guardas juntas. Basta **uma** viagem na rua: o servidor resolve sozinho a viagem do ping,
 * e a escolhida na tela pode ser a planejada enquanto a outra está entregando.
 */
export function shouldShareLocation({
  hasConsent,
  isVisible,
  trips,
}: ShouldShareLocationParams): boolean {
  if (!hasConsent || !isVisible) return false
  return trips.some((trip) => ON_ROAD_TRIP_STATUSES.has(trip.status))
}

/** `window.setTimeout` devolve número; o teste injeta o próprio relógio. */
type TimerId = number

export type LocationSharingDependencies = Readonly<{
  clearTimer: (timerId: TimerId) => void
  geolocation: Pick<Geolocation, 'clearWatch' | 'watchPosition'>
  now: () => number
  onStatusChange: (status: LocationSharingStatus) => void
  send: (position: SharedPosition) => Promise<void>
  setTimer: (callback: () => void, delayMs: number) => TimerId
}>

export type LocationSharingController = Readonly<{
  /** `true` liga o `watchPosition`; `false` faz `clearWatch` e para o temporizador. */
  update: (isActive: boolean) => void
}>

function toSharedPosition(position: GeolocationPosition): SharedPosition {
  return {
    latitude: position.coords.latitude.toFixed(COORDINATE_DECIMALS),
    longitude: position.coords.longitude.toFixed(COORDINATE_DECIMALS),
  }
}

/**
 * O `watchPosition` guarda só a última posição; quem envia é o temporizador, uma vez por intervalo.
 * O relógio do último envio sobrevive a desligar e religar — esconder e voltar à app não fura o
 * teto de um por minuto.
 */
export function createLocationSharingController(
  dependencies: LocationSharingDependencies,
): LocationSharingController {
  let watchId: number | undefined
  let timerId: TimerId | undefined
  let retryTimerId: TimerId | undefined
  let latest: SharedPosition | undefined
  let lastSentAt: number | undefined
  let status: LocationSharingStatus = 'off'

  function changeStatus(next: LocationSharingStatus): void {
    if (next === status) return
    status = next
    dependencies.onStatusChange(next)
  }

  function clearRetryTimer(): void {
    if (retryTimerId !== undefined) dependencies.clearTimer(retryTimerId)
    retryTimerId = undefined
  }

  function halt(): void {
    if (watchId !== undefined) dependencies.geolocation.clearWatch(watchId)
    if (timerId !== undefined) dependencies.clearTimer(timerId)
    clearRetryTimer()
    watchId = undefined
    timerId = undefined
    latest = undefined
  }

  function sendLatest(): void {
    timerId = undefined
    if (latest === undefined) return
    const elapsed = lastSentAt === undefined ? Infinity : dependencies.now() - lastSentAt
    if (elapsed < LOCATION_SHARING_INTERVAL_MS) {
      timerId = dependencies.setTimer(sendLatest, LOCATION_SHARING_INTERVAL_MS - elapsed)
      return
    }
    lastSentAt = dependencies.now()
    // Posição ao vivo não entra na fila: a que falhou já ficou velha, e a próxima vem em um minuto.
    void dependencies.send(latest).catch(() => undefined)
    timerId = dependencies.setTimer(sendLatest, LOCATION_SHARING_INTERVAL_MS)
  }

  function handlePosition(position: GeolocationPosition): void {
    latest = toSharedPosition(position)
    changeStatus('sharing')
    if (timerId === undefined) sendLatest()
  }

  /**
   * Demora (`TIMEOUT`) não é recusa: o `watchPosition` continua e a posição ainda pode chegar.
   * Code M6: sem sinal (`POSITION_UNAVAILABLE`) também não é — o `watch` segue aberto e, se o
   * aparelho parou de chamar sozinho, o temporizador reabre depois de
   * `POSITION_UNAVAILABLE_RETRY_DELAY_MS`. Só `PERMISSION_DENIED` é definitivo.
   */
  function handleError(error: GeolocationPositionError): void {
    if (error.code === GEOLOCATION_PERMISSION_DENIED) {
      halt()
      changeStatus('unavailable')
      return
    }
    if (error.code !== GEOLOCATION_POSITION_UNAVAILABLE) return
    if (retryTimerId !== undefined) return
    retryTimerId = dependencies.setTimer(() => {
      retryTimerId = undefined
      if (watchId === undefined) return
      dependencies.geolocation.clearWatch(watchId)
      watchId = undefined
      start()
    }, POSITION_UNAVAILABLE_RETRY_DELAY_MS)
  }

  function start(): void {
    changeStatus('waiting')
    watchId = dependencies.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      maximumAge: LOCATION_SHARING_INTERVAL_MS,
    })
  }

  return {
    update(isActive) {
      if (!isActive) {
        halt()
        changeStatus('off')
        return
      }
      if (watchId !== undefined || status === 'unavailable') return
      start()
    },
  }
}
