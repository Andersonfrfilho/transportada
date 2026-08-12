/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CALLBACK_TOKEN,
  COMPANY_ID,
  defaultCredentials,
  OTHER_CALLBACK_TOKEN,
  OTHER_COMPANY_ID,
  sha256Hex,
  UNKNOWN_CALLBACK_TOKEN,
} from '../fixtures/nfse-callbacks-http.fixture'
import {
  hashCallbackToken,
  matchCallbackCredential,
} from '../../src/nfse-callbacks/domain/nfse-callback-token.policy'

describe('nfse callback token match contract', () => {
  test('acha a empresa dona do token, esteja ela em qualquer posição da lista', async () => {
    const credentials = await defaultCredentials()

    expect(
      matchCallbackCredential({
        credentials,
        digest: await hashCallbackToken(OTHER_CALLBACK_TOKEN),
      }),
    ).toBe(OTHER_COMPANY_ID)
    expect(
      matchCallbackCredential({ credentials, digest: await hashCallbackToken(CALLBACK_TOKEN) }),
    ).toBe(COMPANY_ID)
  })

  test('token que ninguém emitiu não casa com empresa nenhuma', async () => {
    const credentials = await defaultCredentials()

    expect(
      matchCallbackCredential({
        credentials,
        digest: await hashCallbackToken(UNKNOWN_CALLBACK_TOKEN),
      }),
    ).toBeUndefined()
  })

  test('lista vazia e digest de tamanho errado não casam nem explodem', async () => {
    const credentials = await defaultCredentials()

    expect(
      matchCallbackCredential({ credentials: [], digest: await hashCallbackToken(CALLBACK_TOKEN) }),
    ).toBeUndefined()
    expect(matchCallbackCredential({ credentials, digest: 'nao-e-hexadecimal' })).toBeUndefined()
    expect(matchCallbackCredential({ credentials, digest: '' })).toBeUndefined()
  })

  test('linha guardada com hash inválido é ignorada sem derrubar a comparação', async () => {
    const digest = await hashCallbackToken(CALLBACK_TOKEN)
    const credentials = [
      { callbackTokenSha256: 'linha-corrompida', companyId: OTHER_COMPANY_ID },
      { callbackTokenSha256: digest, companyId: COMPANY_ID },
    ]

    expect(matchCallbackCredential({ credentials, digest })).toBe(COMPANY_ID)
  })

  test('o hash é o mesmo sha256 hexadecimal minúsculo que o banco guarda', async () => {
    const digest = await hashCallbackToken(CALLBACK_TOKEN)

    expect(digest).toBe(await sha256Hex(CALLBACK_TOKEN))
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
  })

  test('a comparação é timingSafeEqual sobre digests, sem igualdade de string e sem saída antecipada', async () => {
    const source = await Bun.file(
      new URL('../../src/nfse-callbacks/domain/nfse-callback-token.policy.ts', import.meta.url),
    ).text()

    expect(source).toContain('timingSafeEqual')
    // Comparar hash com `===`/`includes` vaza o segredo pelo tempo de resposta.
    expect(source).not.toMatch(/callbackTokenSha256\s*===/)
    expect(source).not.toMatch(/\.(includes|indexOf|find|some)\(/)
    // Sair no primeiro acerto reintroduz o oráculo que o timingSafeEqual acabou de fechar.
    expect(loopBody(source)).not.toMatch(/\b(return|break)\b/)
  })
})

/** Corpo do laço que percorre as credenciais, isolado por contagem de chaves. */
function loopBody(source: string): string {
  const start = source.indexOf('{', source.indexOf('for ('))
  expect(start).toBeGreaterThan(0)

  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index)
    }
  }

  throw new Error('laço de comparação sem fechamento no arquivo de política')
}
