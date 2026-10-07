/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Page, Route } from '@playwright/test'

const DAY_MS = 86_400_000
const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type',
  'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
  'access-control-allow-origin': '*',
}

export const MANAGER_PERMISSIONS = ['trip.read', 'trip.manage', 'settings.manage', 'fleet.read']
export const READER_PERMISSIONS = ['trip.read', 'fleet.read']

export type MockSettings = {
  origin: 'company' | 'default'
  purgeEffectiveAt: string | null
  purgeEnabled: boolean
  retentionDays: number
  updatedAt: string | null
}

export const DEFAULT_SETTINGS: MockSettings = {
  origin: 'default',
  purgeEffectiveAt: null,
  purgeEnabled: false,
  retentionDays: 90,
  updatedAt: null,
}

/** Ligado há mais de 24 horas: a carência passou e o apagamento já corre. */
export const ACTIVE_SETTINGS: MockSettings = {
  origin: 'company',
  purgeEffectiveAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
  purgeEnabled: true,
  retentionDays: 60,
  updatedAt: new Date(Date.now() - 4 * DAY_MS).toISOString(),
}

const IMPACT = {
  byTable: [
    { capped: false, count: 1280, kind: 'stop_event' },
    { capped: false, count: 214, kind: 'delivery_proof' },
    { capped: false, count: 96, kind: 'status_event' },
    { capped: false, count: 31, kind: 'stop_occurrence' },
    { capped: false, count: 12, kind: 'document_occurrence' },
  ],
}

export function createGate(): Readonly<{ promise: Promise<void>; release: () => void }> {
  let release: () => void = () => undefined
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

export type RetentionMockOptions = Readonly<{
  /** Segura a contagem do que seria apagado: o diálogo fica em "Contando". */
  holdImpact?: Promise<void>
  /** Segura a leitura até a chamada: o painel fica no esqueleto. */
  holdRead?: Promise<void>
  /** Segura a gravação até a chamada: o painel fica em "Gravando". */
  holdWrite?: Promise<void>
  initial: MockSettings
  isReadFailing?: boolean
  isWriteFailing?: boolean
}>

async function fulfill(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: CORS_HEADERS,
    status,
  })
}

/** Dublê da retenção: o `PUT` grava na variável, para o painel reler o que o servidor guardou. */
export async function mockLocationRetentionApi(
  page: Page,
  options: RetentionMockOptions,
): Promise<Readonly<{ requests: () => readonly string[] }>> {
  let settings = options.initial
  const requests: string[] = []
  await page.route(
    /\/company-settings\/location-retention(?:\/impact)?(?:\?.*)?$/u,
    async (route) => {
      const request = route.request()
      const { pathname, search } = new URL(request.url())
      requests.push(`${request.method()} ${pathname.split('/').slice(-1)[0] ?? ''}${search}`)
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ headers: CORS_HEADERS, status: 204 })
        return
      }
      if (pathname.endsWith('/impact')) {
        await options.holdImpact
        await fulfill(route, { data: IMPACT })
        return
      }
      if (request.method() === 'GET') {
        await options.holdRead
        if (options.isReadFailing === true) {
          await fulfill(route, { error: { code: 'INTERNAL', message: 'x' } }, 500)
          return
        }
        await fulfill(route, { data: settings })
        return
      }
      await options.holdWrite
      if (options.isWriteFailing === true) {
        await fulfill(route, { error: { code: 'INTERNAL', message: 'x' } }, 500)
        return
      }
      if (request.method() === 'DELETE') {
        settings = DEFAULT_SETTINGS
        await route.fulfill({ headers: CORS_HEADERS, status: 204 })
        return
      }
      const body = request.postDataJSON() as { purgeEnabled: boolean; retentionDays: number }
      settings = {
        ...settings,
        ...body,
        origin: 'company',
        purgeEffectiveAt: new Date(Date.now() + DAY_MS).toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await fulfill(route, { data: settings })
    },
  )
  return { requests: () => requests }
}
