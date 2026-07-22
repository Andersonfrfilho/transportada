/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_CONTEXT,
  COMPANY_ID,
  IMPORT_ITEM,
  IMPORT_ID,
  OTHER_COMPANY_CONTEXT,
  OTHER_COMPANY_ID,
  QUEUED_IMPORT,
  SECOND_IMPORT_ITEM,
  type NfeImportDetail,
  type NfeImportListPage,
} from '../fixtures/nfe-import-application.fixture'
import {
  captureApiError,
  createGetNfeImportUseCaseFixture,
  createListNfeImportsUseCaseFixture,
  type NfeImportDetailReaderPort,
  type NfeImportListReaderPort,
} from '../fixtures/nfe-import-use-case.fixture'

describe('list nfe imports application contract', () => {
  test('lists imports only for the authenticated company with stable cursor inputs', async () => {
    const repository = new NfeImportListReaderFixture()
    const useCase = await createListNfeImportsUseCaseFixture({ repository })

    const page = await useCase.execute({
      context: COMPANY_CONTEXT,
      cursor: '2026-07-22T13:39:00.000Z::00000000-0000-4000-8000-000000000099',
      limit: 25,
    })

    expect(repository.inputs).toEqual([
      {
        companyId: COMPANY_ID,
        cursor: '2026-07-22T13:39:00.000Z::00000000-0000-4000-8000-000000000099',
        limit: 25,
      },
    ])
    expect(page).toEqual(repository.page)
    expect(page.items.every((item) => item.companyId === COMPANY_ID)).toBeTrue()
  })
})

describe('get nfe import application contract', () => {
  test('returns the tenant detail with safe item state and no XML payload fields', async () => {
    const repository = new NfeImportDetailReaderFixture()
    const useCase = await createGetNfeImportUseCaseFixture({ repository })

    const detail = await useCase.execute({
      context: COMPANY_CONTEXT,
      importId: IMPORT_ID,
    })

    expect(detail).toEqual(repository.detail!)
    expect(repository.inputs).toEqual([{ companyId: COMPANY_ID, importId: IMPORT_ID }])
    const serialized = stringifyWithBigInt(detail)
    expect(serialized).not.toContain('"xml"')
    expect(serialized).not.toContain('"content"')
    expect(detail.items.map((item) => item.id)).toEqual([IMPORT_ITEM.id, SECOND_IMPORT_ITEM.id])
  })

  test('returns the same not found result for another tenant or a missing import id', async () => {
    const repository = new NfeImportDetailReaderFixture()
    repository.detail = null
    const useCase = await createGetNfeImportUseCaseFixture({ repository })

    const error = await captureApiError(() =>
      useCase.execute({
        context: OTHER_COMPANY_CONTEXT,
        importId: IMPORT_ID,
      }),
    )

    expect(error).toMatchObject({
      code: 'NFE_IMPORT_NOT_FOUND',
      message: 'NF-e import not found',
      status: 404,
    })
    expect(repository.inputs).toEqual([{ companyId: OTHER_COMPANY_ID, importId: IMPORT_ID }])
    expect(JSON.stringify(error)).not.toContain(COMPANY_ID)
    expect(JSON.stringify(error)).not.toContain(OTHER_COMPANY_ID)
  })
})

class NfeImportListReaderFixture implements NfeImportListReaderPort {
  public readonly inputs: Array<{
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }> = []

  public readonly page: NfeImportListPage = {
    items: [QUEUED_IMPORT],
    nextCursor: '2026-07-22T13:40:00.000Z::00000000-0000-4000-8000-000000000207',
  }

  async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly limit: number
  }): Promise<NfeImportListPage> {
    this.inputs.push(structuredClone(input))
    return this.page
  }
}

class NfeImportDetailReaderFixture implements NfeImportDetailReaderPort {
  public detail: NfeImportDetail | null = {
    ...QUEUED_IMPORT,
    items: [IMPORT_ITEM, SECOND_IMPORT_ITEM],
  }
  public readonly inputs: Array<{ readonly companyId: string; readonly importId: string }> = []

  async findById(input: {
    readonly companyId: string
    readonly importId: string
  }): Promise<NfeImportDetail | null> {
    this.inputs.push(structuredClone(input))
    return this.detail
  }
}

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'bigint' ? item.toString() : item,
  )
}
