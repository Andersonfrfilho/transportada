/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isMailRoundTripConfigured,
  resolveMailSendReadinessShortcutTarget,
  resolveMailSendReadinessView,
  type MailSendReadinessReason,
} from '../../src/modules/delivery-clients/shared/mailSendReadiness.service'
import type { ContractorMailCheckItem } from '../../src/modules/delivery-clients/shared/contractorMailSettings.types'

const CHECKS_ALL_OK: readonly ContractorMailCheckItem[] = [
  { key: 'api_key', reason: 'ok', status: 'ok' },
  { key: 'sender_domain', reason: 'ok', status: 'ok' },
]

const SETTINGS_VERIFIED = {
  apiKeyConfigured: true,
  id: 'settings-1',
  lastWebhookAt: null,
  replyDomain: 'resposta.example.com.br',
  senderAddress: 'contato@example.com.br',
  senderName: 'Transportadora',
  sendingVerifiedAt: '2026-09-15T10:00:00.000Z',
  status: 'pending' as const,
  version: '1',
  webhookId: 'webhook-1',
  webhookSecretConfigured: true,
}

const SETTINGS_NOT_VERIFIED = { ...SETTINGS_VERIFIED, sendingVerifiedAt: null }

describe('resolveMailSendReadinessView (spec 150 T404, RF16/RF17; modelo no módulo na spec 286)', () => {
  test('not_configured sem cadastro salvo', () => {
    const view = resolveMailSendReadinessView({
      checks: [],
      settings: null,
      templateUsable: true,
    })
    expect(view).toEqual({
      failingChecklistKeys: ['api_key', 'sender_domain'],
      reason: 'not_configured',
      ready: false,
    })
  })

  test('sending_not_verified sem a verificação de envio', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      settings: SETTINGS_NOT_VERIFIED,
      templateUsable: true,
    })
    expect(view.ready).toBe(false)
    expect(view.ready === false && view.reason).toBe('sending_not_verified')
  })

  test('sending_not_verified aponta a lista de verificação que ainda falha', () => {
    const view = resolveMailSendReadinessView({
      checks: [
        { key: 'api_key', reason: 'ok', status: 'ok' },
        { key: 'sender_domain', reason: 'sender_domain_not_verified', status: 'pending' },
      ],
      settings: SETTINGS_NOT_VERIFIED,
      templateUsable: true,
    })
    expect(view.ready).toBe(false)
    expect(view.ready === false && view.failingChecklistKeys).toEqual(['sender_domain'])
  })

  test('template_missing quando o módulo de notificação não tem modelo utilizável', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      settings: SETTINGS_VERIFIED,
      templateUsable: false,
    })
    expect(view).toEqual({ failingChecklistKeys: [], reason: 'template_missing', ready: false })
  })

  test('ready quando configurado, verificado e com modelo utilizável', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      settings: SETTINGS_VERIFIED,
      templateUsable: true,
    })
    expect(view).toEqual({ ready: true })
  })
})

describe('resolveMailSendReadinessShortcutTarget (T404)', () => {
  test('configuração e verificação levam à lista de verificação', () => {
    const reasons: readonly MailSendReadinessReason[] = ['not_configured', 'sending_not_verified']
    for (const reason of reasons) {
      expect(resolveMailSendReadinessShortcutTarget(reason)).toBe('checklist')
    }
  })

  test('sem modelo leva a Notificações', () => {
    expect(resolveMailSendReadinessShortcutTarget('template_missing')).toBe('notifications')
  })
})

describe('isMailRoundTripConfigured (informativo, nunca bloqueia)', () => {
  test('null (nunca salvo) não está configurado', () => {
    expect(isMailRoundTripConfigured(null)).toBe(false)
  })

  test('status pending ou failed não está configurado', () => {
    expect(isMailRoundTripConfigured({ ...SETTINGS_VERIFIED, status: 'pending' })).toBe(false)
    expect(isMailRoundTripConfigured({ ...SETTINGS_VERIFIED, status: 'failed' })).toBe(false)
  })

  test('status active está configurado', () => {
    expect(isMailRoundTripConfigured({ ...SETTINGS_VERIFIED, status: 'active' })).toBe(true)
  })
})
