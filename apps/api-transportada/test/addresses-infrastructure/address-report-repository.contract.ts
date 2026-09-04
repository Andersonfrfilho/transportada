/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

const FONTE = readFileSync(
  new URL(
    '../../src/addresses/infrastructure/drizzle-address-report.repository.ts',
    import.meta.url,
  ),
  'utf8',
)

describe('a quem o relatório atribui cada pedido (spec 084, G8 / ADR-0057)', () => {
  /**
   * ⚠️ **O defeito que este contrato tranca, e que eu escrevi.** A primeira versão selecionava
   * `nfeParticipants.legalName` — o participante da junção, que é o **destinatário**. O relatório
   * teria pedido a correção a quem recebe a carga, e quem recebe não tem acesso ao cadastro que
   * gerou o texto errado. A ADR-0057 endereça o aviso a quem **emitiu**, e a diferença compila
   * igual: `legalName` existe nos dois lados.
   */
  test('o pedido é atribuído ao emitente, nunca ao destinatário', () => {
    expect(FONTE).toContain('contractorName: emitter.legalName')
    expect(FONTE).toContain('contractorTaxId: emitter.taxId')
    expect(FONTE).not.toContain('contractorName: nfeParticipants.legalName')
  })

  /** A chave se monta em TypeScript, como no lote — nunca uma segunda normalização em SQL. */
  test('a chave de endereço vem de buildStopAddressKey', () => {
    expect(FONTE).toContain('buildStopAddressKey')
    expect(FONTE).not.toContain('sql`')
  })

  /** Todo `select` é escopado pela empresa do contexto (`code-standart.md`, multi-tenant). */
  test('as duas consultas filtram por empresa', () => {
    const ocorrencias = FONTE.match(/companyId, input\.companyId/gu) ?? []
    expect(ocorrencias.length).toBeGreaterThanOrEqual(2)
  })
})
