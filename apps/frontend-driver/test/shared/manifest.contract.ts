/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { DRIVER_WEB_MANIFEST } from '../../src/modules/shared/webManifest.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const THEME_COLOR = '#0B1F2A'

/** Largura e altura do cabeçalho `IHDR`, que todo PNG traz nos bytes 16 a 23. */
async function readPngSize(path: string): Promise<{ width: number; height: number }> {
  const bytes = new DataView(await Bun.file(new URL(path, APPLICATION_ROOT)).arrayBuffer())
  return { width: bytes.getUint32(16), height: bytes.getUint32(20) }
}

describe('o manifesto da app do motorista (ADR-0075 §5)', () => {
  /**
   * O nome é genérico — a marca da transportadora chega em tempo de execução. `id`, `start_url` e
   * `scope` na raiz da origem própria: o ícone instalado abre a viagem, nunca o escritório.
   */
  test('tem os campos da ADR', () => {
    const fields = Object.fromEntries(
      Object.entries(DRIVER_WEB_MANIFEST).filter(([field]) => field !== 'icons'),
    )

    expect(fields).toEqual({
      background_color: THEME_COLOR,
      description: 'A viagem do motorista: paradas, entregas e comprovantes.',
      display: 'standalone',
      id: '/',
      lang: 'pt-BR',
      name: 'Minha viagem',
      scope: '/',
      short_name: 'Viagem',
      start_url: '/',
      theme_color: THEME_COLOR,
    })
  })

  /**
   * A assinatura trava paisagem com `screen.orientation.lock` só enquanto dura; uma `orientation`
   * no manifesto travaria a app inteira.
   */
  test('não declara orientação', () => {
    expect(Object.keys(DRIVER_WEB_MANIFEST)).not.toContain('orientation')
  })

  test('declara 192, 512 e 512 maskable, e cada arquivo tem o tamanho que diz', async () => {
    expect(DRIVER_WEB_MANIFEST.icons).toEqual([
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ])

    for (const icon of DRIVER_WEB_MANIFEST.icons) {
      const { width, height } = await readPngSize(`public${icon.src}`)
      expect(`${width}x${height}`).toBe(icon.sizes)
    }
  })

  /** O iPhone ignora os ícones do manifesto e usa o `apple-touch-icon` de 180. */
  test('o index.html aponta o apple-touch-icon de 180', async () => {
    const html = await Bun.file(new URL('index.html', APPLICATION_ROOT)).text()

    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" />')
    expect(html).toContain(`<meta name="theme-color" content="${THEME_COLOR}" />`)
    expect(await readPngSize('public/icons/apple-touch-icon-180.png')).toEqual({
      width: 180,
      height: 180,
    })
  })

  test('o vite.config.ts publica este manifesto, e não outro', async () => {
    const config = await Bun.file(new URL('vite.config.ts', APPLICATION_ROOT)).text()

    expect(config).toContain('manifest: DRIVER_WEB_MANIFEST')
  })
})
