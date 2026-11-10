/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'bun:test'

import {
  IMPORT_SUMMARY,
  INVOICES_IMPORT,
  INVOICES_READ,
  loadFutureModule,
} from './nfe-workspace.fixture'

type PreviewClient = {
  previewReprocess(input: { readonly id: string }): Promise<unknown>
}
type ClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => PreviewClient
}
type HookModule = {
  readonly createNfeWorkspaceController: (input: {
    readonly client: PreviewClient
    readonly permissions: readonly string[]
  }) => PreviewClient
}

const PREVIEW = {
  busy: false,
  failedItems: 0,
  reprocessable: true,
  reprocessableRejectionCodes: ['NFE_IMPORT_UNRELATED_CNPJ'],
  rejectedItems: 46,
  total: 46,
}

function clientFor(body: unknown, requests: Request[] = []): PreviewClient {
  return loadClient(body, requests)
}

let cachedFactory: ClientModule['createNfeWorkspaceClient'] | undefined
function loadClient(body: unknown, requests: Request[]): PreviewClient {
  if (cachedFactory === undefined) throw new Error('client module not loaded')
  return cachedFactory({
    apiUrl: 'https://api.example.test',
    fetch: (input, init) => {
      requests.push(new Request(input, init))
      return Promise.resolve(Response.json(body))
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

describe('nfe workspace reprocess preview contract (spec 314)', () => {
  test('reads the preview with a GET and keeps only the counts the screen needs', async () => {
    cachedFactory = (
      await loadFutureModule<ClientModule>(
        '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
      )
    ).createNfeWorkspaceClient
    const requests: Request[] = []

    const preview = await clientFor({ data: PREVIEW }, requests).previewReprocess({
      id: IMPORT_SUMMARY.id,
    })

    expect(preview).toEqual({
      busy: false,
      failedItems: 0,
      reprocessable: true,
      rejectedItems: 46,
      total: 46,
    })
    expect(requests[0]?.method).toBe('GET')
    expect(requests[0]?.url).toBe(
      `https://api.example.test/nfe-imports/${IMPORT_SUMMARY.id}/reprocess-preview`,
    )
  })

  test('refuses a malformed preview instead of guessing a count', async () => {
    cachedFactory = (
      await loadFutureModule<ClientModule>(
        '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
      )
    ).createNfeWorkspaceClient

    const error = await clientFor({ data: { ...PREVIEW, total: '46' } })
      .previewReprocess({ id: IMPORT_SUMMARY.id })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(Error)
  })

  test('blocks the preview without invoices.import and never reaches the API', async () => {
    const { createNfeWorkspaceController } = await loadFutureModule<HookModule>(
      '../../src/modules/nfe-workspace/hooks/useNfeWorkspace.hook',
    )
    let calls = 0
    const client: PreviewClient = {
      previewReprocess: () => {
        calls += 1
        return Promise.resolve(PREVIEW)
      },
    }

    const blocked = await createNfeWorkspaceController({ client, permissions: [INVOICES_READ] })
      .previewReprocess({ id: IMPORT_SUMMARY.id })
      .catch((caught: unknown) => caught)
    const allowed = await createNfeWorkspaceController({
      client,
      permissions: [INVOICES_IMPORT],
    }).previewReprocess({ id: IMPORT_SUMMARY.id })

    expect(blocked).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_FORBIDDEN' }))
    expect(allowed).toEqual(PREVIEW)
    expect(calls).toBe(1)
  })

  test('the queue offers the button for a rejected count and the dialog is the only thing that writes', () => {
    const queue = readFileSync(
      'src/modules/nfe-workspace/components/NfeImportQueue.component.tsx',
      'utf8',
    )
    const page = readFileSync('src/modules/nfe-workspace/pages/NfeWorkspace.page.tsx', 'utf8')

    expect(queue).toContain('item.rejectedCount > 0')
    // O clique só abre o diálogo; a mutação é chamada apenas no "Confirmar".
    const handleReprocess = page.slice(
      page.indexOf('function handleReprocess('),
      page.indexOf('function handleReprocessConfirm('),
    )
    expect(handleReprocess).not.toContain('mutate(')
    expect(page).toContain('onConfirm={handleReprocessConfirm}')
  })
})
