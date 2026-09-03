/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 082 / ADR-0057 §3 (`security.md` §1): o documento do recebedor é dado pessoal e **não vai
 * para log em nível nenhum**. A varredura é por texto de fonte, como a do destino físico da 073:
 * o vazamento compila e passa em todo teste de caminho feliz.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

const SEAM_FILES = [
  'src/trips/application/attach-delivery-proof.use-case.ts',
  'src/trips/application/delivery-proof-document-secret.service.ts',
  'src/trips/application/read-delivery-proof.use-case.ts',
  'src/trips/domain/delivery-proof-settings.policy.ts',
  'src/trips/infrastructure/drizzle-delivery-proof.repository.ts',
  'src/trips/infrastructure/delivery-proof-read.support.ts',
  'src/trips/presentation/delivery-proof.schema.ts',
] as const

const LOG_CALL_PATTERN = /\b(?:logger|log)\s*(?:\?\.)?\.\s*(?:debug|info|warn|error)\s*\(/u

describe('receiver document logging (spec 082)', () => {
  for (const file of SEAM_FILES) {
    it(`${file} logs nothing at all`, () => {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')

      expect(LOG_CALL_PATTERN.test(source)).toBe(false)
    })
  }

  /** A leitura devolve a máscara, nunca o envelope aberto: abrir aqui seria expor por acidente. */
  it('the read path never decrypts the document', () => {
    const source = readFileSync(
      new URL('../../src/trips/infrastructure/delivery-proof-read.support.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('decrypt')
    expect(source).toContain('receiverDocumentMasked')
  })
})
