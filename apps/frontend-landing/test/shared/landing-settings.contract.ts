/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import {
  DEFAULT_LANDING_SETTINGS,
  fetchLandingSettings,
} from '../../src/modules/shared/landingSettings.service.js'
import { sanitizeAccentColor } from '../../src/modules/shared/landingSettings.validation.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** Onde um literal de cliente (nome, telefone, e-mail) apareceria se alguém hardcodasse a marca. */
const CLIENT_LITERAL_PATTERN = /transportadora (azul|vermelha|verde)/iu

describe('landing settings', () => {
  test('sem linha configurada ou fetch fora do ar, devolve o padrão do app', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() => {
      throw new Error('network down')
    }) as unknown as typeof fetch

    try {
      const settings = await fetchLandingSettings({ apiBaseUrl: 'http://localhost:1' })
      expect(settings).toEqual(DEFAULT_LANDING_SETTINGS)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('uma resposta de erro HTTP também devolve o padrão, sem lançar', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof fetch

    try {
      const settings = await fetchLandingSettings({ apiBaseUrl: 'http://localhost:1' })
      expect(settings).toEqual(DEFAULT_LANDING_SETTINGS)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('cor hex inválida nunca vaza para o CSS — cai no token padrão', () => {
    expect(sanitizeAccentColor('red')).toBeUndefined()
    expect(sanitizeAccentColor('#fff')).toBeUndefined()
    expect(sanitizeAccentColor('#1a2b3c; background: url(x)')).toBeUndefined()
    expect(sanitizeAccentColor('#1a2b3c')).toBe('#1a2b3c')
  })

  test('unidades e seções da resposta chegam sanitizadas', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: {
              accentColor: '#123abc',
              brandName: 'Transportadora Exemplo',
              sections: { hero: { title: 'Bem-vindo' } },
              units: [{ city: 'São Paulo', tradeName: 'Sede' }],
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        ),
      )) as unknown as typeof fetch

    try {
      const settings = await fetchLandingSettings({ apiBaseUrl: 'http://localhost:1' })
      expect(settings.accentColor).toBe('#123abc')
      expect(settings.brandName).toBe('Transportadora Exemplo')
      expect(settings.sections).toEqual({ hero: { title: 'Bem-vindo' } })
      expect(settings.units).toEqual([
        {
          city: 'São Paulo',
          complement: '',
          district: '',
          number: '',
          phone: '',
          postalCode: '',
          state: '',
          street: '',
          tradeName: 'Sede',
        },
      ])
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('nenhum literal de cliente aparece em src — texto vem sempre da configuração ou do locale', async () => {
    const glob = new Bun.Glob('**/*.{ts,tsx}')
    for await (const relativePath of glob.scan({
      cwd: fileURLToPath(new URL('src', APPLICATION_ROOT)),
    })) {
      const content = await Bun.file(
        fileURLToPath(new URL(`src/${relativePath}`, APPLICATION_ROOT)),
      ).text()
      expect(CLIENT_LITERAL_PATTERN.test(content)).toBeFalse()
    }
  })
})
