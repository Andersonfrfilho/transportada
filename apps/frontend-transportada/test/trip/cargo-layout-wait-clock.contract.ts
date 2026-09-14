/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import tripEnglish from '../../src/modules/trip/locales/trip.en.locale.json'
import trip from '../../src/modules/trip/locales/trip.locale.json'
import {
  formatCargoLayoutElapsed,
  isCargoLayoutWaitLong,
  resolveCargoLayoutElapsedMs,
} from '../../src/modules/trip/shared/cargoLayoutElapsed.service'
import { resolveCargoLayoutView } from '../../src/modules/trip/shared/cargoLayoutPolling.service'
import { CARGO_LAYOUT_SLOW_NOTICE_MS } from '../../src/modules/trip/shared/trip.constant'
import type { TripCargoLayoutState } from '../../src/modules/trip/shared/trip.types'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): string {
  return readFileSync(new URL(filePath, APPLICATION_ROOT), 'utf8')
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/^\s*\/\/.*$/gmu, '')
}

const WAIT = 'src/modules/trip/components/TripCargoLayoutWait.component.tsx'
const ELAPSED_HOOK = 'src/modules/trip/hooks/useCargoLayoutElapsed.hook.ts'
const START = 1_000_000

describe('o relógio da espera da planta (spec 145, loading de 18 min)', () => {
  describe('tempo decorrido por função pura', () => {
    it('formata segundos e minutos', () => {
      expect(formatCargoLayoutElapsed(0)).toBe('0 s')
      expect(formatCargoLayoutElapsed(59_999)).toBe('59 s')
      expect(formatCargoLayoutElapsed(80_000)).toBe('1 min 20 s')
      expect(formatCargoLayoutElapsed(725_000)).toBe('12 min 5 s')
      expect(formatCargoLayoutElapsed(120_000)).toBe('2 min')
    })

    it('mede do começo do episódio, sem ficar negativo', () => {
      expect(resolveCargoLayoutElapsedMs({ now: START + 80_000, since: START })).toBe(80_000)
      expect(resolveCargoLayoutElapsedMs({ now: START - 5, since: START })).toBe(0)
    })

    it('a frase de expectativa só aparece a partir de 2 min', () => {
      expect(CARGO_LAYOUT_SLOW_NOTICE_MS).toBe(120_000)
      expect(isCargoLayoutWaitLong(CARGO_LAYOUT_SLOW_NOTICE_MS - 1)).toBe(false)
      expect(isCargoLayoutWaitLong(CARGO_LAYOUT_SLOW_NOTICE_MS)).toBe(true)
    })
  })

  describe('o episódio chega à tela pelo modelo de estado', () => {
    const pending = {
      errorCode: null,
      stale: false,
      status: 'pending',
      truncated: false,
    } as unknown as TripCargoLayoutState

    it('pending carrega o começo do episódio; as outras fases, não', () => {
      const episode = { key: 'trip-1', since: START }
      expect(
        resolveCargoLayoutView({ episode, layout: null, now: START + 1, state: pending })
          ?.pendingSince,
      ).toBe(START)
      const failed = { ...pending, status: 'failed' } as TripCargoLayoutState
      expect(
        resolveCargoLayoutView({ episode: undefined, layout: null, now: START, state: failed })
          ?.pendingSince,
      ).toBeUndefined()
    })
  })

  describe('o selo de carregamento', () => {
    const wait = readApplicationFile(WAIT)
    const code = withoutComments(wait)

    it('mostra o ícone de carregamento do design system, que gira', () => {
      expect(code).toContain("'spinner'")
      expect(code).toContain('<Icon')
    })

    it('prefers-reduced-motion desliga a rotação do ícone', () => {
      expect(readApplicationFile('src/components/ui/icon.module.css')).toMatch(
        /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.spinning\s*\{\s*animation: none/u,
      )
    })

    it('mostra o tempo decorrido e a frase de expectativa pelo locale', () => {
      expect(code).toContain("t('cargoLayers.wait.elapsed'")
      expect(code).toContain("t('cargoLayers.wait.slow')")
      expect(code).toContain('isCargoLayoutWaitLong')
      expect(code).toContain('formatCargoLayoutElapsed')
      expect(code).toContain('useCargoLayoutElapsed')
    })

    it('o tempo decorrido fica fora da região viva: o leitor de tela não o anuncia a cada segundo', () => {
      expect(code).toMatch(/aria-live="off"[^>]*>\s*\{t\('cargoLayers\.wait\.elapsed'/u)
      const liveRegion = /role="status"[^>]*>([\s\S]*?)<\/div>/u.exec(code)?.[1] ?? ''
      expect(liveRegion).toContain("t('cargoLayers.wait.slow')")
      expect(liveRegion).not.toContain('cargoLayers.wait.elapsed')
    })

    it('o relógio da tela tem relógio injetável e limpa o intervalo', () => {
      const hook = readApplicationFile(ELAPSED_HOOK)
      expect(hook).toContain('readNow')
      expect(hook).toContain('setInterval')
      expect(hook).toContain('clearInterval')
      expect(hook).toContain('resolveCargoLayoutElapsedMs')
    })
  })

  describe('textos', () => {
    it('pt-BR acentuado e inglês nos dois locales', () => {
      expect(trip.cargoLayers.wait.elapsed).toBe('Calculando há {{elapsed}}')
      expect(trip.cargoLayers.wait.slow).toBe(
        'Viagens grandes levam alguns minutos. A planta aparece aqui sozinha.',
      )
      expect(tripEnglish.cargoLayers.wait.elapsed).toContain('{{elapsed}}')
      expect(tripEnglish.cargoLayers.wait.slow.length).toBeGreaterThan(0)
    })
  })
})
