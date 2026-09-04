/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const REPOSITORY_PATH = 'src/trips/infrastructure/drizzle-trip.repository.ts'

/**
 * `trip_documents_entity_xor_check` garante que a nota chega por **um** dos dois caminhos: direto
 * em `nfe_document_id`, ou por `freight_calculations.nfe_document_id`. A spec 079 T017 resolveu o
 * primeiro; pelo segundo a tela continuava imprimindo o UUID, que é o defeito que a T017 fechou.
 *
 * O contrato é por texto de fonte porque a alternativa — provar a junção — é teste de integração
 * com banco, e o que se erra aqui é esquecer o segundo caminho, não escrever SQL inválido.
 */
describe('identidade da nota que chega por cálculo de frete', () => {
  test('a consulta resolve os dois caminhos, não só o direto', async () => {
    const source = await Bun.file(new URL(REPOSITORY_PATH, APPLICATION_ROOT)).text()

    expect(source).toContain('nfeDocumentsViaFreight')
    for (const column of ['number', 'series', 'issuedAt', 'totalValue']) {
      expect(source).toContain(`${column}}, ${'${nfeDocumentsViaFreight.'}${column}})`)
    }
  })

  /** O status fica de fora: para a nota de cálculo de frete, `fiscalStatus` é o do cálculo. */
  test('o status não entra no coalesce', async () => {
    const source = await Bun.file(new URL(REPOSITORY_PATH, APPLICATION_ROOT)).text()

    expect(source).not.toContain('nfeDocumentsViaFreight.status')
  })
})
