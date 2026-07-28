/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DOCUMENT_LIST_PAGE,
  IMPORT_LIST_PAGE,
  IMPORT_SUMMARY,
  INVOICES_IMPORT,
  INVOICES_READ,
  RUNNING_IMPORT,
  TERMINAL_IMPORT,
  loadFutureModule,
  syntheticXmlFile,
} from './nfe-workspace.fixture'

describe('nfe workspace permissions and states contract', () => {
  test('only exposes mutations to invoices.import and blocks upload/distribution/reprocess otherwise', async () => {
    const { createNfeWorkspaceController } = await loadFutureModule<NfeWorkspaceHookModule>(
      '../../src/modules/nfe-workspace/hooks/useNfeWorkspace.hook',
    )
    const client = createMutationRecordingClient()

    const forbiddenController = createNfeWorkspaceController({
      client,
      permissions: [],
    })

    expect(forbiddenController.canImport).toBe(false)
    expect(forbiddenController.canRead).toBe(false)
    const uploadError = await forbiddenController
      .requestUpload({
        files: [syntheticXmlFile()],
        idempotencyKey: IMPORT_SUMMARY.idempotencyKey,
      })
      .catch((caught: unknown) => caught)
    const distributionError = await forbiddenController
      .requestDistribution({ idempotencyKey: IMPORT_SUMMARY.idempotencyKey })
      .catch((caught: unknown) => caught)
    const reprocessError = await forbiddenController
      .reprocessImport({
        id: IMPORT_SUMMARY.id,
        idempotencyKey: IMPORT_SUMMARY.idempotencyKey,
      })
      .catch((caught: unknown) => caught)
    expect(uploadError).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_FORBIDDEN' }))
    expect(distributionError).toEqual(
      expect.objectContaining({ message: 'NFE_WORKSPACE_FORBIDDEN' }),
    )
    expect(reprocessError).toEqual(expect.objectContaining({ message: 'NFE_WORKSPACE_FORBIDDEN' }))
    expect(client.mutationCount).toBe(0)

    const readOnlyController = createNfeWorkspaceController({
      client,
      permissions: [INVOICES_READ],
    })
    expect(readOnlyController.canImport).toBe(false)
    expect(readOnlyController.canRead).toBe(true)

    const operatorController = createNfeWorkspaceController({
      client,
      permissions: [INVOICES_IMPORT, INVOICES_READ],
    })
    expect(operatorController.canImport).toBe(true)
    expect(operatorController.canRead).toBe(true)
  })

  test('maps forbidden, empty, running, error and ready states without exposing xml content', async () => {
    const { createNfeWorkspaceViewModel } = await loadFutureModule<NfeWorkspaceViewModelModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceViewModel.service',
    )

    expect(
      createNfeWorkspaceViewModel({
        documents: DOCUMENT_LIST_PAGE,
        imports: IMPORT_LIST_PAGE,
        permissions: [],
        status: 'success',
      }),
    ).toEqual({
      canImport: false,
      canRead: false,
      status: 'forbidden',
    })

    expect(
      createNfeWorkspaceViewModel({
        documents: { items: [], nextCursor: null },
        imports: { items: [], nextCursor: null },
        permissions: [INVOICES_READ],
        status: 'success',
      }),
    ).toEqual({
      canImport: false,
      canRead: true,
      status: 'empty',
    })

    const runningViewModel = createNfeWorkspaceViewModel({
      documents: DOCUMENT_LIST_PAGE,
      imports: { items: [RUNNING_IMPORT], nextCursor: null },
      permissions: [INVOICES_IMPORT, INVOICES_READ],
      status: 'success',
    })
    expect(runningViewModel.status).toBe('running')
    expect(runningViewModel.canImport).toBe(true)
    expect(runningViewModel.canRead).toBe(true)
    expect(runningViewModel.shouldPollActiveImport).toBe(true)
    expect(JSON.stringify(runningViewModel)).not.toContain('<nfeProc')

    const terminalViewModel = createNfeWorkspaceViewModel({
      documents: DOCUMENT_LIST_PAGE,
      imports: { items: [TERMINAL_IMPORT], nextCursor: null },
      permissions: [INVOICES_IMPORT, INVOICES_READ],
      status: 'success',
    })
    expect(terminalViewModel.status).toBe('ready')
    expect(terminalViewModel.shouldPollActiveImport).toBe(false)

    expect(
      createNfeWorkspaceViewModel({
        permissions: [INVOICES_READ],
        status: 'error',
      }),
    ).toEqual({
      canImport: false,
      canRead: true,
      status: 'error',
    })

    expect(
      createNfeWorkspaceViewModel({
        permissions: [],
        status: 'error',
      }),
    ).toEqual({
      canImport: false,
      canRead: false,
      status: 'error',
    })

    expect(
      createNfeWorkspaceViewModel({
        permissions: [],
        status: 'loading',
      }),
    ).toEqual({
      canImport: false,
      canRead: false,
      status: 'loading',
    })
  })
})

function createMutationRecordingClient(): NfeWorkspaceClient & { readonly mutationCount: number } {
  let mutationCount = 0

  return {
    getImportDetail: () => Promise.resolve(IMPORT_SUMMARY),
    listDocuments: () => Promise.resolve(DOCUMENT_LIST_PAGE),
    listImports: () => Promise.resolve(IMPORT_LIST_PAGE),
    downloadDocumentXml: () => Promise.resolve(new Blob(['<nfeProc/>'])),
    get mutationCount(): number {
      return mutationCount
    },
    reprocessImport: () => {
      mutationCount += 1
      return Promise.resolve(IMPORT_SUMMARY)
    },
    requestDistribution: () => {
      mutationCount += 1
      return Promise.resolve(IMPORT_SUMMARY)
    },
    requestUpload: () => {
      mutationCount += 1
      return Promise.resolve(IMPORT_SUMMARY)
    },
  }
}

type NfeWorkspaceClient = {
  downloadDocumentXml(input: { readonly id: string }): Promise<Blob>
  getImportDetail(input: { readonly id: string }): Promise<unknown>
  listDocuments(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  listImports(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  reprocessImport(input: { readonly id: string; readonly idempotencyKey: string }): Promise<unknown>
  requestDistribution(input: { readonly idempotencyKey: string }): Promise<unknown>
  requestUpload(input: {
    readonly files: readonly File[]
    readonly idempotencyKey: string
  }): Promise<unknown>
}

type NfeWorkspaceController = {
  readonly canImport: boolean
  readonly canRead: boolean
  readonly reprocessImport: (input: {
    readonly id: string
    readonly idempotencyKey: string
  }) => Promise<void>
  readonly requestDistribution: (input: { readonly idempotencyKey: string }) => Promise<void>
  readonly requestUpload: (input: {
    readonly files: readonly File[]
    readonly idempotencyKey: string
  }) => Promise<void>
}

type NfeWorkspaceHookModule = {
  readonly createNfeWorkspaceController: (input: {
    readonly client: NfeWorkspaceClient
    readonly permissions: readonly string[]
  }) => NfeWorkspaceController
}

type NfeWorkspaceViewModel = {
  readonly canImport: boolean
  readonly canRead: boolean
  readonly shouldPollActiveImport?: boolean
  readonly status: 'empty' | 'error' | 'forbidden' | 'loading' | 'ready' | 'running'
}

type NfeWorkspaceViewModelModule = {
  readonly createNfeWorkspaceViewModel: (input: {
    readonly documents?: unknown
    readonly imports?: unknown
    readonly permissions: readonly string[]
    readonly status: 'error' | 'loading' | 'success'
  }) => NfeWorkspaceViewModel
}
