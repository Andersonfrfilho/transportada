/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH_ID,
  CTE_BATCH_ITEM_ID,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './cte-issuance.fixture'

const CLIENT_MODULE = '../../src/modules/cte-issuance/shared/cteIssuanceClient.service'
const API_URL = 'https://api.example.test'

type CteIssuanceClientModule = {
  readonly CTE_ISSUANCE_REQUEST_FAILED: string
  readonly CTE_ISSUANCE_REQUEST_UNCONFIRMED: string
  readonly createCteIssuanceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => {
    getIssuance(input: { readonly batchId: string; readonly batchItemId: string }): Promise<unknown>
    issueBatch(input: {
      readonly batchId: string
      readonly idempotencyKey: string
    }): Promise<unknown>
  }
}

function loadClientModule(): Promise<CteIssuanceClientModule> {
  return loadFutureModule<CteIssuanceClientModule>(CLIENT_MODULE)
}

function createClientWith(
  input: Readonly<{
    fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    getAccessToken?: () => Promise<string>
  }>,
  module: CteIssuanceClientModule,
) {
  return module.createCteIssuanceClient({
    apiUrl: API_URL,
    fetch: input.fetch,
    getAccessToken: input.getAccessToken ?? (() => Promise.resolve(SYNTHETIC_ACCESS_TOKEN)),
  })
}

function issue(client: ReturnType<CteIssuanceClientModule['createCteIssuanceClient']>) {
  return client.issueBatch({ batchId: CTE_BATCH_ID, idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })
}

async function captureCode(operation: Promise<unknown>): Promise<string> {
  const caught: unknown = await operation.then(
    () => new Error('CTE_ISSUANCE_CONTRACT_EXPECTED_FAILURE'),
    (error: unknown) => error,
  )
  if (!(caught instanceof Error)) throw new Error('CTE_ISSUANCE_CONTRACT_EXPECTED_ERROR')
  return caught.message
}

describe('CT-e issuance request failure contract', () => {
  /**
   * A API responde `{error:{code}}`; esconder esse código atrás de um genérico deixa o operador
   * sem saber se o lote já tinha saído do rascunho ou se faltou permissão.
   */
  test('surfaces the API error code instead of a blanket request failure', async () => {
    const module = await loadClientModule()
    const client = createClientWith(
      {
        fetch: () =>
          Promise.resolve(
            Response.json(
              { error: { code: 'CTE_BATCH_INVALID_STATE', message: 'lote fora do estado' } },
              { status: 409 },
            ),
          ),
      },
      module,
    )

    expect(await captureCode(issue(client))).toBe('CTE_BATCH_INVALID_STATE')
  })

  test('falls back to the generic code when the body carries no error envelope', async () => {
    const module = await loadClientModule()
    const client = createClientWith(
      { fetch: () => Promise.resolve(new Response('<html>proxy error</html>', { status: 502 })) },
      module,
    )

    expect(await captureCode(issue(client))).toBe(module.CTE_ISSUANCE_REQUEST_FAILED)
  })

  /**
   * POST com chave de idempotência que não recebe resposta pode ter sido aplicado: chamar isso de
   * falha é afirmar um fato que o cliente não observou.
   */
  test('reports a transport failure on a write as unconfirmed, never as failed', async () => {
    const module = await loadClientModule()
    const client = createClientWith({ fetch: () => Promise.reject(new Error('aborted')) }, module)

    expect(await captureCode(issue(client))).toBe(module.CTE_ISSUANCE_REQUEST_UNCONFIRMED)
    expect(module.CTE_ISSUANCE_REQUEST_UNCONFIRMED).not.toBe(module.CTE_ISSUANCE_REQUEST_FAILED)
  })

  test('keeps a read that never landed as a plain failure', async () => {
    const module = await loadClientModule()
    const client = createClientWith({ fetch: () => Promise.reject(new Error('aborted')) }, module)

    expect(
      await captureCode(
        client.getIssuance({ batchId: CTE_BATCH_ID, batchItemId: CTE_BATCH_ITEM_ID }),
      ),
    ).toBe(module.CTE_ISSUANCE_REQUEST_FAILED)
  })

  /** Sessão expirada tem tratamento próprio na tela: o código não pode ser reescrito no caminho. */
  test('propagates the identity failure code untouched', async () => {
    const module = await loadClientModule()
    const client = createClientWith(
      {
        fetch: () => Promise.reject(new Error('unreachable')),
        getAccessToken: () => Promise.reject(new Error('IDENTITY_SESSION_EXPIRED')),
      },
      module,
    )

    expect(await captureCode(issue(client))).toBe('IDENTITY_SESSION_EXPIRED')
  })
})
