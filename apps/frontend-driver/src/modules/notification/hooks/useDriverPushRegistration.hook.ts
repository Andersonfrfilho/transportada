/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'

import { getNotificationClient } from '../shared/notificationClient.service'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

function arrayBufferToBase64Url(buffer: ArrayBuffer | ArrayBufferLike | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer as ArrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    const byte = bytes[i]
    if (byte !== undefined) binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Registra o dispositivo do motorista no Web Push assim que a sessão estiver autenticada.
 * Se o navegador não suportar ou o motorista recusar permissão, o fluxo segue sem erro.
 */
export function useDriverPushRegistration(canSync: boolean): void {
  const isRegisteredRef = useRef(false)

  useEffect(() => {
    if (!canSync || isRegisteredRef.current) return
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    let isMounted = true

    async function registerPush(): Promise<void> {
      try {
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission()
          if (permission !== 'granted') return
        } else if (Notification.permission !== 'granted') {
          return
        }

        const client = getNotificationClient()
        const vapidPublicKey = await client.getVapidPublicKey()
        if (!vapidPublicKey || !isMounted) return

        const registration = await navigator.serviceWorker.ready
        const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)

        let subscription = await registration.pushManager.getSubscription()
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey as unknown as BufferSource,
          })
        }

        if (!isMounted) return

        const p256dh = arrayBufferToBase64Url(subscription.getKey('p256dh'))
        const auth = arrayBufferToBase64Url(subscription.getKey('auth'))

        await client.registerWebPush({
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
          expirationTime: subscription.expirationTime,
        })

        isRegisteredRef.current = true
      } catch {
        // Falhas silenciosas em ambiente offline ou de permissão são esperadas e não interrompem a viagem
      }
    }

    void registerPush()

    return () => {
      isMounted = false
    }
  }, [canSync])
}
