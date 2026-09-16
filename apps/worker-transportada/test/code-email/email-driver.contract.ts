/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readDeliveryFailure } from '../../src/identity/application/delivery-failure.service.js'
import { InvitationDeliveryFailedError } from '../../src/identity/infrastructure/invitation-channel.gateway.js'
import { createWorkerEmailDriver } from '../../src/notification/infrastructure/email-driver.factory.js'

describe('o transporte de e-mail do worker', () => {
  test('a chave do Resend monta o driver HTTPS, não o SMTP', () => {
    const driver = createWorkerEmailDriver({
      from: 'no-reply@exemplo.com.br',
      transport: { apiKey: 're_chave_de_contrato', kind: 'resend' },
    })

    expect(driver.driver).toBe('resend')
  })

  test('sem chave, o SMTP local', () => {
    const driver = createWorkerEmailDriver({
      from: 'no-reply@localhost',
      transport: { kind: 'smtp', smtpUrl: 'smtp://localhost:51025' },
    })

    expect(driver.driver).toBe('smtp')
  })
})

/** A falha em produção saía só com o canal: porta bloqueada e chave inválida eram a mesma linha. */
describe('a falha de entrega diz o motivo sem dado pessoal', () => {
  test('leva código e desfecho do provedor', () => {
    expect(
      readDeliveryFailure(new InvitationDeliveryFailedError('permanent', 'validation_error')),
    ).toEqual({ errorCode: 'validation_error', outcome: 'permanent' })
  })

  test('erro sem código não inventa campo, e a mensagem nunca entra', () => {
    const failure = readDeliveryFailure(new Error('falhou para pessoa@exemplo.com.br'))

    expect(failure).toEqual({})
    expect(JSON.stringify(failure)).not.toContain('@')
  })
})
