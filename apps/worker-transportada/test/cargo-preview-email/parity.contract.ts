/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.6: o ramo de e-mail cria a prévia pelo MESMO contrato do upload da API, que o worker
 * executa por cópia por valor — uma app não importa código de outra. Se o teto, o critério de tipo, o
 * nome, a impressão do pedido, a chave do objeto ou o limite de abertas divergirem, o e-mail passaria a
 * aceitar o que o upload recusa. O contrato cobra os trechos copiados e as colunas do schema.
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

const API_UPLOAD_POLICY =
  '../api-transportada/src/cargo-receiving/domain/cargo-preview-upload.policy.ts'
const API_OPEN_LIMIT =
  '../api-transportada/src/cargo-receiving/infrastructure/cargo-preview-open-limit.support.ts'
const API_UPLOAD_REPOSITORY =
  '../api-transportada/src/cargo-receiving/infrastructure/drizzle-cargo-preview-upload.repository.ts'
const WORKER_UPLOAD_POLICY = 'src/cargo-preview-email/domain/preview-upload-file.policy.ts'
const WORKER_EMAIL_DIRECTORY = 'src/cargo-preview-email'

const read = (path: string) => readFile(path, 'utf8')

/** Todo o ramo de e-mail do worker num texto só: o contrato não depende de em qual arquivo cada trecho mora. */
async function readWorkerEmailBranch(): Promise<string> {
  const entries = await readdir(WORKER_EMAIL_DIRECTORY, { recursive: true })
  const files = entries.filter((entry) => entry.endsWith('.ts')).sort()
  const sources = await Promise.all(files.map((file) => read(join(WORKER_EMAIL_DIRECTORY, file))))
  return sources.join('\n')
}

/** As chaves do objeto passado a `.values({...})` (ou a um literal) que começa depois de `anchor`. */
function objectKeysAfter(source: string, anchor: string): ReadonlySet<string> {
  const start = source.indexOf(anchor)
  if (start === -1) throw new Error(`trecho não encontrado: ${anchor}`)
  const open = source.indexOf('{', start + anchor.length - 1)
  let depth = 0
  let end = open
  for (; end < source.length; end += 1) {
    if (source[end] === '{') depth += 1
    if (source[end] === '}') depth -= 1
    if (depth === 0) break
  }
  const keys = new Set<string>()
  let nesting = 0
  let entry = ''
  const flush = () => {
    const key = /^\s*([A-Za-z]\w*)/u.exec(entry)?.[1]
    if (key !== undefined) keys.add(key)
    entry = ''
  }
  for (const char of source.slice(open + 1, end)) {
    if ('{[('.includes(char)) nesting += 1
    if ('}])'.includes(char)) nesting -= 1
    if (char === ',' && nesting === 0) flush()
    else entry += char
  }
  flush()
  return keys
}

const evaluate = (expression: string): number =>
  expression
    .split('*')
    .reduce((product, factor) => product * Number(factor.replaceAll('_', '').trim()), 1)

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
  'ZIP_MAGIC.every((byte, index) => bytes[index] === byte)',
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

