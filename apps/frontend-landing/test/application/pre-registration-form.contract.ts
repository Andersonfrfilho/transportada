/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import { createAggregateApplicationClient } from '../../src/modules/application/shared/landingClient.service.js'
import { formatPostalCode } from '../../src/modules/application/shared/postalCode.service.js'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
/** Único arquivo que nomeia a rota — para documentar por que ela nunca é chamada, não para chamá-la. */
const DECLARATION_PATH = 'modules/application/shared/postalCode.service.ts'

describe('aggregate application client', () => {
  test('sends the tax id normalized, and 202 reads as accepted', async () => {
    let sentBody: unknown
    const originalFetch = globalThis.fetch
    globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
      sentBody = init?.body === undefined ? undefined : JSON.parse(init.body as string)
      return Promise.resolve(new Response(null, { status: 202 }))
    }) as unknown as typeof fetch

    try {
      const client = createAggregateApplicationClient({ apiBaseUrl: 'http://localhost:1' })
      const accepted = await client.submit({
        companyId: 'company-1',
        declaredData: {},
        email: 'candidato@example.com',
        name: 'Fulano de Tal',
        phone: '11988887777',
        taxId: '123.456.789-01',
      })

      expect(accepted).toBeTrue()
      expect((sentBody as { taxId: string }).taxId).toBe('12345678901')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  test('anything other than 202, or a network failure, reads as not accepted', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 400 }))) as unknown as typeof fetch

    try {
      const client = createAggregateApplicationClient({ apiBaseUrl: 'http://localhost:1' })
      const accepted = await client.submit({
        companyId: 'company-1',
        declaredData: {},
        email: 'candidato@example.com',
        name: 'Fulano de Tal',
        phone: '11988887777',
        taxId: '12345678901',
      })
      expect(accepted).toBeFalse()
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('postal code field', () => {
  test('masks as it types, without ever looking up an address', () => {
    expect(formatPostalCode('01000000')).toBe('01000-000')
    expect(formatPostalCode('01000')).toBe('01000')
    expect(formatPostalCode('010000009999')).toBe('01000-000')
  })

  /**
   * ADR-0040: abrir a busca de endereço a anônimo entregaria a varredura da base de CEP oito
   * dígitos por vez. A landing nunca pode chamar essa rota.
   */
  test('the app never calls the postal code lookup route', async () => {
    const glob = new Bun.Glob('**/*.{ts,tsx}')
    for await (const relativePath of glob.scan({
      cwd: fileURLToPath(new URL('src', APPLICATION_ROOT)),
    })) {
      if (relativePath === DECLARATION_PATH) continue
      const content = await Bun.file(
        fileURLToPath(new URL(`src/${relativePath}`, APPLICATION_ROOT)),
      ).text()
      expect(content).not.toContain('/postal-codes/')
    }
  })
})
