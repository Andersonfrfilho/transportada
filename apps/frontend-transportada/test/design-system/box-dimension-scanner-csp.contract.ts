/* Copyright (c) 2026 Ada Technology. MIT License. */
import { existsSync } from 'node:fs'

import { beforeAll, afterAll, describe, expect, it } from 'bun:test'
import { chromium, type Browser, type Page } from '@playwright/test'

import { buildContentSecurityPolicy } from '../../src/modules/shared/contentSecurityPolicy.service.js'

/**
 * ⚠️ **Navegador é dependência do job, e em CI a falta dele é falha — não "pulado".** A sonda pulava
 * em 100% das execuções de CI: `playwright install` só existia no job `integration`, que não roda a
 * bateria unitária, e o `skipIf` engolia as duas metades em silêncio ("pular não é passar", spec
 * 092). Agora o `quality-app` instala o Chromium para o frontend (passo abaixo, conferido pelo
 * contrato do pipeline) e a dispensa vale **só fora de CI** — na máquina do desenvolvedor que ainda
 * não baixou os navegadores. Se o passo do job sumir ou quebrar, a sonda reprova o gate em vez de
 * sumir dele.
 */
function hasChromiumExecutable(): boolean {
  try {
    return existsSync(chromium.executablePath())
  } catch {
    return false
  }
}

const CHROMIUM_IS_AVAILABLE = hasChromiumExecutable()
const RUNS_IN_CONTINUOUS_INTEGRATION = process.env.CI !== undefined && process.env.CI !== ''
const CHROMIUM_IS_DISPENSABLE = !CHROMIUM_IS_AVAILABLE && !RUNS_IN_CONTINUOUS_INTEGRATION

if (CHROMIUM_IS_DISPENSABLE) {
  console.warn(
    'sonda de CSP pulada: Chromium do Playwright ausente. Rode `bunx playwright install chromium` para exercitá-la.',
  )
}

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

  /** O 2º caso dependia do `launch` do 1º: rodar só ele (`-t`) subia sem navegador nenhum. */
  beforeAll(async () => {
    if (CHROMIUM_IS_DISPENSABLE) return
    browser = await chromium.launch()
  })

  afterAll(async () => {
    await browser?.close()
  })

  /**
   * O job que roda esta bateria tem de instalar o navegador — sem isso a sonda pula sempre e o
   * gate fica verde sem nunca ter medido nada (3ª revisão, item M2).
   */
  it('o gate que roda esta bateria instala o Chromium do Playwright', async () => {
    const workflow = await Bun.file(
      new URL('../../../../.github/workflows/ci.yml', import.meta.url),
    ).text()
    const qualityApp = workflow.split('  quality-app:')[1]?.split('\n  quality:')[0] ?? ''

    expect(qualityApp).toContain("if: matrix.app == 'frontend-transportada'")
    expect(qualityApp).toContain('playwright install --with-deps chromium')
  })

  it('a diretiva real de produção não contém data: em img-src', () => {
    expect(REAL_CONTENT_SECURITY_POLICY).toMatch(/img-src [^;]*'self'[^;]*blob:[^;]*/u)
    const imgSrcDirective = REAL_CONTENT_SECURITY_POLICY.split('; ').find((entry) =>
      entry.startsWith('img-src '),
    )
    expect(imgSrcDirective).toBeDefined()
    expect(imgSrcDirective).not.toContain('data:')
  })

  it.skipIf(CHROMIUM_IS_DISPENSABLE)(
    'prova o defeito antigo: um <img src="data:..."> viola a CSP real (o que quebrava em produção)',
    async () => {
      const { page, violations } = await pageWithRealPolicy(browser)

      await page.evaluate((base64) => {
        const image = document.createElement('img')
        image.src = `data:image/png;base64,${base64}`
        document.body.appendChild(image)
      }, TRANSPARENT_PNG_BASE64)
      await page.waitForTimeout(200)

      expect(violations).toContain('img-src')
      await page.close()
    },
  )

  it.skipIf(CHROMIUM_IS_DISPENSABLE)(
    'prova a correção: um <img src="blob:..."> carrega sob a mesma CSP real, sem violação',
    async () => {
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
    },
  )
})
