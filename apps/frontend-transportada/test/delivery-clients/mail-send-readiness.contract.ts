/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  isMailRoundTripConfigured,
  resolveMailSendReadinessShortcutTarget,
  resolveMailSendReadinessView,
  type MailSendReadinessReason,
} from '../../src/modules/delivery-clients/shared/mailSendReadiness.service'
import type { ContractorMailCheckItem } from '../../src/modules/delivery-clients/shared/contractorMailSettings.types'
import type { ContractorMailTemplate } from '../../src/modules/delivery-clients/shared/contractorMailTemplates.types'

const MAIL_TYPE = 'address_correction' as const

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

function buildTemplate(overrides: Partial<ContractorMailTemplate> = {}): ContractorMailTemplate {
  return {
    closing: 'Atenciosamente',
    id: 'template-1',
    intro: 'Olá',
    isDefault: true,
    itemText: 'Motivo: {motivo}.',
    mailType: MAIL_TYPE,
    name: 'Padrão',
    status: 'active',
    subject: 'Correção de endereço',
    updatedAt: '2026-09-15T10:00:00.000Z',
    version: '1',
    ...overrides,
  }
}

describe('resolveMailSendReadinessView (spec 150 T404, RF16/RF17)', () => {
  test('not_configured sem cadastro salvo', () => {
    const view = resolveMailSendReadinessView({
      checks: [],
      mailType: MAIL_TYPE,
      settings: null,
      templates: [],
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
      mailType: MAIL_TYPE,
      settings: SETTINGS_NOT_VERIFIED,
      templates: [buildTemplate()],
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
      mailType: MAIL_TYPE,
      settings: SETTINGS_NOT_VERIFIED,
      templates: [],
    })
    expect(view.ready).toBe(false)
    expect(view.ready === false && view.failingChecklistKeys).toEqual(['sender_domain'])
  })

  test('template_missing quando não há modelo algum', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      mailType: MAIL_TYPE,
      settings: SETTINGS_VERIFIED,
      templates: [],
    })
    expect(view).toEqual({ failingChecklistKeys: [], reason: 'template_missing', ready: false })
  })

  test('template_missing quando o único modelo está arquivado — não conta', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      mailType: MAIL_TYPE,
      settings: SETTINGS_VERIFIED,
      templates: [buildTemplate({ status: 'archived' })],
    })
    expect(view.ready).toBe(false)
    expect(view.ready === false && view.reason).toBe('template_missing')
  })

  test('template_missing quando o modelo padrão é de outro tipo — não conta', () => {
    // O catálogo de hoje só tem `address_correction` (T402); o cast simula um segundo tipo, que o
    // union real vai ganhar quando o RF13 se estender.
    const otherType = 'delivery_notice' as unknown as typeof MAIL_TYPE
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      mailType: MAIL_TYPE,
      settings: SETTINGS_VERIFIED,
      templates: [buildTemplate({ isDefault: true, mailType: otherType })],
    })
    expect(view.ready).toBe(false)
    expect(view.ready === false && view.reason).toBe('template_missing')
  })

  test('template_missing quando existe modelo ativo do tipo mas nenhum é padrão — não conta', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      mailType: MAIL_TYPE,
      settings: SETTINGS_VERIFIED,
      templates: [buildTemplate({ isDefault: false })],
    })
    expect(view.ready).toBe(false)
    expect(view.ready === false && view.reason).toBe('template_missing')
  })

  test('ready quando configurado, verificado e com modelo ativo padrão do tipo', () => {
    const view = resolveMailSendReadinessView({
      checks: CHECKS_ALL_OK,
      mailType: MAIL_TYPE,
      settings: SETTINGS_VERIFIED,
      templates: [
        buildTemplate({ id: 'archived', isDefault: false, status: 'archived' }),
        buildTemplate({ id: 'default-active' }),
      ],
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

  test('sem modelo leva à seção Modelos', () => {
    expect(resolveMailSendReadinessShortcutTarget('template_missing')).toBe('templates')
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
