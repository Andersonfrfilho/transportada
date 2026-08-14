/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { WorkerCryptographicConfigurationError } from '../../src/config/cryptographic-configuration.error.js'
import { parseWorkerCryptographicConfiguration } from '../../src/config/cryptographic-configuration.schema.js'

const ENVELOPE_KEY = Buffer.alloc(32, 1).toString('base64')
const SUPPRESSION_KEY = Buffer.alloc(32, 2).toString('base64')

const ENVIRONMENT = {
  ENCRYPTION_ACTIVE_KEY_ID: 'test-key',
  ENCRYPTION_KEYRING_JSON: JSON.stringify({ 'test-key': ENVELOPE_KEY }),
  NOTIFICATION_SUPPRESSION_HMAC_KEY: SUPPRESSION_KEY,
} as const

/**
 * Quem consulta a supressão na hora de entregar é o worker. Uma chave diferente da que a API usou
 * para gravar produz HMAC que não casa com nada — e o e-mail volta a sair para quem já recusou.
 * Por isso é obrigatória aqui também, e falha no boot em vez de na primeira entrega.
 */
describe('contrato da chave de supressão no worker', () => {
  test('a chave declarada chega à configuração', () => {
    expect(
      parseWorkerCryptographicConfiguration(ENVIRONMENT).notificationSuppressionHmacKey,
    ).toBe(SUPPRESSION_KEY)
  })

  test.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['curta', Buffer.alloc(31, 7).toString('base64')],
    ['sem padding canônico', Buffer.alloc(32, 7).toString('base64').replace(/=$/, '')],
  ])('falha no boot com a chave %s', (_name, value) => {
    expect(() =>
      parseWorkerCryptographicConfiguration({
        ...ENVIRONMENT,
        NOTIFICATION_SUPPRESSION_HMAC_KEY: value,
      }),
    ).toThrow(WorkerCryptographicConfigurationError)
  })

  // Mesma regra da API: material reusado entre propósitos faz uma chave queimada arrastar a outra
  // função junto.
  test('recusa reuso da chave do envelope', () => {
    expect(() =>
      parseWorkerCryptographicConfiguration({
        ...ENVIRONMENT,
        NOTIFICATION_SUPPRESSION_HMAC_KEY: ENVELOPE_KEY,
      }),
    ).toThrow(WorkerCryptographicConfigurationError)
  })
})
