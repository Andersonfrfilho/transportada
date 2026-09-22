/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * M13d (spec 156 T15): a leitura do canhoto não pode travar "Capturar"/"Pular" para sempre — testa
 * só o mecanismo de teto de tempo (`raceAgainstTimeout`), que é a parte pura e determinística. O
 * motor real do tesseract.js precisa de Worker/WASM que `bun test` não sobe — coberto pela sonda de
 * Playwright/Chromium em `scripts/canhoto-ocr-engine.probe.ts`.
 */
import { describe, expect, test } from 'bun:test'

import { OCR_TIMEOUT, raceAgainstTimeout } from '@/modules/trip/shared/canhotoOcrEngine.service'

describe('raceAgainstTimeout (spec 156 T15, M13d)', () => {
  test('promessa que resolve antes do teto devolve o valor normal', async () => {
    const result = await raceAgainstTimeout(Promise.resolve('leitura ok'), 50)
    expect(result).toBe('leitura ok')
  })

  test('promessa que nunca resolve devolve o sentinela de timeout, sem travar', async () => {
    const neverResolves = new Promise<string>(() => undefined)
    const result = await raceAgainstTimeout(neverResolves, 10)
    expect(result).toBe(OCR_TIMEOUT)
  })

  test('promessa que rejeita propaga o erro, não o timeout', () => {
    expect(raceAgainstTimeout(Promise.reject(new Error('WORKER_CRASH')), 50)).rejects.toThrow(
      'WORKER_CRASH',
    )
  })
})
