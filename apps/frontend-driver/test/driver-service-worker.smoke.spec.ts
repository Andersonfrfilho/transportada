/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * CA05(a) e CA09 (spec 189 T4.1) — os dois únicos cenários que precisam do service worker de
 * verdade: `context.setOffline(true)` só recarrega a casca porque `sw.ts` precacheia `index.html` e
 * os assets (ADR-0075 §5), e a atualização adiada (T3.5) só existe quando o `registerSW` do
 * `workbox-window` está de pé. O resto do smoke roda com `VITE_SMOKE_AUTH_BYPASS=true` — que
 * desliga o SW de propósito (`main.tsx`) — então este arquivo roda **à parte**, no script
 * `smoke` antes do bypass entrar (`package.json`), com um `vite build` próprio e sem a variável.
 */
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { loginAsLocalUser } from './authenticated-smoke.helper'
import { mockDriverTripApi } from './driver-trip-smoke.helper'

const VIEWPORTS = { mobile: { height: 812, width: 375 } } as const
const SW_FILE_PATH = fileURLToPath(new URL('../dist/sw.js', import.meta.url))

async function grantLocation(page: Page): Promise<void> {
  await page.context().grantPermissions(['geolocation'])
  await page.context().setGeolocation({ latitude: -23.5505, longitude: -46.6333 })
}

/** `clientsClaim()` assume a página assim que ativa — sem esperar isto, a recarga offline mostra tela em branco. */
async function waitForServiceWorkerControl(page: Page): Promise<void> {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 20_000,
  })
}

test('CA05(a): recarregar sem rede de verdade mostra a viagem salva e drena quando a rede volta', async ({
  page,
  context,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  const api = await mockDriverTripApi({ page })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await waitForServiceWorkerControl(page)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByText(/Sem conexão — dados de \d/)).toBeVisible()
  await page.getByRole('button', { name: 'Entreguei' }).first().click()
  await expect(page.getByText('1 confirmação aguardando envio')).toBeVisible()
  expect(api.reports()).toEqual([])

  /**
   * ⚠️ Nada de `page.evaluate(() => window.dispatchEvent(...))` aqui: `setOffline(false)` já
   * dispara o `online` nativo do Chromium sozinho, e ele chega a tempo de derrubar o `evaluate` no
   * meio — "Execution context was destroyed" — porque o `online` real já iniciou a navegação da
   * reautenticação (`scheduleAuthenticationOnReconnect`, real, com Keycloak de verdade) antes do
   * `evaluate` terminar.
   */
  await context.setOffline(false)

  /** Spec 189 T9.2 ("Confirmar em lote"): o que foi feito sem sessão sobe com a confirmação do dono. */
  await expect(page.getByText(/1 registro feito sem rede às \d.* — enviar\?/u)).toBeVisible({
    timeout: 20_000,
  })
  expect(api.reports()).toEqual([])
  await page.getByRole('button', { exact: true, name: 'Enviar' }).click()

  await expect.poll(() => api.reports().length, { timeout: 20_000 }).toBe(1)
})

test('CA09: a atualização não recarrega com uma captura aberta, e aplica quando ela fecha', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS.mobile)
  await grantLocation(page)
  await mockDriverTripApi({ page })
  await loginAsLocalUser(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible()
  await waitForServiceWorkerControl(page)

  // Abre uma captura (plan D2, `captureRegistry.open('occurrence-dialog')`): o relato "Deu problema".
  await page.getByRole('button', { exact: true, name: 'Deu problema' }).first().click()
  await expect(page.getByRole('button', { exact: true, name: 'Registrar' })).toBeVisible()

  // Muda o SW por bytes, sem novo build: é o suficiente para o navegador achar uma versão nova.
  appendFileSync(SW_FILE_PATH, `\n// smoke-service-worker-update-${Date.now()}\n`)
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  })

  await expect(page.getByText('Nova versão disponível.')).toBeVisible({ timeout: 20_000 })

  // Captura ainda aberta: o toque em "Atualizar" não recarrega agora — só quando ela fechar.
  await page.getByRole('button', { name: 'Atualizar' }).click()
  await page.waitForTimeout(500)
  await expect(page.getByRole('button', { exact: true, name: 'Registrar' })).toBeVisible()

  const reloaded = page.waitForEvent('load', { timeout: 20_000 })
  // Fecha a captura (alterna "Deu problema" de novo): o registro esvazia e a atualização aplica.
  await page.getByRole('button', { exact: true, name: 'Deu problema' }).first().click()
  await reloaded

  await expect(page.getByRole('heading', { level: 1, name: 'Minha viagem' })).toBeVisible({
    timeout: 20_000,
  })
})
