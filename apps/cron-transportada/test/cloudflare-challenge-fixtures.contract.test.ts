/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Contrato de integridade das fixtures de desafio do Cloudflare (spec 161, T001). Cada fixture
 * carrega a assinatura de detecção do RF04 que pretende representar; este teste trava os sinais no
 * nível do DADO (status, headers, corpo). Uma edição futura que apague um marcador reprova aqui,
 * antes de o T002 mapear os mesmos sinais para `BLOCKED_BY_CHALLENGE` (CA01).
 *
 * Nenhuma política de detecção é exercitada — só o conteúdo das fixtures. A página normal é o
 * controle negativo: uma ficha legítima atrás do Cloudflare com status 200 não traz sinal
 * nenhum, mesmo servida por ele (`server: cloudflare` + 200 não é assinatura do RF04).
 */
import { describe, expect, test } from 'bun:test'

import {
  ACCESS_DENIED_1020,
  CF_MITIGATED_HEADER_CHALLENGE,
  CLOUDFLARE_403_BLOCKED,
  CLOUDFLARE_429_BLOCKED,
  CLOUDFLARE_503_BLOCKED,
  MANAGED_CHALLENGE_200,
  NORMAL_CATALOG_PAGE,
} from './fixtures/cloudflare-challenge.fixture.js'

/** Marcadores de corpo do RF04 (terceira assinatura): qualquer um basta. */
const BODY_CHALLENGE_MARKERS = [
  'challenges.cloudflare.com',
  'cf-chl-',
  '_cf_chl_opt',
  'Just a moment...',
] as const

function bodyHasChallengeMarker(body: string): boolean {
  return BODY_CHALLENGE_MARKERS.some((marker) => body.includes(marker))
}

describe('cloudflare challenge fixtures contract', () => {
  test('cf-mitigated: a assinatura vive só no header, com corpo limpo', () => {
    expect(CF_MITIGATED_HEADER_CHALLENGE.headers['cf-mitigated']).toBe('challenge')
    expect(bodyHasChallengeMarker(CF_MITIGATED_HEADER_CHALLENGE.body)).toBe(false)
  })

  test('403 com server: cloudflare traz a assinatura sem marcador no corpo', () => {
    expect(CLOUDFLARE_403_BLOCKED.status).toBe(403)
    expect(CLOUDFLARE_403_BLOCKED.headers['server']).toBe('cloudflare')
    expect(bodyHasChallengeMarker(CLOUDFLARE_403_BLOCKED.body)).toBe(false)
  })

  test('429 com server: cloudflare traz a assinatura sem marcador no corpo', () => {
    expect(CLOUDFLARE_429_BLOCKED.status).toBe(429)
    expect(CLOUDFLARE_429_BLOCKED.headers['server']).toBe('cloudflare')
    expect(bodyHasChallengeMarker(CLOUDFLARE_429_BLOCKED.body)).toBe(false)
  })

  test('503 com server: cloudflare traz a assinatura sem marcador no corpo', () => {
    expect(CLOUDFLARE_503_BLOCKED.status).toBe(503)
    expect(CLOUDFLARE_503_BLOCKED.headers['server']).toBe('cloudflare')
    expect(bodyHasChallengeMarker(CLOUDFLARE_503_BLOCKED.body)).toBe(false)
  })

  test('managed challenge vem 200 e carrega os quatro marcadores de corpo do RF04', () => {
    expect(MANAGED_CHALLENGE_200.status).toBe(200)
    expect(MANAGED_CHALLENGE_200.headers['server']).toBe('cloudflare')
    for (const marker of BODY_CHALLENGE_MARKERS) {
      expect(MANAGED_CHALLENGE_200.body).toContain(marker)
    }
  })

  test('acesso negado 1020 traz Access denied e Cloudflare no corpo', () => {
    expect(ACCESS_DENIED_1020.body).toContain('Access denied')
    expect(ACCESS_DENIED_1020.body).toContain('Cloudflare')
    expect(ACCESS_DENIED_1020.body).toContain('1020')
  })

  test('página normal é o controle negativo: status 200 sem nenhuma assinatura', () => {
    expect(NORMAL_CATALOG_PAGE.status).toBe(200)
    expect(NORMAL_CATALOG_PAGE.headers['server']).toBe('cloudflare')
    expect(NORMAL_CATALOG_PAGE.headers['cf-mitigated']).toBeUndefined()
    expect(bodyHasChallengeMarker(NORMAL_CATALOG_PAGE.body)).toBe(false)
  })
})
