/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.4 (RF9): o `Idempotency-Key` da chegada. A repetição do MESMO envio (duplo clique, nova
 * tentativa depois de uma queda) reaproveita a chave e a API devolve a mesma chegada; pedido diferente
 * ganha chave nova, porque a API trata a mesma chave com outro conteúdo como reuso (409).
 */
import { describe, expect, test } from 'bun:test'

import {
  buildRegistrationFingerprint,
  resolveIdempotencyAttempt,
} from '@/modules/cargo-receiving/shared/cargoIdempotencyKey.service'

const INPUT = {
  arrivedAt: '2026-10-03T12:00:00.000Z',
  contractorId: '00000000-0000-4000-8000-000000237a01',
  documentIds: ['b', 'a', 'c'],
  palletCount: 12,
  reference: 'Lacre 4471',
} as const

describe('a impressão digital do pedido (spec 237 T2.4)', () => {
  test('a ordem das notas não é conteúdo — a API também ordena antes de comparar', () => {
    expect(buildRegistrationFingerprint(INPUT)).toBe(
      buildRegistrationFingerprint({ ...INPUT, documentIds: ['c', 'b', 'a'] }),
    )
  })

  test.each([
    ['o contratante', { contractorId: 'outro' }],
    ['uma nota a mais', { documentIds: ['a', 'b', 'c', 'd'] }],
    ['a hora', { arrivedAt: '2026-10-03T12:01:00.000Z' }],
    ['os paletes', { palletCount: 13 }],
    ['a referência', { reference: 'Lacre 4472' }],
    ['a ausência de referência', { reference: undefined }],
  ] as const)('mudar %s muda a impressão', (_label, change) => {
    expect(buildRegistrationFingerprint({ ...INPUT, ...change })).not.toBe(
      buildRegistrationFingerprint(INPUT),
    )
  })
})

describe('a chave por tentativa', () => {
  function counter() {
    let sequence = 0
    return () => {
      sequence += 1
      return `key-${String(sequence).padStart(16, '0')}`
    }
  }

  test('a primeira tentativa gera a chave', () => {
    const attempt = resolveIdempotencyAttempt({
      fingerprint: 'a',
      generateKey: counter(),
      previous: undefined,
    })

    expect(attempt).toEqual({ fingerprint: 'a', key: 'key-0000000000000001' })
  })

  test('o mesmo envio repetido reaproveita a chave — duplo clique não duplica a chegada', () => {
    const generateKey = counter()
    const first = resolveIdempotencyAttempt({ fingerprint: 'a', generateKey, previous: undefined })

    const second = resolveIdempotencyAttempt({ fingerprint: 'a', generateKey, previous: first })
    const third = resolveIdempotencyAttempt({ fingerprint: 'a', generateKey, previous: second })

    expect(second.key).toBe(first.key)
    expect(third.key).toBe(first.key)
  })

  test('pedido diferente ganha chave nova', () => {
    const generateKey = counter()
    const first = resolveIdempotencyAttempt({ fingerprint: 'a', generateKey, previous: undefined })

    const second = resolveIdempotencyAttempt({ fingerprint: 'b', generateKey, previous: first })

    expect(second.key).not.toBe(first.key)
    expect(second.fingerprint).toBe('b')
  })

  test('a chave tem a forma que a API aceita: 16 a 256 de [A-Za-z0-9._:-]', () => {
    const { key } = resolveIdempotencyAttempt({
      fingerprint: 'a',
      generateKey: () => crypto.randomUUID(),
      previous: undefined,
    })

    expect(key).toMatch(/^[A-Za-z0-9._:-]{16,256}$/u)
  })
})
