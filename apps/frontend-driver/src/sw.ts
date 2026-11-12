/* Copyright (c) 2026 Ada Technology. MIT License. */
/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core'
import { createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

import { SKIP_WAITING_MESSAGE } from './modules/shared/serviceWorker.constant'

/**
 * ADR-0075 §5: `injectManifest` desde o primeiro dia, porque `push` e `notificationclick` (spec 147)
 * entram aqui como handlers novos. Sem `sync` (ADR-0075 §8) e sem cache de API: a viagem é estado
 * que muda, e o snapshot offline mora no IndexedDB da página, com dono e prazo.
 */
declare const self: ServiceWorkerGlobalScope & {
  readonly __WB_MANIFEST: Array<PrecacheEntry | string>
}

precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))
clientsClaim()

/** A versão nova só assume quando a página pede, e a página só pede fora de uma captura. */
self.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as { readonly type?: unknown } | null | undefined
  if (data?.type === SKIP_WAITING_MESSAGE) void self.skipWaiting()
})

/** Exibe a notificação push no aparelho do motorista. */
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return

  let payload: { title?: string; body?: string; icon?: string; badge?: string; data?: { url?: string } } = {}
  try {
    payload = event.data.json() as typeof payload
  } catch {
    payload = { title: 'TransportAdA', body: event.data.text() }
  }

  const title = payload.title ?? 'TransportAdA'
  const options: NotificationOptions = {
    body: payload.body ?? '',
    icon: payload.icon ?? '/icon-192.png',
    badge: payload.badge ?? '/badge-72.png',
    data: payload.data ?? { url: '/notificacoes' },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

/** Foca a aba aberta ou abre a rota de destino ao clicar na notificação. */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url ?? '/notificacoes'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client && client.url.includes(targetUrl)) {
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