describe('a prévia por e-mail é criada como a do upload (spec 237 T4.7a, achado 12)', () => {
  test('o teto de bytes: o mesmo `>` na API e no worker, e o mesmo valor de 960 KiB', async () => {
    const [apiPolicy, workerAttachment, apiLimits, apiBody, workerObject] = await Promise.all([
      read(API_UPLOAD_POLICY),
      read('src/cargo-preview-email/domain/preview-email-attachment.policy.ts'),
      read('../api-transportada/src/cargo-receiving/domain/cargo-preview-workbook.constant.ts'),
      read('../api-transportada/src/shared/api.constant.ts'),
      read('src/cargo-preview/domain/cargo-preview-object.policy.ts'),
    ])
    expect(apiPolicy).toContain('if (bytes.length > CARGO_PREVIEW_UPLOAD_MAX_BYTES) {')
    expect(workerAttachment).toContain(
      'if (candidate.bytes.byteLength > CARGO_PREVIEW_OBJECT_MAX_BYTES) {',
    )
    expect(workerAttachment).toContain('if (!hasZipSignature(candidate.bytes)) {')

    const envelope = /const MULTIPART_ENVELOPE_BYTES = ([\d_* ]+)\n/u.exec(apiPolicy)?.[1] ?? ''
    const fileBytes = /fileBytes: ([\d_* A-Z]+),/u.exec(apiLimits)?.[1] ?? ''
    const body = /APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES = ([\d_]+)/u.exec(apiBody)?.[1] ?? ''
    const mebibyte = 1024 * 1024
    const apiMaximum = Math.min(
      evaluate(fileBytes.replace('MEBIBYTE', String(mebibyte))),
      evaluate(body) - evaluate(envelope),
    )
    const workerMaximum = Number(
      /CARGO_PREVIEW_OBJECT_MAX_BYTES = (\d+) \* (\d+)/u
        .exec(workerObject)
        ?.slice(1)
        .reduce((product, factor) => String(Number(product) * Number(factor)), '1'),
    )
    expect(apiMaximum).toBe(960 * 1024)
    expect(workerMaximum).toBe(apiMaximum)
  })

  test('as prévias abertas: os mesmos estados e o mesmo `>=` do teto de 5, dos dois lados', async () => {
    const [apiSupport, workerBranch] = await Promise.all([
      read(API_OPEN_LIMIT),
      readWorkerEmailBranch(),
    ])
    const statuses =
      'const OPEN_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]'
    expect(apiSupport).toContain(statuses)
    expect(workerBranch).toContain(statuses)
    expect(apiSupport).toContain('if ((row?.open ?? 0) >= CARGO_PREVIEW_OPEN_LIMIT) {')
    expect(workerBranch).toContain('>= CARGO_PREVIEW_OPEN_LIMIT')
    expect(workerBranch).toContain('inArray(cargoPreviews.status, OPEN_STATUSES)')
  })

  test('as colunas gravadas em `cargo_previews`: as da API, mais o estado inicial e quem enviou nulo', async () => {
    const [apiRepository, workerBranch] = await Promise.all([
      read(API_UPLOAD_REPOSITORY),
      readWorkerEmailBranch(),
    ])
    const apiColumns = objectKeysAfter(apiRepository, '.insert(cargoPreviews)\n    .values({')
    const workerColumns = objectKeysAfter(workerBranch, '.insert(cargoPreviews)\n    .values({')
    expect([...apiColumns].sort()).toEqual([
      'companyId',
      'contractorId',
      'fileName',
      'fileObjectId',
      'fileSha256',
      'fileSizeBytes',
      'idempotencyKey',
      'receivedAt',
      'requestFingerprint',
      'source',
      'uploadedByUserId',
    ])
    for (const column of apiColumns) expect(workerColumns).toContain(column)
    expect([...workerColumns].filter((column) => !apiColumns.has(column))).toEqual(['status'])
    expect(apiRepository).toContain('source: CARGO_PREVIEW_SOURCE.upload,')
    expect(workerBranch).toContain('source: CARGO_PREVIEW_SOURCE.email,')
    expect(workerBranch).toContain('uploadedByUserId: null,')
    expect(workerBranch).toContain('status: CARGO_PREVIEW_STATUS.queued,')
  })

  test('o evento `uploaded` e o pedido ao worker de prévia têm a forma do upload', async () => {
    const [apiRepository, workerBranch] = await Promise.all([
      read(API_UPLOAD_REPOSITORY),
      readWorkerEmailBranch(),
    ])
    for (const source of [apiRepository, workerBranch]) {
      expect(source).toContain('kind: CARGO_PREVIEW_EVENT_KIND.uploaded,')
      expect(source).toContain('eventType: CARGO_PREVIEW_OUTBOX_EVENT.process,')
    }
    const apiDetails = objectKeysAfter(apiRepository, 'details: {')
    const workerDetails = objectKeysAfter(workerBranch, 'details: {')
    expect([...apiDetails]).toEqual(['fileSizeBytes'])
    expect([...workerDetails].sort()).toEqual(['fileSizeBytes', 'source'])
    const apiPayload = objectKeysAfter(apiRepository, 'payload: {')
    const workerPayload = objectKeysAfter(workerBranch, 'payload: {')
    expect([...apiPayload].sort()).toEqual(['bucket', 'objectKey', 'previewId'])
    expect([...workerPayload].sort()).toEqual([...apiPayload].sort())
    expect(workerBranch).toContain('channel: CARGO_PREVIEW_CHANNEL.worker,')
    expect(workerBranch).toContain('actor')
  })

  test('a chave do objeto é a da API, e o e-mail a monta com ela', async () => {
    const [apiPolicy, workerObject, workerBranch] = await Promise.all([
      read(API_UPLOAD_POLICY),
      read('src/cargo-preview/domain/cargo-preview-object.policy.ts'),
      readWorkerEmailBranch(),
    ])
    const template = 'return `tenants/${input.companyId}/cargo-previews/${input.fileObjectId}`'
    expect(apiPolicy).toContain(template)
    expect(workerObject).toContain(template)
    expect(workerBranch).toContain(
      'buildCargoPreviewObjectKey({ companyId: input.companyId, fileObjectId })',
    )
  })

  test('as colunas da tabela de e-mails são as mesmas nos dois sentidos', async () => {
    const [apiSchema, workerSchema] = await Promise.all([
      read('../api-transportada/src/database/cargo-preview-email-intake.schema.ts'),
      read('src/database/cargo-preview-email-intake.schema.ts'),
    ])
    const columns = (source: string) =>
      new Set(
        [...source.matchAll(/\b(?:uuid|text|varchar|boolean|timestamp)\(\s*'([a-z_]+)'/gu)].map(
          (match) => match[1],
        ),
      )
    expect([...columns(apiSchema)].sort()).toEqual([...columns(workerSchema)].sort())
    expect(columns(apiSchema).size).toBe(12)
  })

  test('as colunas do perfil são as mesmas nos dois sentidos', async () => {
    const [apiSchema, workerSchema] = await Promise.all([
      read('../api-transportada/src/database/contractor-receiving-profile.schema.ts'),
      read('src/database/cargo-preview-trail.schema.ts'),
    ])
    for (const column of [
      'preview_inbound_token_hash',
      'preview_forwarder_allowlist',
      'preview_sender_allowlist',
    ]) {
      expect(apiSchema).toContain(`'${column}'`)
      expect(workerSchema).toContain(`'${column}'`)
    }
  })

  test('o prefixo `email:` da chave de idempotência é o mesmo, e a API o reserva no upload', async () => {
    const [apiConstant, workerConstant, apiSchema] = await Promise.all([
      read('../api-transportada/src/shared/cargo-preview.constant.ts'),
      read('src/shared/cargo-preview.constant.ts'),
      read('../api-transportada/src/cargo-receiving/presentation/cargo-preview.schema.ts'),
    ])
    expect(apiConstant).toContain("export const CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX = 'email:'")
    expect(workerConstant).toContain(
      "export const CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX = 'email:'",
    )
    expect(apiSchema).toContain('.startsWith(CARGO_PREVIEW_EMAIL_IDEMPOTENCY_PREFIX)')
  })

  test('os códigos de recusa do worker são os da API, nos dois sentidos', async () => {
    const [apiConstant, workerConstant] = await Promise.all([
      read('../api-transportada/src/shared/cargo-preview.constant.ts'),
      read('src/shared/cargo-preview.constant.ts'),
    ])
    const codes = (source: string) =>
      /CARGO_PREVIEW_EMAIL_REJECTION_CODES = \[([^\]]*)\]/u
        .exec(source)?.[1]
        ?.replaceAll(/\s/gu, '')
    expect(codes(apiConstant)).toBeDefined()
    expect(codes(workerConstant)).toBe(codes(apiConstant))
  })
})

