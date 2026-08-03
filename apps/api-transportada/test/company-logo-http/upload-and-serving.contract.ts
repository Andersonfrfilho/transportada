/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_LOGO_MAX_BYTES } from '../../src/database/company-logo.schema'
import { COMPANY_CONTEXT } from '../fixtures/company-settings-application.fixture'
import {
  COMPANY_LOGO_PATH,
  createCompanyLogoHttpFixture,
  FRONTEND_ORIGIN,
  GIF_BYTES,
  JPEG_BYTES,
  logoRequest,
  PNG_BYTES,
  sha256Of,
  UPDATED_AT,
  uploadRequest,
} from '../fixtures/company-logo.fixture'

describe(`PUT ${COMPANY_LOGO_PATH} HTTP contract`, () => {
  test('stores the uploaded png against the authenticated company and returns its metadata', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(uploadRequest({ bytes: PNG_BYTES }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      data: {
        byteSize: PNG_BYTES.byteLength,
        mimeType: 'image/png',
        sha256: sha256Of(PNG_BYTES),
        updatedAt: UPDATED_AT.toISOString(),
      },
    })
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(fixture.repository.saveCalls).toHaveLength(1)
    expect(fixture.repository.saveCalls[0]?.companyId).toBe(COMPANY_CONTEXT.companyId)
    expect(fixture.repository.saveCalls[0]?.contentBase64).toBe(PNG_BYTES.toString('base64'))
    expect(fixture.events).toEqual(['authenticate', 'tenant', 'authorize'])
  })

  test('classifies the image by its signature, not by the content type the client declared', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(
      uploadRequest({ bytes: JPEG_BYTES, fileName: 'marca.png', type: 'image/png' }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ data: { mimeType: 'image/jpeg' } })
  })

  test('rejects a format the pdf renderer cannot draw even when it claims to be a png', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(uploadRequest({ bytes: GIF_BYTES }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      error: { code: 'COMPANY_LOGO_UNSUPPORTED_FORMAT' },
    })
    expect(fixture.repository.saveCalls).toHaveLength(0)
  })

  test('rejects an image beyond the policy size before it reaches the repository', async () => {
    const fixture = await createCompanyLogoHttpFixture()
    const oversized = Buffer.concat([
      PNG_BYTES,
      Buffer.alloc(COMPANY_LOGO_MAX_BYTES + 1 - PNG_BYTES.byteLength),
    ])

    const response = await fixture.handle(uploadRequest({ bytes: oversized }))

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'COMPANY_LOGO_TOO_LARGE' } })
    expect(fixture.repository.saveCalls).toHaveLength(0)
  })

  test('rejects a body without the expected file part', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(uploadRequest({ bytes: PNG_BYTES, fieldName: 'imagem' }))

    expect(response.status).toBe(400)
    expect(fixture.repository.saveCalls).toHaveLength(0)
  })

  test('rejects a body that is not multipart at all', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(
      logoRequest({
        body: '{"file":"nao-e-multipart"}',
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.repository.saveCalls).toHaveLength(0)
  })
})

describe(`GET ${COMPANY_LOGO_PATH} HTTP contract`, () => {
  test('serves the stored bytes with the recorded media type and digest', async () => {
    const fixture = await createCompanyLogoHttpFixture({
      stored: {
        byteSize: PNG_BYTES.byteLength,
        bytes: PNG_BYTES,
        mimeType: 'image/png',
        sha256: sha256Of(PNG_BYTES),
        updatedAt: UPDATED_AT,
      },
    })

    const response = await fixture.handle(
      logoRequest({ headers: { origin: FRONTEND_ORIGIN }, method: 'GET' }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('etag')).toBe(`"${sha256Of(PNG_BYTES)}"`)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBe(FRONTEND_ORIGIN)
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG_BYTES)
    expect(fixture.repository.findCalls).toEqual([{ companyId: COMPANY_CONTEXT.companyId }])
  })

  test('answers 404 when the company never uploaded a logo', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(logoRequest({ method: 'GET' }))

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: { code: 'COMPANY_LOGO_NOT_FOUND' } })
  })
})

describe(`DELETE ${COMPANY_LOGO_PATH} HTTP contract`, () => {
  test('removes the stored logo and answers without a body', async () => {
    const fixture = await createCompanyLogoHttpFixture({
      stored: {
        byteSize: PNG_BYTES.byteLength,
        bytes: PNG_BYTES,
        mimeType: 'image/png',
        sha256: sha256Of(PNG_BYTES),
        updatedAt: UPDATED_AT,
      },
    })

    const response = await fixture.handle(logoRequest({ method: 'DELETE' }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(fixture.repository.removeCalls).toEqual([{ companyId: COMPANY_CONTEXT.companyId }])
    expect(fixture.repository.stored).toBeNull()
  })

  test('answers 404 when there is nothing to remove', async () => {
    const fixture = await createCompanyLogoHttpFixture()

    const response = await fixture.handle(logoRequest({ method: 'DELETE' }))

    expect(response.status).toBe(404)
  })
})

describe(`${COMPANY_LOGO_PATH} authorization contract`, () => {
  test('denies a member without settings.manage on every verb', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const fixture = await createCompanyLogoHttpFixture({
        permissions: new Set(['invoices.read']),
      })

      const response = await fixture.handle(
        method === 'PUT' ? uploadRequest({ bytes: PNG_BYTES }) : logoRequest({ method }),
      )

      expect(response.status).toBe(403)
      expect(fixture.repository.saveCalls).toHaveLength(0)
      expect(fixture.repository.findCalls).toHaveLength(0)
      expect(fixture.repository.removeCalls).toHaveLength(0)
    }
  })
})
