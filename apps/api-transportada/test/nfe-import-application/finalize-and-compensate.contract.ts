/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  FAILED_IMPORT,
  IMPORT_ID,
  ITEM_ID,
  QUEUED_IMPORT,
  SECOND_ITEM_ID,
  type NfeImportDetail,
  type NfeImportSummary,
} from '../fixtures/nfe-import-application.fixture'
import {
  createCompensateNfeImportUseCaseFixture,
  createFinalizeNfeImportUseCaseFixture,
  type CompensateNfeImportRepositoryPort,
  type FinalizeNfeImportRepositoryPort,
} from '../fixtures/nfe-import-use-case.fixture'

describe('finalize nfe import application contract', () => {
  test('derives counters and partially processed status from terminal item outcomes', async () => {
    const repository = new FinalizeNfeImportRepositoryFixture()
    const useCase = await createFinalizeNfeImportUseCaseFixture({ repository })

    const result = await useCase.execute({
      context: COMPANY_CONTEXT,
      importId: IMPORT_ID,
      itemResults: [
        { error: null, id: ITEM_ID, status: 'imported' },
        { error: null, id: SECOND_ITEM_ID, status: 'duplicated' },
        {
          error: { code: 'XML_INVALID', message: 'XML is invalid' },
          id: 'item-invalid',
          status: 'invalid',
        },
        {
          error: { code: 'PROVIDER_TIMEOUT', message: 'Provider timeout' },
          id: 'item-failed',
          status: 'failed',
        },
      ],
    })

    expect(result).toMatchObject({
      companyId: COMPANY_ID,
      duplicatedCount: 1n,
      failedCount: 1n,
      id: IMPORT_ID,
      importedCount: 1n,
      invalidCount: 1n,
      processedCount: 4n,
      receivedCount: 4n,
      rejectedCount: 0n,
      status: 'partially_processed',
      terminalError: null,
    } satisfies Partial<NfeImportSummary>)
    expect(repository.savedResults).toHaveLength(1)
    expect(repository.savedResults[0]?.companyId).toBe(COMPANY_ID)
    expect(repository.savedResults[0]?.importId).toBe(IMPORT_ID)
  })
})

describe('compensate nfe import application contract', () => {
  test('marks the import as failed with a safe terminal error and keeps tenant scoping', async () => {
    const repository = new CompensateNfeImportRepositoryFixture()
    const useCase = await createCompensateNfeImportUseCaseFixture({ repository })

    const result = await useCase.execute({
      context: COMPANY_CONTEXT,
      error: { code: 'STAGING_COMPENSATION_FAILED', message: 'NF-e import compensation failed' },
      importId: IMPORT_ID,
    })

    expect(result).toMatchObject({
      companyId: COMPANY_ID,
      id: IMPORT_ID,
      status: 'failed',
      terminalError: {
        code: 'STAGING_COMPENSATION_FAILED',
        message: 'NF-e import compensation failed',
      },
    } satisfies Partial<NfeImportSummary>)
    expect(repository.failInputs).toEqual([
      {
        companyId: COMPANY_ID,
        error: { code: 'STAGING_COMPENSATION_FAILED', message: 'NF-e import compensation failed' },
        importId: IMPORT_ID,
      },
    ])
  })
})

class FinalizeNfeImportRepositoryFixture implements FinalizeNfeImportRepositoryPort {
  public readonly detail: NfeImportDetail = {
    ...QUEUED_IMPORT,
    receivedCount: 4n,
    items: [],
  }
  public readonly savedResults: Array<{
    readonly companyId: string
    readonly importId: string
    readonly items: readonly {
      readonly error: unknown
      readonly id: string
      readonly status: string
    }[]
    readonly summary: NfeImportSummary
  }> = []

  async findById(): Promise<NfeImportDetail | null> {
    return this.detail
  }

  async saveResult(input: {
    readonly companyId: string
    readonly importId: string
    readonly items: readonly {
      readonly error: unknown
      readonly id: string
      readonly status: string
    }[]
    readonly summary: NfeImportSummary
  }): Promise<void> {
    this.savedResults.push(structuredClone(input))
  }
}

class CompensateNfeImportRepositoryFixture implements CompensateNfeImportRepositoryPort {
  public readonly failInputs: Array<{
    readonly companyId: string
    readonly error: { readonly code: string; readonly message: string }
    readonly importId: string
  }> = []

  async fail(input: {
    readonly companyId: string
    readonly error: { readonly code: string; readonly message: string }
    readonly importId: string
  }): Promise<NfeImportSummary | null> {
    this.failInputs.push(structuredClone(input))
    return {
      ...FAILED_IMPORT,
      terminalError: input.error,
    }
  }
}
