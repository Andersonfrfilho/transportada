/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CryptographicConfigurationError } from '../../src/config/cryptographic-configuration.error'
import { parseEnvironment } from '../../src/config/environment.schema'
import {
  ACTIVE_ENCRYPTION_KEY,
  API_ENVIRONMENT,
  IDEMPOTENCY_HMAC_KEY,
  NOTIFICATION_SUPPRESSION_HMAC_KEY,
} from '../fixtures/cryptographic-environment.fixture'

describe('contrato do segredo de supressão de notificações', () => {
  test('a chave declarada chega à configuração', () => {
    expect(parseEnvironment(API_ENVIRONMENT).cryptography.notificationSuppressionHmacKey).toBe(
      NOTIFICATION_SUPPRESSION_HMAC_KEY,
    )
  })

  // O HMAC é o que torna o endereço suprimido irreconhecível no banco do módulo. Subir sem ele
  // significaria guardar supressão que não casa com ninguém — e continuar mandando e-mail para
  // quem já recusou. Por isso falha no boot, e não em silêncio no primeiro envio.
  test.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['curta', Buffer.alloc(31, 7).toString('base64')],
    ['sem padding canônico', Buffer.alloc(32, 7).toString('base64').replace(/=$/, '')],
  ])('falha no boot com a chave %s', (_name, value) => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, NOTIFICATION_SUPPRESSION_HMAC_KEY: value }),
    ).toThrow(CryptographicConfigurationError)
  })

  // Reuso de material entre propósitos é o mesmo erro que o keyring já recusa: uma chave queimada
  // arrastaria a outra função junto.
  test.each([
    ['do envelope', ACTIVE_ENCRYPTION_KEY],
    ['de idempotência', IDEMPOTENCY_HMAC_KEY],
  ])('recusa reuso da chave %s', (_name, reusedKey) => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, NOTIFICATION_SUPPRESSION_HMAC_KEY: reusedKey }),
    ).toThrow(CryptographicConfigurationError)
  })
})
