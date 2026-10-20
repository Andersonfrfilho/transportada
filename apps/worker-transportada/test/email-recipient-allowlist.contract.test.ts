/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { EmailDriverPort } from '@adatechnology/notification-contracts'

import { parseWorkerEnvironment } from '../src/config/environment.schema.js'
import {
  EMAIL_RECIPIENT_NOT_ALLOWED_ERROR_CODE,
  isRecipientAllowed,
  withRecipientAllowlist,
} from '../src/notification/infrastructure/email-recipient-allowlist.js'

const baseEnvironment = {
  APP_ENV: 'staging',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  EMAIL_FROM: 'no-reply@exemplo.com.br',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_staging',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

function recordingDriver() {
  const sent: unknown[] = []
  const driver = {
    driver: 'fake',
    send: async (request: unknown) => {
      sent.push(request)
      return { outcome: 'sent' }
    },
  } as unknown as EmailDriverPort
  return { driver, sent }
}

describe('lista de destinatários permitidos', () => {
  test('endereço exato e domínio, sem diferenciar maiúsculas', () => {
    const allowedRecipients = ['dono@exemplo.com.br', '@teste.example']
    expect(isRecipientAllowed({ address: 'DONO@exemplo.com.br', allowedRecipients })).toBe(true)
    expect(isRecipientAllowed({ address: 'qualquer@teste.example', allowedRecipients })).toBe(true)
    expect(isRecipientAllowed({ address: 'outro@exemplo.com.br', allowedRecipients })).toBe(false)
    expect(isRecipientAllowed({ address: 'x@sub.teste.example.evil.com', allowedRecipients })).toBe(
      false,
    )
  })

  test('fora da lista não chega ao transporte; dentro da lista chega', async () => {
    const { driver, sent } = recordingDriver()
    const guarded = withRecipientAllowlist({ allowedRecipients: ['dono@exemplo.com.br'], driver })

    const refused = await guarded.send({ to: 'cliente@real.com.br' } as never)
    const delivered = await guarded.send({ to: 'dono@exemplo.com.br' } as never)

    expect(refused).toEqual({
      errorCode: EMAIL_RECIPIENT_NOT_ALLOWED_ERROR_CODE,
      outcome: 'permanent',
    })
    expect(delivered).toEqual({ outcome: 'sent' })
    expect(sent).toHaveLength(1)
  })
})

describe('variáveis EMAIL_RESEND_ENABLED e EMAIL_ALLOWED_RECIPIENTS', () => {
  const both = { RESEND_API_KEY: 're_chave_de_contrato', SMTP_URL: 'smtp://localhost:51025' }

  test('padrão: Resend ligado, sem filtro', () => {
    const delivery = parseWorkerEnvironment({ ...baseEnvironment, ...both }).emailDelivery
    expect(delivery?.transport.kind).toBe('resend')
    expect(delivery?.allowedRecipients).toBeUndefined()
  })

  test('EMAIL_RESEND_ENABLED=false volta ao SMTP sem apagar a chave', () => {
    const delivery = parseWorkerEnvironment({
      ...baseEnvironment,
      ...both,
      EMAIL_RESEND_ENABLED: 'false',
    }).emailDelivery
    expect(delivery?.transport).toEqual({ kind: 'smtp', smtpUrl: 'smtp://localhost:51025' })
  })

  test('EMAIL_RESEND_ENABLED=false sem SMTP_URL recusa subir', () => {
    expect(() =>
      parseWorkerEnvironment({
        ...baseEnvironment,
        EMAIL_RESEND_ENABLED: 'false',
        RESEND_API_KEY: 're_chave_de_contrato',
      }),
    ).toThrow()
  })

  test('a lista é normalizada e vazia equivale a ausente', () => {
    const filtered = parseWorkerEnvironment({
      ...baseEnvironment,
      ...both,
      EMAIL_ALLOWED_RECIPIENTS: ' Dono@Exemplo.com.br , @teste.example ,',
    }).emailDelivery
    expect(filtered?.allowedRecipients).toEqual(['dono@exemplo.com.br', '@teste.example'])
  })
})
