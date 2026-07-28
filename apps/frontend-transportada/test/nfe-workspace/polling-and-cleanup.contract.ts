/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DISTRIBUTION_STATUS,
  DISTRIBUTION_STATUS_RUNNING,
  IMPORT_SUMMARY,
  type NfeDistributionStatusContract,
  type NfeImportSummaryContract,
  RUNNING_IMPORT,
  TERMINAL_IMPORT,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
  syntheticXmlFile,
  syntheticZipFile,
} from './nfe-workspace.fixture'

describe('nfe workspace polling and cleanup contract', () => {
  test('polls only while the active import is non-terminal', async () => {
    const { createImportPollingState } = await loadFutureModule<NfePollingModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )

    expect(createImportPollingState({ activeImport: RUNNING_IMPORT })).toEqual({
      enabled: true,
      intervalMs: 5_000,
    })
    expect(createImportPollingState({ activeImport: TERMINAL_IMPORT })).toEqual({
      enabled: false,
      intervalMs: null,
    })
    expect(createImportPollingState({ activeImport: null })).toEqual({
      enabled: false,
      intervalMs: null,
    })
  })

  test('keeps polling distribution status within the trigger grace window even when idle', async () => {
    const { createDistributionPollingState } = await loadFutureModule<NfeDistributionPollingModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )

    expect(
      createDistributionPollingState({
        now: 10_000,
        status: DISTRIBUTION_STATUS_RUNNING,
        triggeredAt: null,
      }),
    ).toEqual({ enabled: true, intervalMs: 5_000 })

    expect(
      createDistributionPollingState({
        now: 10_000,
        status: DISTRIBUTION_STATUS,
        triggeredAt: 9_000,
      }),
    ).toEqual({ enabled: true, intervalMs: 2_000 })

    expect(
      createDistributionPollingState({
        now: 10_000,
        status: undefined,
        triggeredAt: 9_000,
      }),
    ).toEqual({ enabled: true, intervalMs: 2_000 })

    expect(
      createDistributionPollingState({
        now: 40_000,
        status: DISTRIBUTION_STATUS,
        triggeredAt: 9_000,
      }),
    ).toEqual({ enabled: false, intervalMs: null })

    expect(
      createDistributionPollingState({
        now: 10_000,
        status: DISTRIBUTION_STATUS,
        triggeredAt: null,
      }),
    ).toEqual({ enabled: false, intervalMs: null })
  })

  test('clears selected fiscal files after submit success, submit failure and manual reset', async () => {
    const { createUploadDraftController } = await loadFutureModule<NfeWorkspaceDraftModule>(
      '../../src/modules/nfe-workspace/hooks/useNfeWorkspace.hook',
    )

    const successDraft = createUploadDraftController({
      requestUpload: () => Promise.resolve(IMPORT_SUMMARY),
    })
    successDraft.setFiles([syntheticXmlFile(), syntheticZipFile()])
    expect(successDraft.selectedFiles.map((file) => file.name)).toEqual([
      'valid-nfe.xml',
      'batch.zip',
    ])
    expect(await successDraft.submit({ idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })).toEqual(
      IMPORT_SUMMARY,
    )
    expect(successDraft.selectedFiles).toEqual([])

    const failedDraft = createUploadDraftController({
      requestUpload: () => Promise.reject(new Error('UPLOAD_REJECTED')),
    })
    failedDraft.setFiles([syntheticXmlFile()])
    const submitError = await failedDraft
      .submit({ idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })
      .catch((caught: unknown) => caught)
    expect(submitError).toEqual(expect.objectContaining({ message: 'UPLOAD_REJECTED' }))
    expect(failedDraft.selectedFiles).toEqual([])

    const resetDraft = createUploadDraftController({
      requestUpload: () => Promise.resolve(IMPORT_SUMMARY),
    })
    resetDraft.setFiles([syntheticXmlFile()])
    resetDraft.clear()
    expect(resetDraft.selectedFiles).toEqual([])
  })
})

type NfePollingModule = {
  readonly createImportPollingState: (input: {
    readonly activeImport: null | NfeImportSummaryContract
  }) => {
    readonly enabled: boolean
    readonly intervalMs: null | number
  }
}

type NfeDistributionPollingModule = {
  readonly createDistributionPollingState: (input: {
    readonly now: number
    readonly status: NfeDistributionStatusContract | undefined
    readonly triggeredAt: null | number
  }) => {
    readonly enabled: boolean
    readonly intervalMs: null | number
  }
}

type UploadDraftController = {
  readonly clear: () => void
  readonly selectedFiles: readonly File[]
  readonly setFiles: (files: readonly File[]) => void
  readonly submit: (input: { readonly idempotencyKey: string }) => Promise<typeof IMPORT_SUMMARY>
}

type NfeWorkspaceDraftModule = {
  readonly createUploadDraftController: (input: {
    readonly requestUpload: (input: {
      readonly files: readonly File[]
      readonly idempotencyKey: string
    }) => Promise<typeof IMPORT_SUMMARY>
  }) => UploadDraftController
}
