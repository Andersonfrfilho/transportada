/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { SKIP_WAITING_MESSAGE } from '../../src/modules/shared/serviceWorker.constant'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** O código sem comentários: a regra fala do que roda, e o comentário pode citar o que não roda. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
}

describe('o service worker da app do motorista (ADR-0075 §5)', () => {
  /**
   * `injectManifest` desde o primeiro dia: `push` e `notificationclick` (spec 147) não existem em
   * `generateSW`, e trocar de modo depois perde `navigateFallback` e cache sem aviso.
   */
  test('nasce injectManifest, com src/sw.ts', async () => {
    const config = stripComments(await readApplicationFile('vite.config.ts'))

    expect(config).toContain("strategies: 'injectManifest'")
    expect(config).toContain("srcDir: 'src'")
    expect(config).toContain("filename: 'sw.ts'")
    expect(config).not.toContain('generateSW')
    expect(config).not.toContain('runtimeCaching')
  })

  /** Com `autoUpdate`, a versão nova recarregaria a página no meio de uma assinatura ou foto. */
  test("registra com registerType 'prompt'", async () => {
    const config = stripComments(await readApplicationFile('vite.config.ts'))

    expect(config).toContain("registerType: 'prompt'")
    expect(config).not.toContain('autoUpdate')
  })

  test('faz precache, fallback de navegação para index.html e clientsClaim', async () => {
    const worker = stripComments(await readApplicationFile('src/sw.ts'))

    expect(worker).toContain('precacheAndRoute(self.__WB_MANIFEST)')
    expect(worker).toContain("new NavigationRoute(createHandlerBoundToURL('/index.html'))")
    expect(worker).toContain('clientsClaim()')
  })

  /** Sem `runtimeCaching` de API: a única rota além do precache é a navegação. */
  test('não registra rota além da navegação', async () => {
    const worker = stripComments(await readApplicationFile('src/sw.ts'))

    expect(worker.match(/registerRoute\(/gu)?.length).toBe(1)
  })

  /**
   * A versão nova só assume quando a página pede — e a página só pede com o registro de capturas
   * vazio (T3.5). `skipWaiting` fora da mensagem pularia essa espera.
   */
  test('skipWaiting só pela mensagem SKIP_WAITING_MESSAGE', async () => {
    const worker = stripComments(await readApplicationFile('src/sw.ts'))

    expect(worker.match(/skipWaiting\(/gu)?.length).toBe(1)
    expect(worker).toMatch(
      /if \((?:event\.)?data\?\.type === SKIP_WAITING_MESSAGE\) void self\.skipWaiting\(\)/u,
    )
    expect(worker).toContain(
      "import { SKIP_WAITING_MESSAGE } from './modules/shared/serviceWorker.constant'",
    )
  })

  /** É o valor que o `workbox-window` do `virtual:pwa-register` manda em `updateSW(true)`. */
  test('a mensagem é a que o workbox-window envia', () => {
    expect(SKIP_WAITING_MESSAGE).toBe('SKIP_WAITING')
  })

  /**
   * Sem Background Sync (ADR-0075 §8): o `sync` do Chromium só acordaria a página aberta, que os
   * gatilhos da drenagem já cobrem, e drenar com a app fechada exigiria token no SW.
   */
  test('não tem listener de sync', async () => {
    const worker = stripComments(await readApplicationFile('src/sw.ts'))

    expect(worker).not.toMatch(/addEventListener\(\s*['"](?:sync|periodicsync)['"]/u)
    expect(worker).not.toContain('workbox-background-sync')
  })
})
