/* Copyright (c) 2026 Ada Technology. MIT License. */
import { afterAll, describe, expect, it } from 'bun:test'
import { chromium, type Browser, type Page } from '@playwright/test'

import { buildContentSecurityPolicy } from '../../src/modules/shared/contentSecurityPolicy.service.js'

/**
 * Sonda T14: a suíte de `content-security-policy.contract.ts` só lê o texto da diretiva — nunca
 * viu um navegador de verdade. Foi assim que a foto congelada (`canvas.toDataURL`) passou verde e
 * quebrou em produção: `img-src` real não tem `data:`, e em dev a CSP nem é servida. Esta sonda
 * sobe um Chromium headless, aplica a MESMA diretiva que `contentSecurityPolicy.service.ts` emite
 * para o build, e mede o que o navegador de fato bloqueia — como as sondas T1/T9 já fizeram para
 * outros cabeçalhos (ver `server.ts` § `precompressedResponse`, comentário "sonda T9").
 */
const REAL_CONTENT_SECURITY_POLICY = buildContentSecurityPolicy({
  allowsInlineScript: false,
  apiBaseUrl: 'https://api.exemplo.com.br',
  keycloakUrl: 'https://identidade.exemplo.com.br/auth',
  mapTilesUrl: undefined,
})

const TRANSPARENT_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function pageWithRealPolicy(
  browser: Browser,
): Promise<Readonly<{ page: Page; violations: string[] }>> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const violations: string[] = []
  await page.exposeFunction('reportCspViolation', (directive: string) => {
    violations.push(directive)
  })
  await page.route('**/*', async (route) => {
    await route.fulfill({
      body: '<!doctype html><html><head></head><body></body></html>',
      contentType: 'text/html',
      headers: { 'content-security-policy': REAL_CONTENT_SECURITY_POLICY },
    })
  })
  await page.addInitScript(() => {
    const reporterWindow = window as unknown as Readonly<{
      reportCspViolation: (directive: string) => void
    }>
    document.addEventListener('securitypolicyviolation', (event) => {
      reporterWindow.reportCspViolation(event.violatedDirective)
    })
  })
  await page.goto('https://sonda.local/')
  return { page, violations }
}

describe('sonda headless: img-src real bloqueia data: e permite blob: (T14 item 1)', () => {
  let browser: Browser

  afterAll(async () => {
    await browser?.close()
  })

  it('a diretiva real de produção não contém data: em img-src', () => {
    expect(REAL_CONTENT_SECURITY_POLICY).toMatch(/img-src [^;]*'self'[^;]*blob:[^;]*/u)
    const imgSrcDirective = REAL_CONTENT_SECURITY_POLICY.split('; ').find((entry) =>
      entry.startsWith('img-src '),
    )
    expect(imgSrcDirective).toBeDefined()
    expect(imgSrcDirective).not.toContain('data:')
  })

  it('prova o defeito antigo: um <img src="data:..."> viola a CSP real (o que quebrava em produção)', async () => {
    browser = await chromium.launch()
    const { page, violations } = await pageWithRealPolicy(browser)

    await page.evaluate((base64) => {
      const image = document.createElement('img')
      image.src = `data:image/png;base64,${base64}`
      document.body.appendChild(image)
    }, TRANSPARENT_PNG_BASE64)
    await page.waitForTimeout(200)

    expect(violations).toContain('img-src')
    await page.close()
  })

  it('prova a correção: um <img src="blob:..."> carrega sob a mesma CSP real, sem violação', async () => {
    const { page, violations } = await pageWithRealPolicy(browser)

    const loaded = await page.evaluate(async (base64) => {
      const binary = atob(base64)
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
      const blob = new Blob([bytes], { type: 'image/png' })
      const objectUrl = URL.createObjectURL(blob)
      const image = document.createElement('img')
      const outcome = new Promise<boolean>((resolve) => {
        image.addEventListener('load', () => resolve(true))
        image.addEventListener('error', () => resolve(false))
      })
      image.src = objectUrl
      document.body.appendChild(image)
      const result = await outcome
      URL.revokeObjectURL(objectUrl)
      return result
    }, TRANSPARENT_PNG_BASE64)

    expect(loaded).toBe(true)
    expect(violations).not.toContain('img-src')
    await page.close()
  })
})
