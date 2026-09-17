/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T701 (achado CRITICAL da revisão final): a API passou a cortar `totalAmount` e
 * `freightAmount` da listagem de NF-e quando o usuário não tem `trip.financials` (T301). A chave
 * **some** do corpo — nunca `null`, nunca zero —, e a listagem quebrava inteira com
 * `NFE_WORKSPACE_RESPONSE_INVALID` porque o validador ainda exigia as duas sempre presentes.
 */
import { describe, expect, test } from 'bun:test'

import {
  DOCUMENT_LIST_PAGE,
  SYNTHETIC_ACCESS_TOKEN,
  loadFutureModule,
} from './nfe-workspace.fixture'

const API_URL = 'https://api.example.test'

describe('listagem de NF-e sem trip.financials (D10)', () => {
  test('payload sem totalAmount e freightAmount passa na validação da listagem', async () => {
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const client = createNfeWorkspaceClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: [documentWithoutFinancials()],
            page: { nextCursor: null },
          }),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const page = (await client.listDocuments({ cursor: null, limit: 20 })) as {
      items: readonly Record<string, unknown>[]
    }

    expect(page.items).toHaveLength(1)
    const [document] = page.items
    expect(document).toBeDefined()
    expect(Object.hasOwn(document as object, 'totalAmount')).toBe(false)
    expect(Object.hasOwn(document as object, 'freightAmount')).toBe(false)
    /** O resto da linha continua intacto — só o dinheiro saiu. */
    expect(document?.emitterName).toBe(DOCUMENT_LIST_PAGE.items[0].emitterName)
  })

  test('com trip.financials os dois campos continuam presentes e numéricos', async () => {
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const client = createNfeWorkspaceClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json({
            data: DOCUMENT_LIST_PAGE.items,
            page: { nextCursor: DOCUMENT_LIST_PAGE.nextCursor },
          }),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    const page = (await client.listDocuments({ cursor: null, limit: 20 })) as {
      items: readonly Record<string, unknown>[]
    }

    expect(page.items[0]?.totalAmount).toBe(DOCUMENT_LIST_PAGE.items[0].totalAmount)
    expect(page.items[0]?.freightAmount).toBe(DOCUMENT_LIST_PAGE.items[0].freightAmount)
  })
})

function documentWithoutFinancials(): Record<string, unknown> {
  const document: Record<string, unknown> = { ...DOCUMENT_LIST_PAGE.items[0] }
  delete document.totalAmount
  delete document.freightAmount
  return document
}

type NfeWorkspaceClient = {
  listDocuments(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
}

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => NfeWorkspaceClient
}
