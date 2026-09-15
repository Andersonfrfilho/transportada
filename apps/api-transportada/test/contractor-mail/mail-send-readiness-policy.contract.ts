/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveMailSendReadiness } from '../../src/contractor-mail/domain/mail-send-readiness.policy.js'

const VERIFIED_SETTINGS = { sendingVerifiedAt: new Date('2026-09-15T12:00:00.000Z') }
const UNVERIFIED_SETTINGS = { sendingVerifiedAt: undefined }
const TEMPLATE = { id: '00000000-0000-4000-8000-0000000000f1' }

describe('mail send readiness policy (spec 150 T401, RF16/RF17)', () => {
  test('without configuration the reason is not_configured', () => {
    expect(resolveMailSendReadiness({ settings: undefined })).toEqual({
      ready: false,
      reason: 'not_configured',
    })
  })

  test('configuration without a verified sender is sending_not_verified', () => {
    expect(resolveMailSendReadiness({ settings: UNVERIFIED_SETTINGS })).toEqual({
      ready: false,
      reason: 'sending_not_verified',
    })
    expect(resolveMailSendReadiness({ settings: { sendingVerifiedAt: null } })).toEqual({
      ready: false,
      reason: 'sending_not_verified',
    })
  })

  test('a verified sender is ready, and hands the settings back', () => {
    expect(resolveMailSendReadiness({ settings: VERIFIED_SETTINGS })).toEqual({
      ready: true,
      settings: VERIFIED_SETTINGS,
    })
  })

  test('a template looked up and not found is template_missing', () => {
    expect(resolveMailSendReadiness({ settings: VERIFIED_SETTINGS, template: null })).toEqual({
      ready: false,
      reason: 'template_missing',
    })
  })

  test('a verified sender with a template is ready', () => {
    expect(resolveMailSendReadiness({ settings: VERIFIED_SETTINGS, template: TEMPLATE })).toEqual({
      ready: true,
      settings: VERIFIED_SETTINGS,
    })
  })

  test('the configuration reasons win over the template reason', () => {
    expect(resolveMailSendReadiness({ settings: undefined, template: null })).toEqual({
      ready: false,
      reason: 'not_configured',
    })
    expect(resolveMailSendReadiness({ settings: UNVERIFIED_SETTINGS, template: null })).toEqual({
      ready: false,
      reason: 'sending_not_verified',
    })
  })
})
