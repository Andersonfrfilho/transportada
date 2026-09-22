/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 D10/T301: `freightAmount` e `totalAmount` somem da listagem e do detalhe de NF-e sem
 * `trip.financials`. Ausentes, não `null` — o resto do payload (chaves, cidades, bloqueios) segue
 * intacto, porque não é dinheiro.
 */
import { describe, expect, test } from 'bun:test'

import { DOCUMENT_DETAIL, DOCUMENT_SUMMARY } from '../fixtures/nfe-http-payload.fixture'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { documentDetailRequest, documentsListRequest } from '../fixtures/nfe-http-request.fixture'

const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['invoices.read'])
const FINANCIALS_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'invoices.read',
  'trip.financials',
])

describe('nfe http cuts money without trip.financials (spec 153 D10/T301)', () => {
  test('lists documents without freightAmount and totalAmount', async () => {
    const fixture = await createNfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(documentsListRequest({ query: '?limit=10' }))
    const body = (await response.json()) as { readonly data: readonly Record<string, unknown>[] }

    expect(response.status).toBe(200)
    const [document] = body.data
    expect(Object.hasOwn(document ?? {}, 'freightAmount')).toBe(false)
    expect(Object.hasOwn(document ?? {}, 'totalAmount')).toBe(false)
    expect(document?.emitterTaxId).toBe(DOCUMENT_SUMMARY.emitterTaxId)
  })

  test('lists documents with freightAmount and totalAmount when the caller has trip.financials', async () => {
    const fixture = await createNfeHttpFixture({ permissions: FINANCIALS_PERMISSIONS })

    const response = await fixture.handle(documentsListRequest({ query: '?limit=10' }))
    const body = (await response.json()) as { readonly data: readonly Record<string, unknown>[] }

    expect(response.status).toBe(200)
    const [document] = body.data
    expect(document?.freightAmount).toBe(DOCUMENT_SUMMARY.freightAmount)
    expect(document?.totalAmount).toBe(DOCUMENT_SUMMARY.totalAmount)
  })

  test('details a document without freightAmount and totalAmount', async () => {
    const fixture = await createNfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(documentDetailRequest())
    const body = (await response.json()) as { readonly data: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(Object.hasOwn(body.data, 'freightAmount')).toBe(false)
    expect(Object.hasOwn(body.data, 'totalAmount')).toBe(false)
    expect(body.data.accessKey).toBe(DOCUMENT_DETAIL.accessKey)
  })

  test('details a document with freightAmount and totalAmount when the caller has trip.financials', async () => {
    const fixture = await createNfeHttpFixture({ permissions: FINANCIALS_PERMISSIONS })

    const response = await fixture.handle(documentDetailRequest())
    const body = (await response.json()) as { readonly data: Record<string, unknown> }

    expect(response.status).toBe(200)
    expect(body.data.freightAmount).toBe(DOCUMENT_DETAIL.freightAmount)
    expect(body.data.totalAmount).toBe(DOCUMENT_DETAIL.totalAmount)
  })
})
