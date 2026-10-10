/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.1 — a cópia por valor do selo da chave da FeriadosAPI, no molde de
 * `test/contractor-mail/credential-secret-parity.contract.ts`. Quem sela é a API; quem abre é este worker. As
 * apps não importam código uma da outra, então só este teste impede a divergência do AAD **e do formato do
 * plaintext**: divergiu de um lado e o envelope não abre do outro — e a falha só aparece no ciclo seguinte.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

import {
  HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX,
  HOLIDAY_PROVIDER_TOKEN_PATTERN,
} from '../../src/holiday-provider-pull/domain/holiday-provider-token.constant.js'

const API_SERVICE = new URL(
  '../../../api-transportada/src/business-calendar/application/holiday-provider-token-secret.service.ts',
  import.meta.url,
)
const API_CONSTANTS = new URL(
  '../../../api-transportada/src/business-calendar/domain/holiday-provider-settings.constant.ts',
  import.meta.url,
)
const WORKER_SERVICE = new URL(
  '../../src/holiday-provider-pull/application/holiday-provider-token-secret.service.ts',
  import.meta.url,
)
const WORKER_CONSTANTS = new URL(
  '../../src/holiday-provider-pull/domain/holiday-provider-token.constant.ts',
  import.meta.url,
)

/** A declaração inteira: da palavra `export const NOME` até a primeira linha em branco. */
function extractStatement(input: { readonly name: string; readonly source: string }): string {
  const start = input.source.indexOf(`export const ${input.name}`)
  if (start === -1) throw new Error(`${input.name} not found`)

  const end = input.source.indexOf('\n\n', start)
  return input.source.slice(start, end === -1 ? undefined : end).trim()
}

const SHARED_CONSTANTS = [
  'HOLIDAY_PROVIDER_TOKEN_MIN_LENGTH',
  'HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX',
] as const

const SHARED_SERVICE_FRAGMENTS = [
  "const envelopeSchema = z\n  .object({\n    algorithm: z.literal('A256GCM'),\n    ciphertext: z.string().min(1),\n    keyId: z.string().min(1),\n    nonce: z.string().min(1),\n    version: z.literal(1),\n  })\n  .strict()",
  'const secretSchema = z.object({ token: z.string().regex(HOLIDAY_PROVIDER_TOKEN_PATTERN) }).strict()',
  'TEXT_ENCODER.encode(`${HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX}${input.settingsId}`)',
  'JSON.parse(TEXT_DECODER.decode(plaintext))',
]

describe('a paridade do selo da chave da FeriadosAPI com a API (spec 262 T4.1)', () => {
  test('o AAD, o tamanho e o alfabeto da chave são declarados igual nas duas apps', async () => {
    const [api, worker] = await Promise.all([
      readFile(API_CONSTANTS, 'utf8'),
      readFile(WORKER_CONSTANTS, 'utf8'),
    ])

    for (const name of SHARED_CONSTANTS) {
      expect(extractStatement({ name, source: worker })).toBe(
        extractStatement({ name, source: api }),
      )
    }
  })

  test('o AAD é o canônico e o padrão aceita exatamente 16 a 512 ASCII visíveis', () => {
    expect(HOLIDAY_PROVIDER_TOKEN_AAD_PREFIX).toBe('transportada:holiday-provider-token:v1:')
    expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.source).toBe('^[\\x21-\\x7E]{16,512}$')
    expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.flags).toBe('u')
    for (const accepted of ['a'.repeat(16), 'a'.repeat(512), '!~'.repeat(8)]) {
      expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.test(accepted)).toBeTrue()
    }
    for (const refused of [
      'a'.repeat(15),
      'a'.repeat(513),
      `${'a'.repeat(16)} `,
      `${'a'.repeat(16)}é`,
    ]) {
      expect(HOLIDAY_PROVIDER_TOKEN_PATTERN.test(refused)).toBeFalse()
    }
  })

  test('o envelope, o plaintext `{"token":"…"}` estrito e a leitura do AAD são os mesmos', async () => {
    const [api, worker] = await Promise.all([
      readFile(API_SERVICE, 'utf8'),
      readFile(WORKER_SERVICE, 'utf8'),
    ])

    for (const source of [api, worker]) {
      for (const fragment of SHARED_SERVICE_FRAGMENTS) expect(source).toContain(fragment)
    }
    expect(api).toContain('JSON.stringify({ token: input.token })')
  })

  test('o worker abre o envelope DENTRO do try, para o Zod também virar chave ilegível', async () => {
    const worker = await readFile(WORKER_SERVICE, 'utf8')
    const tryStart = worker.indexOf('try {')
    const parseAt = worker.indexOf('envelopeSchema.parse(input.envelope)')

    expect(tryStart).toBeGreaterThan(-1)
    expect(parseAt).toBeGreaterThan(tryStart)
  })

  test('o worker só abre: nunca sela', async () => {
    const worker = await readFile(WORKER_SERVICE, 'utf8')

    expect(worker).toContain('decrypt(')
    expect(worker).not.toContain('encrypt(')
    expect(worker).not.toContain('JSON.stringify')
  })
})
