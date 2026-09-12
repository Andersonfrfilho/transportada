/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createNfeHttpFixture } from '../fixtures/nfe-http.fixture'
import { DOCUMENT_SUMMARY } from '../fixtures/nfe-http-payload.fixture'
import { documentsListRequest } from '../fixtures/nfe-http-request.fixture'

async function listOutputs(
  documents: readonly (typeof DOCUMENT_SUMMARY)[],
): Promise<readonly unknown[]> {
  const fixture = await createNfeHttpFixture({
    documentList: { items: documents, nextCursor: null },
  })
  const response = await fixture.handle(documentsListRequest())
  const body = (await response.json()) as { readonly data: readonly { documentOutput: unknown }[] }

  expect(response.status).toBe(200)
  return body.data.map((row) => row.documentOutput)
}

/** A listagem publica a classificação por linha, com a mesma forma que o bot vai ler (spec 144 D3). */
describe('documentOutput on the NF-e document listing', () => {
  test('serves each of the four outputs as the classification produced it', async () => {
    const outputs = [
      { output: 'cte' },
      { nfseProfileId: '00000000-0000-4000-8000-000000000a01', output: 'nfse' },
      { output: 'blocked', reason: 'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE' },
      { output: 'no_profile', reason: 'ambiguous' },
    ] as const

    expect(
      await listOutputs(outputs.map((documentOutput) => ({ ...DOCUMENT_SUMMARY, documentOutput }))),
    ).toEqual([...outputs])
  })
})
