/* Cópia por valor de apps/frontend-transportada/test/installation-brand-smoke.helper.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-origin': '*',
}

/** O mesmo corte que o cliente usa: a leitura da marca e o logo, ambos públicos. */
export const INSTALLATION_BRAND_SMOKE_ROUTE_PATTERN =
  /\/public\/landing-(?:settings|logo)(?:\?.*)?$/
export const INSTALLATION_BRAND_SMOKE_NAME = 'Transportadora do Smoke'

/**
 * O cabeçalho da app lê a marca da instalação sem passar por nenhum helper de viagem. Sem este mock
 * a leitura volta `net::ERR_FAILED`.
 */
export async function registerInstallationBrandMock(page: Page): Promise<void> {
  await page.route(INSTALLATION_BRAND_SMOKE_ROUTE_PATTERN, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }

    if (new URL(route.request().url()).pathname.endsWith('/landing-logo')) {
      /** Instalação sem logotipo: o ícone do produto assume, como em produção recém-provisionada. */
      await route.fulfill({ headers: CORS_HEADERS, status: 404 })
      return
    }

    await route.fulfill({
      body: JSON.stringify({
        data: { brandName: '', units: [{ tradeName: INSTALLATION_BRAND_SMOKE_NAME }] },
      }),
      contentType: 'application/json',
      headers: CORS_HEADERS,
      status: 200,
    })
  })
}
