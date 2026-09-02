/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

/**
 * Spec 073 RF8 / CA7: `<entrega>` diz **onde a carga vai**, não **quem é o cliente**. Estes
 * consumidores decidem coisa fiscal ou comercial — tomador, faturamento, seleção de lote, preço,
 * o que o contratante enxerga, o que a listagem imprime — e continuam lendo o destinatário.
 *
 * O contrato é por texto de fonte porque o defeito que ele previne compila e passa em todo teste
 * de caminho feliz: a conversão em massa dos sete leitores é exatamente o jeito de um destes ir
 * junto sem ninguém olhar.
 */
const FISCAL_AND_COMMERCIAL_CONSUMERS = [
  'src/nfse-invoices/infrastructure/nfse-invoice-selection.query.ts',
  'src/cte-batches/infrastructure/cte-batch-selection.query.ts',
  'src/freight/infrastructure/drizzle-freight.repository.ts',
  'src/contractor-portal/infrastructure/contractor-delivery.query.ts',
  'src/nfe-documents/infrastructure/drizzle-nfe-document.repository.ts',
] as const

const SEAM_MODULES = ['physical-destination.policy', 'physical-destination.join'] as const

describe('physical destination boundary (spec 073 RF8)', () => {
  for (const file of FISCAL_AND_COMMERCIAL_CONSUMERS) {
    it(`${file} never reads the physical destination seam`, () => {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')

      for (const module of SEAM_MODULES) {
        expect(source).not.toInclude(module)
      }
    })
  }

  /** O arquivo tem de existir para o contrato significar alguma coisa — caminho morto passa calado. */
  it('names files that exist', () => {
    for (const file of FISCAL_AND_COMMERCIAL_CONSUMERS) {
      expect(
        readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8').length,
      ).toBeGreaterThan(0)
    }
  })
})
