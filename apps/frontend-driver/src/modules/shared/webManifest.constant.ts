/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ManifestOptions } from 'vite-plugin-pwa'

const THEME_COLOR = '#0B1F2A'

type WebManifestIcon = {
  readonly src: string
  readonly sizes: string
  readonly type: string
  readonly purpose?: 'maskable'
}

type DriverWebManifest = Omit<Partial<ManifestOptions>, 'icons'> & {
  readonly icons: WebManifestIcon[]
}

/**
 * ADR-0075 §5. O nome é genérico: a marca da transportadora chega em tempo de execução. Sem
 * `orientation` — a assinatura trava paisagem só enquanto dura, e o manifesto travaria a app
 * inteira. O `apple-touch-icon` de 180 fica no `index.html`, porque o iPhone ignora estes ícones.
 */
export const DRIVER_WEB_MANIFEST: DriverWebManifest = {
  id: '/',
  name: 'Minha viagem',
  short_name: 'Viagem',
  description: 'A viagem do motorista: paradas, entregas e comprovantes.',
  /** Sem ele o `vite-plugin-pwa` emite `lang: "en"` num manifesto escrito em português. */
  lang: 'pt-BR',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: THEME_COLOR,
  theme_color: THEME_COLOR,
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    {
      src: '/icons/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
}
