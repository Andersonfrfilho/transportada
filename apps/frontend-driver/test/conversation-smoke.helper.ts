/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Encanamento do smoke do chat do motorista (spec 263 T1b.5): sobe a API de demonstração própria
 * (`scripts/driver-preview-api.ts`) numa porta sintética e desvia para ela as chamadas `/me/**` do
 * build. Nunca reaproveita a 53901/53200 — são as que o usuário está olhando.
 */
import { spawn, type ChildProcess } from 'node:child_process'

import type { Page, Route } from '@playwright/test'

export const DEMO_PORT = Number(process.env.PLAYWRIGHT_DRIVER_DEMO_PORT ?? '53912')
export const DEMO_ORIGIN = `http://localhost:${DEMO_PORT}`
const SMOKE_ORIGIN = 'http://localhost:53112'
const ME_PATH = /^(?:\/v1)?\/me\//u
const DEMO_BOOT_TIMEOUT_MS = 20_000
const DEMO_POLL_INTERVAL_MS = 200

export type DemoMessage = Readonly<{
  bodyText: string
  direction: 'inbound' | 'outbound'
  id: string
}>

export async function startDemoApi(): Promise<ChildProcess> {
  const child = spawn('bun', ['run', 'scripts/driver-preview-api.ts'], {
    env: {
      ...process.env,
      DRIVER_PREVIEW_API_PORT: String(DEMO_PORT),
      DRIVER_PREVIEW_ORIGIN: SMOKE_ORIGIN,
    },
    stdio: 'ignore',
  })
  const deadline = Date.now() + DEMO_BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const isUp = await resetDemo().then(
      () => true,
      () => false,
    )
    if (isUp) return child
    await new Promise((resolve) => setTimeout(resolve, DEMO_POLL_INTERVAL_MS))
  }
  child.kill()
  throw new Error(`DEMO_API_NOT_READY_ON_${DEMO_PORT}`)
}

export async function postDebug(path: string, body: unknown = {}): Promise<void> {
  const response = await fetch(`${DEMO_ORIGIN}/__debug/conversations/${path}`, {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) throw new Error(`DEBUG_${path}_${response.status}`)
}

export async function resetDemo(): Promise<void> {
  await postDebug('reset')
}

/** As mensagens que o servidor de demonstração guarda para o assunto (rota por ocorrência). */
export async function readServerMessages(occurrenceId: string): Promise<readonly DemoMessage[]> {
  const response = await fetch(
    `${DEMO_ORIGIN}/me/trips/current/conversations/occurrence/${occurrenceId}/messages`,
  )
  const body = (await response.json()) as { data: DemoMessage[] }
  return body.data
}

/** O que o motorista mandou (`inbound`) e que não é semente: a resposta automática do escritório é `outbound`. */
export async function readDriverTexts(occurrenceId: string, text: string): Promise<number> {
  const messages = await readServerMessages(occurrenceId)
  return messages.filter((message) => message.direction === 'inbound' && message.bodyText === text)
    .length
}

/** Desvia `/me/**` do build (que aponta para `VITE_API_URL`) para a demonstração própria. */
export async function routeApiToDemo(page: Page): Promise<void> {
  await page.route(
    (url) => ME_PATH.test(url.pathname) && url.origin !== DEMO_ORIGIN,
    async (route: Route) => {
      const source = new URL(route.request().url())
      const response = await route.fetch({
        url: `${DEMO_ORIGIN}${source.pathname}${source.search}`,
      })
      await route.fulfill({ response })
    },
  )
}

export type Box = Readonly<{ bottom: number; height: number; top: number }>

export async function measure(page: Page, selector: string, index = 0): Promise<Box> {
  return page
    .locator(selector)
    .nth(index)
    .evaluate((element) => {
      const { bottom, height, top } = element.getBoundingClientRect()
      return { bottom, height, top }
    })
}
