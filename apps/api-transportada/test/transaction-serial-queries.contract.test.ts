/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

/**
 * Consulta concorrente sobre **uma** transação do Bun SQL pode nunca voltar: medido em 12/09/2026,
 * o `create` de NFS-e ficou `idle in transaction` para sempre em 3 de 3 rodadas com `Promise.all`
 * dentro da transação — em 3 de 3 também com só a seleção em série, porque o nível de cima seguia
 * concorrente — e passou em 9 de 9 com os dois níveis em série. Cada função abaixo recebe a
 * transação em algum caminho real de chamada; paralelizar consulta nelas volta a travar a conexão.
 */
const TRANSACTION_REACHABLE_FUNCTIONS = [
  {
    file: 'nfse-invoices/application/nfse-invoice-candidates.service.ts',
    signature: 'export async function resolveNfseCandidates(',
  },
  {
    file: 'nfse-invoices/infrastructure/nfse-invoice-selection.query.ts',
    signature: 'export async function findNfseSelectionDocuments(',
  },
  {
    file: 'cte-batches/infrastructure/cte-batch-selection.query.ts',
    signature: 'export async function findSelectionDocuments(',
  },
  {
    file: 'mdfe-manifests/infrastructure/mdfe-issuance-payload.query.ts',
    signature: 'export async function findMdfeIssuancePayloadSource(',
  },
  {
    file: 'cte-issuance/infrastructure/cte-issuance-payload.query.ts',
    signature: 'export async function findCteIssuancePayloadSource(',
  },
  {
    file: 'cte-issuance/infrastructure/cte-issuance-payload.query.ts',
    signature: 'async function loadInvoices(',
  },
  {
    file: 'cte-profiles/infrastructure/drizzle-cte-emission-profile.repository.ts',
    signature: 'private async hydrate(',
  },
  {
    file: 'trips/infrastructure/drizzle-trip.repository.ts',
    signature: 'async function readTripDetail(',
  },
  {
    file: 'trips/infrastructure/trip-occupancy.support.ts',
    signature: 'async function loadMeasuredItems(',
  },
  {
    file: 'trips/infrastructure/trip-cargo-weight.support.ts',
    signature: 'export async function loadTripCargoWeight(',
  },
  {
    file: 'trips/infrastructure/delivery-proof-read.support.ts',
    signature: 'export async function listDeliveryContacts(',
  },
] as const

const NEXT_DECLARATION =
  /\n(?:export )?(?:async )?function |\n {2}(?:public |private |protected )(?:async )?\w+[<(]|\n(?:export )?(?:const|type|class) /

function readFunctionSource(file: string, signature: string): string | undefined {
  const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const start = source.indexOf(signature)
  if (start === -1) return undefined
  const rest = source.slice(start + signature.length)
  const end = rest.search(NEXT_DECLARATION)
  return end === -1 ? rest : rest.slice(0, end)
}

describe('consultas dentro de transação rodam em série', () => {
  for (const { file, signature } of TRANSACTION_REACHABLE_FUNCTIONS) {
    test(`${file} · ${signature}`, () => {
      const body = readFunctionSource(file, signature)

      expect(body).toBeDefined()
      expect(body).not.toContain('Promise.all(')
      expect(body).not.toContain('Promise.allSettled(')
    })
  }
})
