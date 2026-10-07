/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o ramo de e-mail cria a prévia pelo MESMO contrato do upload da API, que o worker
 * executa por cópia por valor — uma app não importa código de outra. Se o teto, o critério de tipo, o
 * nome, a impressão do pedido, a chave do objeto ou o limite de abertas divergirem, o e-mail passaria a
 * aceitar o que o upload recusa. O contrato cobra os trechos copiados e as colunas do schema.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'

const API_UPLOAD_POLICY =
  '../api-transportada/src/cargo-receiving/domain/cargo-preview-upload.policy.ts'
const API_OPEN_LIMIT =
  '../api-transportada/src/cargo-receiving/infrastructure/cargo-preview-open-limit.support.ts'
const WORKER_UPLOAD_POLICY = 'src/cargo-preview-email/domain/preview-upload-file.policy.ts'

const read = (path: string) => readFile(path, 'utf8')

const SHARED_SNIPPETS = [
  'const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04] as const',
  'const CONTROL_CHARACTERS = /\\p{Cc}/gu',
  'const PATH_SEPARATOR = /[/\\\\]/u',
  "const FALLBACK_FILE_NAME = 'preview'",
  "const baseName = rawName.split(PATH_SEPARATOR).at(-1) ?? ''",
  "const cleaned = baseName.replace(CONTROL_CHARACTERS, '').trim()",
  "const limited = [...cleaned].slice(0, CARGO_PREVIEW_LIMITS.fileNameMaxLength).join('').trim()",
  'return sha256Hex(JSON.stringify([input.contractorId, input.fileSha256]))',
  'export const CARGO_PREVIEW_OPEN_LIMIT = 5',
  "const CARGO_PREVIEW_UPLOAD_LOCK_PREFIX = 'cargo-preview-upload'",
  'return `${CARGO_PREVIEW_UPLOAD_LOCK_PREFIX}:${input.companyId}:${input.contractorId}`',
] as const

describe('o ramo de e-mail copia o contrato do upload (spec 237 T4.6)', () => {
  test.each([...SHARED_SNIPPETS])('o trecho %# existe na API e no worker', async (snippet) => {
    const [api, worker] = await Promise.all([read(API_UPLOAD_POLICY), read(WORKER_UPLOAD_POLICY)])
    expect(api).toContain(snippet)
    expect(worker).toContain(snippet)
  })

  test('o teto do arquivo, a chave do objeto e as colunas da prévia por e-mail são os da API', async () => {
    const [objectPolicy, apiConstants, apiSchema, workerSchema] = await Promise.all([
      read('src/cargo-preview/domain/cargo-preview-object.policy.ts'),
      read('../api-transportada/src/shared/api.constant.ts'),
      read('../api-transportada/src/database/cargo-preview-email-intake.schema.ts'),
      read('src/database/cargo-preview-email-intake.schema.ts'),
    ])
    expect(objectPolicy).toContain('export const CARGO_PREVIEW_OBJECT_MAX_BYTES = 960 * 1024')
    expect(apiConstants).toContain(
      'export const APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES = 1_048_576',
    )
    const columns = (source: string) =>
      new Set(
        [...source.matchAll(/\b(?:uuid|text|varchar|boolean|timestamp)\(\s*'([a-z_]+)'/gu)].map(
          (match) => match[1],
        ),
      )
    for (const column of columns(workerSchema)) expect(columns(apiSchema)).toContain(column)
  })

  test('o limite de prévias abertas é contado sobre a fila e a leitura, como na API', async () => {
    const api = await read(API_OPEN_LIMIT)
    expect(api).toContain(
      'const OPEN_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]',
    )
    expect(api).toContain('select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))')
  })

  test('o perfil copiado no worker lê as três colunas novas com os mesmos nomes', async () => {
    const worker = await read('src/database/cargo-preview-trail.schema.ts')
    for (const column of [
      'preview_inbound_token_hash',
      'preview_forwarder_allowlist',
      'preview_sender_allowlist',
    ]) {
      expect(worker).toContain(`'${column}'`)
    }
  })
})
