/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { COLOR_THEME_STORAGE_KEY } from '../../src/modules/shared/colorTheme.constant'
import {
  dismissSplash,
  SPLASH_FADE_OUT_MS,
  SPLASH_MINIMUM_VISIBLE_MS,
} from '../../src/modules/shared/splash.service'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function createSplash() {
  const classes = new Set<string>()
  let removed = false
  return {
    classList: { add: (name: string) => classes.add(name) },
    classes,
    remove: () => {
      removed = true
    },
    wasRemoved: () => removed,
  }
}

function createHost(input: { readonly elapsedMs: number; readonly reducedMotion: boolean }) {
  const splash = createSplash()
  const scheduled: Array<{ readonly callback: () => void; readonly delayMs: number }> = []
  const host = {
    document: { getElementById: () => splash as unknown as HTMLElement },
    elapsedMs: () => input.elapsedMs,
    prefersReducedMotion: () => input.reducedMotion,
    schedule: (callback: () => void, delayMs: number) => scheduled.push({ callback, delayMs }),
  }
  return { host, scheduled, splash }
}

describe('splash do motorista', () => {
  test('sem movimento reduzido, espera só o que falta do mínimo e some em fade', () => {
    const { host, scheduled, splash } = createHost({ elapsedMs: 200, reducedMotion: false })
    dismissSplash(host)
    expect(scheduled[0]?.delayMs).toBe(SPLASH_MINIMUM_VISIBLE_MS - 200)
    scheduled[0]?.callback()
    expect(splash.classes.has('is-leaving')).toBe(true)
    expect(splash.wasRemoved()).toBe(false)
    expect(scheduled[1]?.delayMs).toBe(SPLASH_FADE_OUT_MS)
    scheduled[1]?.callback()
    expect(splash.wasRemoved()).toBe(true)
  })

  test('app lento nunca é atrasado: passado o mínimo, sai sem espera', () => {
    const { host, scheduled } = createHost({ elapsedMs: 5000, reducedMotion: false })
    dismissSplash(host)
    expect(scheduled[0]?.delayMs).toBe(0)
  })

  test('com prefers-reduced-motion some na hora, sem mínimo nem fade', () => {
    const { host, scheduled, splash } = createHost({ elapsedMs: 0, reducedMotion: true })
    dismissSplash(host)
    expect(scheduled).toHaveLength(0)
    expect(splash.wasRemoved()).toBe(true)
  })

  test('sem o elemento no documento não faz nada', () => {
    dismissSplash({
      document: { getElementById: () => null },
      elapsedMs: () => 0,
      prefersReducedMotion: () => false,
      schedule: () => {
        throw new Error('não deveria agendar')
      },
    })
  })

  test('o theme-boot.js lê a mesma chave que o app grava', async () => {
    const boot = await readApplicationFile('public/theme-boot.js')
    expect(boot).toContain(`'${COLOR_THEME_STORAGE_KEY}'`)
  })

  test('o theme-boot.js tem a rede de segurança que remove a splash se o app não montar', async () => {
    const boot = await readApplicationFile('public/theme-boot.js')
    expect(boot).toContain("getElementById('splash')")
    expect(boot).toContain('setTimeout')
  })

  test('as cores da splash são as dos tokens do app, nos dois temas', async () => {
    const html = await readApplicationFile('index.html')
    const css = await readApplicationFile('src/styles/index.css')
    const dark = { bg: '#10222c', ink: '#f0f2ee', accent: '#d58a47' }
    const light = { bg: '#f2efe9', ink: '#1d2b33', accent: '#a3591f' }
    for (const palette of [dark, light]) {
      for (const value of Object.values(palette)) {
        expect(html).toContain(value)
        expect(css).toContain(value)
      }
    }
    expect(css).toContain(`--color-asphalt: ${dark.bg}`)
    expect(css).toContain(`--color-fog: ${dark.ink}`)
    expect(css).toContain(`--color-copper: ${dark.accent}`)
    expect(css).toContain(`--color-asphalt: ${light.bg}`)
    expect(css).toContain(`--color-fog: ${light.ink}`)
    expect(css).toContain(`--color-copper: ${light.accent}`)
  })

  test('theme-color e manifest usam o fundo escuro da splash', async () => {
    const html = await readApplicationFile('index.html')
    const manifest = await readApplicationFile('src/modules/shared/webManifest.constant.ts')
    const theme = await readApplicationFile('src/modules/shared/colorTheme.service.ts')
    expect(html).toContain('<meta name="theme-color" content="#10222c" />')
    expect(manifest).toContain("THEME_COLOR = '#10222c'")
    expect(theme).toContain("dark: '#10222c'")
  })

  test('o index.html tem a splash fora do #root e respeita movimento reduzido', async () => {
    const html = await readApplicationFile('index.html')
    expect(html.indexOf('id="splash"')).toBeLessThan(html.indexOf('id="root"'))
    expect(html).toContain('prefers-reduced-motion: no-preference')
    expect(html).toContain('prefers-reduced-motion: reduce')
    expect(html).not.toContain('<script>')
    expect(html).toMatch(/#splash \{[^}]*pointer-events: none/u)
  })
})
