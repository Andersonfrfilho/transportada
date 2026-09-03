/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 / ADR-0057 §3 (`security.md` §1): o documento do recebedor é dado pessoal e **não vai
 * para log em nível nenhum**. A varredura é por texto de fonte, como a do destino físico da 073:
 * o vazamento compila e passa em todo teste de caminho feliz.
 *
 * Revisão da spec 082, item 3: a whitelist de arquivos virou varredura — todo `src/trips/**` que
 * menciona `receiverDocument` entra sozinho, mais `me-trip.routes.ts`, por onde o multipart passa
 * mesmo sem nomear o campo.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'bun:test'

const TRIPS_SOURCE_ROOT = new URL('../../src/trips/', import.meta.url).pathname
const ALWAYS_SWEPT = ['presentation/me-trip.routes.ts'] as const
const RECEIVER_DOCUMENT_MENTION = /receiverDocument|receiver_document/u
const LOG_CALL_PATTERN = /\b(?:logger|log)\s*(?:\?\.)?\.\s*(?:debug|info|warn|error)\s*\(/u

function listSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { recursive: true, withFileTypes: false })
    .map(String)
    .filter((entry) => entry.endsWith('.ts'))
}

const sweptFiles = [
  ...new Set([
    ...listSourceFiles(TRIPS_SOURCE_ROOT).filter((file) =>
      RECEIVER_DOCUMENT_MENTION.test(readFileSync(join(TRIPS_SOURCE_ROOT, file), 'utf8')),
    ),
    ...ALWAYS_SWEPT,
  ]),
].sort()

describe('receiver document logging (spec 082)', () => {
  /** A varredura vazia seria a whitelist de volta, só que invisível. */
  it('the sweep finds the seam files it exists to watch', () => {
    expect(sweptFiles).toContain('application/attach-delivery-proof.use-case.ts')
    expect(sweptFiles).toContain('presentation/delivery-proof.schema.ts')
    expect(sweptFiles).toContain('presentation/me-trip.routes.ts')
    expect(sweptFiles).toContain('infrastructure/drizzle-delivery-proof.repository.ts')
  })

  for (const file of sweptFiles) {
    it(`src/trips/${file} logs nothing at all`, () => {
      const source = readFileSync(join(TRIPS_SOURCE_ROOT, file), 'utf8')

      expect(LOG_CALL_PATTERN.test(source)).toBe(false)
    })
  }

  /** A leitura devolve a máscara, nunca o envelope aberto: abrir aqui seria expor por acidente. */
  it('the read path never decrypts the document', () => {
    const source = readFileSync(
      join(TRIPS_SOURCE_ROOT, 'infrastructure/delivery-proof-read.support.ts'),
      'utf8',
    )

    expect(source).not.toContain('decrypt')
    expect(source).toContain('receiverDocumentMasked')
  })
})
