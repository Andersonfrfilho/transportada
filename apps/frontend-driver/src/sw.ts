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
