/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 191 T1.2, ADR-0076 §3: a chave do limitador anônimo é HMAC-SHA256 com chave própria e
 * separação de domínio por escopo. `rate_limit_windows` guarda a janela por até 24 h; com IP ou
 * identificador em claro, a tabela viraria uma lista de PII.
 */
import { createHmac } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { CryptographicConfigurationError } from '../../src/config/cryptographic-configuration.error.js'
import { parseEnvironment } from '../../src/config/environment.schema.js'
import { createRateLimitSubjectService } from '../../src/http/rate-limit-subject.service.js'
import {
  ACTIVE_ENCRYPTION_KEY,
  API_ENVIRONMENT,
  IDEMPOTENCY_HMAC_KEY,
  NOTIFICATION_SUPPRESSION_HMAC_KEY,
  RATE_LIMIT_SUBJECT_HMAC_KEY,
} from '../fixtures/cryptographic-environment.fixture.js'

const KEY = Uint8Array.from(Buffer.alloc(32, 11))

function expectedDigest(input: {
  readonly kind: string
  readonly scope: string
  readonly value: string
}): string {
  return createHmac('sha256', KEY)
    .update(`transportada:rate-limit:v1:${input.scope}\u0000${input.kind}\u0000${input.value}`)
    .digest('base64url')
}

describe('HMAC da chave do limitador anônimo', () => {
  const subjects = createRateLimitSubjectService({ key: KEY })

  test('IP: HMAC-SHA256 com o domínio do escopo, em base64url, prefixado por ip:', () => {
    expect(subjects.forClientIp({ clientIp: '198.51.100.7', scope: 'login-hints' })).toBe(
      `ip:${expectedDigest({ kind: 'ip', scope: 'login-hints', value: '198.51.100.7' })}`,
    )
  })

  test('alvo: HMAC-SHA256 com o domínio do escopo, em base64url, prefixado por target:', () => {
    expect(subjects.forTarget({ scope: 'password-resets', target: 'ana@empresa.test' })).toBe(
      `target:${expectedDigest({ kind: 'target', scope: 'password-resets', value: 'ana@empresa.test' })}`,
    )
  })

  test('cabe na coluna subject_key (varchar 120)', () => {
    const longest = subjects.forTarget({ scope: 'x'.repeat(60), target: 'y'.repeat(254) })
    expect(longest.length).toBeLessThanOrEqual(120)
  })

  test('outra chave dá outro HMAC', () => {
    const other = createRateLimitSubjectService({ key: Uint8Array.from(Buffer.alloc(32, 12)) })
    expect(other.forClientIp({ clientIp: '198.51.100.7', scope: 's' })).not.toBe(
      subjects.forClientIp({ clientIp: '198.51.100.7', scope: 's' }),
    )
  })
})

describe('RATE_LIMIT_SUBJECT_HMAC_KEY no boot', () => {
  test('a chave declarada chega à configuração como 32 bytes', () => {
    expect(parseEnvironment(API_ENVIRONMENT).cryptography.rateLimitSubjectHmacKey).toEqual(
      Uint8Array.from(Buffer.from(RATE_LIMIT_SUBJECT_HMAC_KEY, 'hex')),
    )
  })

  test.each([
    ['ausente', undefined],
    ['vazia', ''],
    ['curta', Buffer.alloc(31, 7).toString('hex')],
    ['longa', Buffer.alloc(33, 7).toString('hex')],
    ['em maiúsculas', Buffer.alloc(32, 0xab).toString('hex').toUpperCase()],
    ['em base64', Buffer.alloc(32, 7).toString('base64')],
    ['com caractere fora do hexadecimal', `${'0'.repeat(63)}g`],
  ])('falha no boot com a chave %s', (_name, value) => {
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, RATE_LIMIT_SUBJECT_HMAC_KEY: value }),
    ).toThrow(CryptographicConfigurationError)
  })

  test.each([
    ['do envelope', ACTIVE_ENCRYPTION_KEY],
    ['de idempotência', IDEMPOTENCY_HMAC_KEY],
    ['de supressão de notificações', NOTIFICATION_SUPPRESSION_HMAC_KEY],
  ])('recusa reuso da chave %s', (_name, reusedBase64Key) => {
    const reused = Buffer.from(reusedBase64Key, 'base64').toString('hex')
    expect(() =>
      parseEnvironment({ ...API_ENVIRONMENT, RATE_LIMIT_SUBJECT_HMAC_KEY: reused }),
    ).toThrow(CryptographicConfigurationError)
  })
})
