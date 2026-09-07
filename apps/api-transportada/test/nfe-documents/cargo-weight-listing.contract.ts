/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { DOCUMENT_SUMMARY } from '../fixtures/nfe-http-payload.fixture'
import { documentsListRequest } from '../fixtures/nfe-http-request.fixture'

type WeightRow = {
  readonly cargoGrossWeight: string | null
  readonly cargoWeightSource: 'estimated' | 'xml' | null
}

async function listWeights(
  documents: readonly (typeof DOCUMENT_SUMMARY)[],
): Promise<readonly WeightRow[]> {
  const fixture = await createNfeHttpFixture({
    documentList: { items: documents, nextCursor: null },
  })
  const response = await fixture.handle(documentsListRequest())
  const body = (await response.json()) as { readonly data: readonly WeightRow[] }

  expect(response.status).toBe(200)
  return body.data
}

/**
 * O peso já era resolvido dentro da listagem — é ele que decide o bloqueio de lote de CT-e — e era
 * descartado antes de virar resposta. Quem carrega o caminhão escolhe a nota pelo peso, e a tabela
 * de busca da viagem não tinha de onde tirá-lo.
 */
describe('cargo weight on the NF-e document listing', () => {
  test('serves the declared weight with the source that produced it', async () => {
    const [row] = await listWeights([DOCUMENT_SUMMARY])

    expect(row?.cargoGrossWeight).toBe(DOCUMENT_SUMMARY.cargoGrossWeight)
    expect(row?.cargoWeightSource).toBe('xml')
  })

  /**
   * ⚠️ A origem viaja **junto**, sempre. `estimated` é `quantidade de volumes × peso padrão da
   * empresa` — um palpite —, e servir o número sem dizer isso é o modo de falha que a ADR-0044 §1
   * descreve para a coordenada: número plausível, sem aviso.
   */
  test('marks the estimate as an estimate', async () => {
    const [row] = await listWeights([
      { ...DOCUMENT_SUMMARY, cargoGrossWeight: '90.0000', cargoWeightSource: 'estimated' },
    ])

    expect(row?.cargoWeightSource).toBe('estimated')
  })

  /**
   * Ausência é `null` nos **dois** campos, nunca zero: zero declararia que a carga não pesa nada, e
   * é justamente a nota sem `pesoB` e sem peso padrão configurado que precisa aparecer como vazia.
   */
  test('carries absence as null on both fields instead of a zero weight', async () => {
    const [row] = await listWeights([
      { ...DOCUMENT_SUMMARY, cargoGrossWeight: null, cargoWeightSource: null },
    ])

    expect(row?.cargoGrossWeight).toBeNull()
    expect(row?.cargoWeightSource).toBeNull()
  })
})