const API_TOKEN_POLICY =
  '../api-transportada/src/cargo-receiving/domain/preview-inbound-token.policy.ts'
const WORKER_TOKEN_POLICY = 'src/cargo-preview-email/domain/preview-inbound-token.policy.ts'
const WORKER_EMAIL_CONSTANTS = 'src/cargo-preview-email/domain/cargo-preview-email.constant.ts'
const API_ALLOWLIST_CONSTANTS =
  '../api-transportada/src/cargo-receiving/domain/contractor-preview-email.constant.ts'

describe('o token da entrada por e-mail é gerado na API e lido no worker com a mesma regra (spec 237 T4.6b)', () => {
  const tokenSnippets = [
    'export const PREVIEW_INBOUND_TOKEN_PATTERN = /^[a-z2-7]{26}$/u',
    "export const PREVIEW_INBOUND_TOKEN_PURPOSE = 'transportada:cargo-preview-inbound:v1'",
    "createHash('sha256').update(`${PREVIEW_INBOUND_TOKEN_PURPOSE}:${token}`).digest('hex')",
  ] as const

  test.each([...tokenSnippets])('o trecho %# existe na API e no worker', async (snippet) => {
    const [api, workerFiles] = await Promise.all([
      read(API_TOKEN_POLICY),
      Promise.all([read(WORKER_TOKEN_POLICY), read(WORKER_EMAIL_CONSTANTS)]),
    ])
    expect(api).toContain(snippet)
    expect(workerFiles.join('\n')).toContain(snippet)
  })

  test('o que a API gera cabe no padrão que o worker aceita: 26 símbolos de 5 bits', async () => {
    const [api, workerConstants] = await Promise.all([
      read(API_TOKEN_POLICY),
      read(WORKER_EMAIL_CONSTANTS),
    ])
    const alphabet = /const TOKEN_ALPHABET = '([^']+)'/u.exec(api)?.[1] ?? ''
    const length = Number(/const TOKEN_LENGTH = (\d+)/u.exec(api)?.[1])
    const pattern = /PREVIEW_INBOUND_TOKEN_PATTERN = \/(.+)\/u/u.exec(workerConstants)?.[1] ?? ''

    expect(alphabet).toHaveLength(32)
    expect(new Set(alphabet).size).toBe(32)
    expect(length * Math.log2(alphabet.length)).toBeGreaterThanOrEqual(130)
    const workerPattern = new RegExp(pattern, 'u')
    for (const symbol of alphabet) expect(workerPattern.test(symbol.repeat(length))).toBe(true)
  })

  test('as faixas das listas da API são as do CHECK que o worker já lê', async () => {
    const [apiConstants, apiSchema] = await Promise.all([
      read(API_ALLOWLIST_CONSTANTS),
      read('../api-transportada/src/database/contractor-receiving-profile.schema.ts'),
    ])
    expect(apiConstants).toContain('entryMaxLength: 254')
    expect(apiConstants).toContain('entryMinLength: 3')
    expect(apiConstants).toContain('maxEntries: 20')
    expect(apiSchema).toContain('between 1 and 20')
    expect(apiSchema).toContain('{3,254}')
  })
})
