/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  NOTIFICATION_SMOKE_ROUTE_PATTERN,
  registerNotificationMocks,
} from '../notification-smoke.helper.js'

const CLIENT_BUNDLE_PATH = fileURLToPath(
  new URL('../../node_modules/@adatechnology/notification-client/dist/index.js', import.meta.url),
)
const AUTHENTICATED_HELPER_PATH = fileURLToPath(
  new URL('../authenticated-smoke.helper.ts', import.meta.url),
)
const SMOKE_BASE_URL = 'http://localhost:53001/v1'
const SAMPLE_IDENTIFIER = '00000000-0000-4000-8000-000000000900'

/**
 * As rotas são relidas do pacote instalado, não copiadas para cá: o sino chama a API sozinho, e uma
 * versão nova do cliente que estreie um caminho tem de reprovar aqui, alto, em vez de derrubar os
 * trinta e dois cenários do smoke com um `net::ERR_FAILED` opaco.
 */
function collectClientPaths(): readonly string[] {
  const bundle = readFileSync(CLIENT_BUNDLE_PATH, 'utf8')
  const literalPaths = [...bundle.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1])
  const templatePaths = [...bundle.matchAll(/path:\s*`([^`]+)`/g)].map((match) => match[1])
  const streamPaths = [...bundle.matchAll(/url:\s*`\$\{baseUrl\}([^`]+)`/g)].map(
    (match) => match[1],
  )

  return [...new Set([...literalPaths, ...templatePaths, ...streamPaths])]
    .filter((path): path is string => path !== undefined && path.startsWith('/notifications'))
    .map((path) => path.replaceAll(/\$\{[^}]+\}/g, SAMPLE_IDENTIFIER))
    .sort()
}

describe('notification smoke mock coverage contract', () => {
  test('cobre todo caminho que o cliente do sino sabe chamar', () => {
    const paths = collectClientPaths()
    expect(paths.length).toBeGreaterThan(0)

    const uncovered = paths.filter(
      (path) => !NOTIFICATION_SMOKE_ROUTE_PATTERN.test(`${SMOKE_BASE_URL}${path}`),
    )
    expect(uncovered).toEqual([])
  })

  test('reconhece a contagem de não lidas, que é o que o sino pede em toda página', () => {
    expect(
      NOTIFICATION_SMOKE_ROUTE_PATTERN.test(`${SMOKE_BASE_URL}/notifications/unread-count`),
    ).toBe(true)
  })

  test('não sequestra rota de outro módulo', () => {
    const foreign = [
      `${SMOKE_BASE_URL}/nfe-documents`,
      `${SMOKE_BASE_URL}/notification-preferences`,
      `${SMOKE_BASE_URL}/auth/me`,
    ]

    expect(foreign.filter((url) => NOTIFICATION_SMOKE_ROUTE_PATTERN.test(url))).toEqual([])
  })

  test('o helper autenticado registra o mock antes de navegar', () => {
    const source = readFileSync(AUTHENTICATED_HELPER_PATH, 'utf8')

    expect(typeof registerNotificationMocks).toBe('function')
    expect(source).toContain('registerNotificationMocks')
    expect(source.indexOf('registerNotificationMocks')).toBeLessThan(source.indexOf('page.goto'))
  })
})
