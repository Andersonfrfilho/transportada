/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.3: o leitor da planilha e a política de vínculo são da API (parte A) e o worker os
 * executa por cópia por valor — uma app não importa código de outra. Divergir é ler a mesma
 * planilha de dois jeitos: o contrato exige os arquivos IGUAIS, byte a byte.
 */
import { describe, expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'

const API_DOMAIN = '../api-transportada/src/cargo-receiving/domain'
const WORKER_DOMAIN = 'src/cargo-receiving/domain'

/** O que o leitor e a política importam; tudo mais do domínio da API é da API. */
const COPIED_DOMAIN_FILES = [
  'arrival-reference-label.policy.ts',
  'cargo-preview-cluster-matching.policy.ts',
  'cargo-preview-free-documents.policy.ts',
  'cargo-preview-header.policy.ts',
  'cargo-preview-match-input.policy.ts',
  'cargo-preview-matching.constant.ts',
  'cargo-preview-matching.policy.ts',
  'cargo-preview-matching.types.ts',
  'cargo-preview-partition-choice.policy.ts',
  'cargo-preview-partition.policy.ts',
  'cargo-preview-route-pairing.policy.ts',
  'cargo-preview-row.parser.ts',
  'cargo-preview-sheet.parser.ts',
  'cargo-preview-value.policy.ts',
  'cargo-preview-workbook.constant.ts',
  'cargo-preview-workbook.error.ts',
  'cargo-preview-workbook.parser.ts',
  'cargo-preview-workbook.types.ts',
  'cargo-preview-xml.parser.ts',
  'cargo-preview-zip.parser.ts',
  'contractor-receiving-profile.constant.ts',
  'load-reference.policy.ts',
  'preview-column-name.policy.ts',
] as const

const IMPORT = /from '\.\/([a-z.-]+)\.js'/gu

async function read(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

describe('o domínio da prévia no worker é cópia da API (spec 237 T4.3)', () => {
  test.each([...COPIED_DOMAIN_FILES])('%s é idêntico ao da API', async (file) => {
    const [copy, original] = await Promise.all([
      read(`${WORKER_DOMAIN}/${file}`),
      read(`${API_DOMAIN}/${file}`),
    ])
    expect(copy).toBe(original)
  })

  test('a cópia é fechada: todo import relativo dela é outro arquivo copiado', async () => {
    const files = await readdir(WORKER_DOMAIN)
    expect([...files].sort()).toEqual([...COPIED_DOMAIN_FILES].sort())
    const sources = await Promise.all(files.map((file) => read(`${WORKER_DOMAIN}/${file}`)))
    const imported = sources.flatMap((source) =>
      [...source.matchAll(IMPORT)].map((match) => `${match[1] ?? ''}.ts`),
    )
    for (const file of imported) expect(COPIED_DOMAIN_FILES).toContain(file as never)
  })

  test('as listas e a trava da prévia são as mesmas nas duas apps', async () => {
    const [copy, original] = await Promise.all([
      read('src/shared/cargo-preview.constant.ts'),
      read('../api-transportada/src/shared/cargo-preview.constant.ts'),
    ])
    expect(copy).toBe(original)
    const [lockCopy, lockOriginal] = await Promise.all([
      read('src/cargo-preview/domain/cargo-preview-lock.policy.ts'),
      read('../api-transportada/src/cargo-receiving/domain/cargo-preview-upload.policy.ts'),
    ])
    const lockBody = '`${CARGO_PREVIEW_MATCH_LOCK_PREFIX}:${input.companyId}:${input.contractorId}`'
    expect(lockCopy).toContain(lockBody)
    expect(lockOriginal).toContain(lockBody)
  })

  test('o erro e o detalhe que o domínio importa têm a forma dos da API', async () => {
    const [errorCopy, errorOriginal, typesCopy, typesOriginal] = await Promise.all([
      read('src/shared/api.error.ts'),
      read('../api-transportada/src/shared/api.error.ts'),
      read('src/shared/api.types.ts'),
      read('../api-transportada/src/shared/api.types.ts'),
    ])
    expect(errorCopy).toBe(errorOriginal)
    const detail = /export type ApiErrorDetail = \{[^}]+\}/u
    expect(typesCopy.match(detail)?.[0]).toBe(typesOriginal.match(detail)?.[0])
  })
})
