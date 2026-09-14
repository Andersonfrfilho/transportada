/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHmac } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import {
  SVIX_SIGNATURE_VERIFICATION_FAILURE,
  verifySvixSignature,
} from '../../src/contractor-mail/domain/svix-signature.policy.js'

const SECRET_KEY = Buffer.from('svix-signature-policy-test-key-000000', 'utf8')
const WEBHOOK_SIGNING_SECRET = `whsec_${SECRET_KEY.toString('base64')}`
const NOW = new Date('2026-09-13T12:00:00.000Z')
const RAW_BODY = JSON.stringify({ data: { email_id: 'evt_001' }, type: 'email.received' })
const SVIX_ID = 'msg_2sVvVwq6JhL8f4h3d9k1'
const SVIX_TIMESTAMP = String(Math.floor(NOW.getTime() / 1000))

function signValid(input: {
  readonly body?: string
  readonly id?: string
  readonly timestamp?: string
}) {
  const body = input.body ?? RAW_BODY
  const id = input.id ?? SVIX_ID
  const timestamp = input.timestamp ?? SVIX_TIMESTAMP
  const signature = createHmac('sha256', SECRET_KEY)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64')
  return `v1,${signature}`
}

describe('svix signature policy (spec 143, T010)', () => {
  test('accepts a signature computed the same way it is verified', () => {
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: SVIX_ID,
      svixSignature: signValid({}),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(result).toEqual({ verified: true })
  })

  test('rejects a signature computed with a different secret', () => {
    const otherSecret = `whsec_${Buffer.from('a-different-secret-key-0000000000', 'utf8').toString('base64')}`
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: SVIX_ID,
      svixSignature: signValid({}),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookSigningSecret: otherSecret,
    })
    expect(result).toEqual({
      reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.SIGNATURE_MISMATCH,
      verified: false,
    })
  })

  test('accepts when the header carries several signatures and one of them matches', () => {
    const wrongSignature = 'v1,bm90LXRoZS1yaWdodC1zaWduYXR1cmU='
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: SVIX_ID,
      svixSignature: `${wrongSignature} ${signValid({})}`,
      svixTimestamp: SVIX_TIMESTAMP,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(result).toEqual({ verified: true })
  })

  test('rejects a timestamp older than the five minute window', () => {
    const oldTimestamp = String(Math.floor(NOW.getTime() / 1000) - 5 * 60 - 1)
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: SVIX_ID,
      svixSignature: signValid({ timestamp: oldTimestamp }),
      svixTimestamp: oldTimestamp,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(result).toEqual({
      reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.TIMESTAMP_OUT_OF_WINDOW,
      verified: false,
    })
  })

  test('rejects a timestamp further in the future than the five minute window', () => {
    const futureTimestamp = String(Math.floor(NOW.getTime() / 1000) + 5 * 60 + 1)
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: SVIX_ID,
      svixSignature: signValid({ timestamp: futureTimestamp }),
      svixTimestamp: futureTimestamp,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(result).toEqual({
      reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.TIMESTAMP_OUT_OF_WINDOW,
      verified: false,
    })
  })

  test('rejects a secret without the whsec_ prefix', () => {
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: SVIX_ID,
      svixSignature: signValid({}),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookSigningSecret: SECRET_KEY.toString('base64'),
    })
    expect(result).toEqual({
      reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.MALFORMED_SECRET,
      verified: false,
    })
  })

  test('rejects when the body is tampered with after signing', () => {
    const result = verifySvixSignature({
      now: NOW,
      rawBody: `${RAW_BODY}tampered`,
      svixId: SVIX_ID,
      svixSignature: signValid({}),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(result).toEqual({
      reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.SIGNATURE_MISMATCH,
      verified: false,
    })
  })

  test('rejects when a required header is missing', () => {
    const result = verifySvixSignature({
      now: NOW,
      rawBody: RAW_BODY,
      svixId: '',
      svixSignature: signValid({}),
      svixTimestamp: SVIX_TIMESTAMP,
      webhookSigningSecret: WEBHOOK_SIGNING_SECRET,
    })
    expect(result).toEqual({
      reason: SVIX_SIGNATURE_VERIFICATION_FAILURE.MISSING_HEADERS,
      verified: false,
    })
  })
})
