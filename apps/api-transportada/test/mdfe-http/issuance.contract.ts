/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  ATTEMPT_ID,
  CANCELLATION_BODY,
  CLOSURE_BODY,
  COMPANY_CONTEXT,
  CORRELATION_ID,
  IDEMPOTENCY_KEY,
  ISSUANCE_SUMMARY,
  MANIFEST_ID,
  MDFE_MANIFESTS_PATH,
  READ_ONLY_PERMISSIONS,
  createMdfeHttpFixture,
  jsonRequest,
  responseApiError,
  responseData,
} from '../fixtures/mdfe-http.fixture.js'

const ISSUE_PATH = `${MDFE_MANIFESTS_PATH}/${MANIFEST_ID}/issue`
const CLOSE_PATH = `${MDFE_MANIFESTS_PATH}/${MANIFEST_ID}/close`
const CANCEL_PATH = `${MDFE_MANIFESTS_PATH}/${MANIFEST_ID}/cancel`

const issueRequest = (overrides: { readonly idempotencyKey?: string } = {}) =>
  jsonRequest({
    body: {},
    idempotencyKey: IDEMPOTENCY_KEY,
    method: 'POST',
    path: ISSUE_PATH,
    ...overrides,
  })

describe('POST /mdfe-manifests/:id/issue', () => {
  test('answers 202 with the scheduled attempt and never calls SEFAZ in the request', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(issueRequest())

    expect(response.status).toBe(202)
    expect(await responseData(response)).toEqual({ ...ISSUANCE_SUMMARY })
    expect(fixture.issueCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        manifestId: MANIFEST_ID,
      },
    ])
  })

  test('refuses a request without an idempotency key', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'POST', path: ISSUE_PATH }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.issueCalls).toEqual([])
  })

  test('refuses a body that tries to choose company, number or environment', async () => {
    const fixture = await createMdfeHttpFixture()

    for (const body of [
      { companyId: COMPANY_CONTEXT.companyId },
      { fiscalNumber: 17 },
      { fiscalEnvironment: 'production' },
    ]) {
      const response = await fixture.handle(
        jsonRequest({ body, idempotencyKey: IDEMPOTENCY_KEY, method: 'POST', path: ISSUE_PATH }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    }
    expect(fixture.issueCalls).toEqual([])
  })

  test('answers 404 when the manifest identifier is not a canonical uuid', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {},
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: `${MDFE_MANIFESTS_PATH}/not-a-uuid/issue`,
      }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('NOT_FOUND')
  })

  test('answers 403 when the membership cannot transmit a manifest', async () => {
    const fixture = await createMdfeHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(issueRequest())

    expect(response.status).toBe(403)
    expect(fixture.issueCalls).toEqual([])
  })

  test('propagates the refusal of a manifest already in flight', async () => {
    const fixture = await createMdfeHttpFixture({
      issueError: new ApiError({
        code: 'MDFE_MANIFEST_IN_FLIGHT',
        message: 'The manifest already has a request in flight.',
        status: 409,
      }),
    })

    const response = await fixture.handle(issueRequest())

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('MDFE_MANIFEST_IN_FLIGHT')
  })
})

describe('POST /mdfe-manifests/:id/close', () => {
  test('answers 202 forwarding the closure city and state', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: CLOSURE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CLOSE_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(await responseData(response)).toEqual({
      ...ISSUANCE_SUMMARY,
      attemptId: ATTEMPT_ID,
      attemptKind: 'close',
    })
    expect(fixture.closeCalls).toEqual([
      {
        closureCityCode: CLOSURE_BODY.closureCityCode,
        closureState: CLOSURE_BODY.closureState,
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        manifestId: MANIFEST_ID,
      },
    ])
  })

  test('refuses a closure city or state outside the SEFAZ format', async () => {
    const fixture = await createMdfeHttpFixture()

    for (const body of [
      { closureCityCode: '355030', closureState: 'SP' },
      { closureCityCode: '3550308', closureState: 'sp' },
      { closureCityCode: '3550308' },
      { ...CLOSURE_BODY, closureProtocol: '135260000000001' },
    ]) {
      const response = await fixture.handle(
        jsonRequest({ body, idempotencyKey: IDEMPOTENCY_KEY, method: 'POST', path: CLOSE_PATH }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    }
    expect(fixture.closeCalls).toEqual([])
  })

  test('answers 403 when the membership cannot close a manifest', async () => {
    const fixture = await createMdfeHttpFixture({
      permissions: new Set(['mdfe.read', 'mdfe.issue']),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: CLOSURE_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CLOSE_PATH,
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.closeCalls).toEqual([])
  })
})

describe('POST /mdfe-manifests/:id/cancel', () => {
  test('answers 202 forwarding the justification', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: CANCELLATION_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CANCEL_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(await responseData(response)).toEqual({
      ...ISSUANCE_SUMMARY,
      attemptId: ATTEMPT_ID,
      attemptKind: 'cancel',
    })
    expect(fixture.cancelCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        justification: CANCELLATION_BODY.justification,
        manifestId: MANIFEST_ID,
      },
    ])
  })

  test('refuses a justification shorter than the SEFAZ minimum', async () => {
    const fixture = await createMdfeHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { justification: 'erro' },
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CANCEL_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.cancelCalls).toEqual([])
  })

  test('answers 403 when the membership cannot cancel a manifest', async () => {
    const fixture = await createMdfeHttpFixture({
      permissions: new Set(['mdfe.read', 'mdfe.issue', 'mdfe.close']),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: CANCELLATION_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CANCEL_PATH,
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.cancelCalls).toEqual([])
  })

  test('propagates the expired cancellation window as 422', async () => {
    const fixture = await createMdfeHttpFixture({
      cancelError: new ApiError({
        code: 'MDFE_MANIFEST_CANCELLATION_WINDOW_EXPIRED',
        message: 'The cancellation window of the manifest expired.',
        status: 422,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: CANCELLATION_BODY,
        idempotencyKey: IDEMPOTENCY_KEY,
        method: 'POST',
        path: CANCEL_PATH,
      }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe(
      'MDFE_MANIFEST_CANCELLATION_WINDOW_EXPIRED',
    )
  })
})
