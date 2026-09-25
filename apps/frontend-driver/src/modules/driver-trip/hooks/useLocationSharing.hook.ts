/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState, useSyncExternalStore } from 'react'

import type { DriverTrip } from '../shared/driverTrip.types'
import { getDriverTripClient } from '../shared/driverTripClient.service'
import { locationConsentRevocation } from '../shared/locationConsentRevocation.service'
import {
  createLocationSharingController,
  shouldShareLocation,
  type LocationSharingStatus,
} from '../shared/locationSharing.service'
import { useLocationConsent } from './useLocationConsent.hook'

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}

function readIsVisible(): boolean {
  return document.visibilityState === 'visible'
}

/** Aparelho sem GPS nenhum: o rastreamento nunca liga, e a tela diz que a posição não está disponível. */
function readGeolocation(): Geolocation | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.geolocation
}

/**
 * RF15: liga o `watchPosition` só com consentimento, viagem na rua e app visível, e desliga
 * (`clearWatch`) quando qualquer das três cai. O controlador vive o tempo da tela, e com ele o
 * relógio do último envio — esconder e voltar não fura o teto de um por minuto.
 */
export function useLocationSharing(trips: readonly DriverTrip[]): LocationSharingStatus {
  const consent = useLocationConsent()
  const isVisible = useSyncExternalStore(subscribeVisibility, readIsVisible)
  const [status, setStatus] = useState<LocationSharingStatus>('off')
  const [geolocation] = useState(readGeolocation)
  const [controller] = useState(() =>
    geolocation === undefined
      ? undefined
      : createLocationSharingController({
          clearTimer: (timerId) => window.clearTimeout(timerId),
          geolocation,
          now: () => Date.now(),
          onStatusChange: setStatus,
          revocation: locationConsentRevocation,
          send: (position, signal) => getDriverTripClient().sendLocation(position, signal),
          setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
        }),
  )
  const isActive = shouldShareLocation({ hasConsent: consent.hasConsent, isVisible, trips })

  useEffect(() => {
    controller?.update(isActive)
  }, [controller, isActive])

  useEffect(() => () => controller?.update(false), [controller])

  if (controller === undefined && isActive) return 'unavailable'
  return status
}
