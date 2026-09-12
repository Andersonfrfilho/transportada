/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  ALL_COLUMNS_VISIBLE,
  DOCUMENT_COLUMN_KEYS,
} from '../../src/modules/nfe-workspace/hooks/useNfeDocumentTable.hook'
import { describeDocumentOutput } from '../../src/modules/nfe-workspace/shared/documentOutput.service'
import { createNfeWorkspaceClient } from '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import locale from '../../src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
import englishLocale from '../../src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'

const LIST_ITEM = {
  accessKey: '35190730290856000160550010000000011000000010',
  cargoGrossWeight: '108.6700',
  cargoWeightSource: 'xml',
  cteBlockReason: null,
  emitterAddress: 'Rua das Cargas, 100',
  emitterCity: 'Campinas',
  emitterCityCode: '3509502',
  emitterName: 'Emitente Transportada',
  emitterState: 'SP',
  emitterTaxId: '30290856000160',
  freightAmount: null,
  freightRuleName: null,
  id: 'document-1',
  issuedAt: '2026-07-22T10:00:00.000Z',
  nfseBlockReason: null,
  nfseInvoiceId: null,
  nfseInvoiceNumber: null,
  number: '11',
  recipientAddress: 'Avenida Logística, 500',
  recipientAddressNumber: null,
  recipientCity: 'Jundiaí',
  recipientCityCode: '3525904',
  recipientLatitude: null,
  recipientLocationPrecision: null,
  recipientLongitude: null,
  recipientName: 'Destinatário',
  recipientPhone: null,
  recipientPostalCode: '14020000',
  recipientState: 'SP',
  recipientTaxId: '12345678000199',
  series: '1',
  status: 'authorized',
  totalAmount: '1000.0000',
  tripId: null,
  tripStatus: null,
  variant: 'complete',
} as const

async function listWith(items: readonly unknown[]) {
  const client = createNfeWorkspaceClient({
    apiUrl: 'https://api.example.test',
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify({ data: items, page: { nextCursor: null } }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      ),
    getAccessToken: () => Promise.resolve('synthetic-token'),
  })
  return client.listDocuments({ cursor: null, limit: 25 })
}

/**
 * A API sobe antes da tela, e a tela sobe antes da API em nenhum deploy — mas o contrário acontece
 * na janela entre os dois serviços. `documentOutput` ausente não pode recusar a linha: foi assim que
 * a tabela de frota ficou vazia com 200 na rede (`VEHICLE_DETAIL_KEYS`, CLAUDE.md).
 */
describe('coluna "Documento" da tabela de Notas (spec 144 D3)', () => {
  test('o guard aceita a linha sem documentOutput', async () => {
    const page = await listWith([LIST_ITEM])

    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.documentOutput).toBeUndefined()
  })

  test('o guard aceita as quatro saídas e uma saída que esta versão não conhece', async () => {
    const outputs = [
      { output: 'cte' },
      { nfseProfileId: 'nfse-profile-1', output: 'nfse' },
      { output: 'blocked', reason: 'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE' },
      { output: 'no_profile', reason: 'unmatched' },
      { output: 'future_document' },
    ]
    const page = await listWith(
      outputs.map((documentOutput, index) => ({ ...LIST_ITEM, documentOutput, id: `d-${index}` })),
    )

    expect(page.items.map((item) => item.documentOutput)).toEqual(outputs)
  })

  test('ausência e saída desconhecida deixam a célula vazia, nunca "CT-e" por omissão', () => {
    expect(describeDocumentOutput(undefined)).toBeNull()
    expect(describeDocumentOutput({ output: 'future_document' })).toBeNull()
    expect(describeDocumentOutput({ output: 'cte' })).toEqual({ kind: 'cte' })
    expect(describeDocumentOutput({ nfseProfileId: 'p', output: 'nfse' })).toEqual({
      kind: 'nfse',
    })
    expect(describeDocumentOutput({ output: 'blocked', reason: 'X' })).toEqual({
      kind: 'blocked',
      reason: 'X',
    })
    expect(describeDocumentOutput({ output: 'no_profile', reason: 'ambiguous' })).toEqual({
      kind: 'noProfile',
      reason: 'ambiguous',
    })
  })

  test('a coluna existe, tem rótulo e aparece por padrão como as outras do módulo', () => {
    expect(DOCUMENT_COLUMN_KEYS).toContain('documentOutput')
    expect(ALL_COLUMNS_VISIBLE.documentOutput).toBe(true)
    expect(locale.documents.columns.documentOutput).toBe('Documento')
  })

  /** Motivo sem rótulo sai cru na tela; os dois novos precisam de frase nos dois idiomas. */
  test('os dois motivos novos têm rótulo em pt-BR e em inglês', () => {
    for (const reason of [
      'CTE_BATCH_DOCUMENT_OUTPUT_NFSE',
      'CTE_PROFILE_NFSE_PROFILE_NOT_ACTIVE',
    ] as const) {
      expect(locale.cteEmission.blockReason[reason]).toBeString()
      expect(englishLocale.cteEmission.blockReason[reason]).toBeString()
    }
    for (const reason of ['ambiguous', 'not_cnpj', 'unmatched'] as const) {
      expect(locale.documents.documentOutput.noProfileReason[reason]).toBeString()
    }
  })
})
