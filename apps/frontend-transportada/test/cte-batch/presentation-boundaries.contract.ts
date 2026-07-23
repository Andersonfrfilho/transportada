/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_BATCH_CREATE, CTE_DOCUMENT_ID, loadFutureModule } from './cte-batch.fixture'

describe('CT-e batch presentation boundary contract', () => {
  test('keeps batch drafts strict without tenant selectors or fiscal payload fields', async () => {
    const { createCteBatchDrafts } = await loadFutureModule<CteBatchDraftModule>(
      '../../src/modules/cte-batch/shared/cteBatchDraft.service',
    )
    const drafts = createCteBatchDrafts()

    expect(drafts.createBatchDraft({ documentIds: [CTE_DOCUMENT_ID] })).toEqual(CTE_BATCH_CREATE)
    expect(drafts.createSubmitDraft()).toEqual({})
    expect(drafts.createCancelDraft()).toEqual({})

    expect(() =>
      drafts.createBatchDraft({
        companyId: 'forbidden-company',
        documentIds: [CTE_DOCUMENT_ID],
        name: 'Lote CT-e julho',
      }),
    ).toThrow('CTE_BATCH_INVALID_DRAFT')
    expect(() =>
      drafts.createBatchDraft({
        documentIds: [CTE_DOCUMENT_ID],
        name: 'Lote CT-e julho',
        xml: '<cteProc />',
      }),
    ).toThrow('CTE_BATCH_INVALID_DRAFT')
  })
})

type CteBatchDraftModule = {
  readonly createCteBatchDrafts: () => {
    readonly createBatchDraft: (input: Record<string, unknown>) => typeof CTE_BATCH_CREATE
    readonly createCancelDraft: () => Record<string, never>
    readonly createSubmitDraft: () => Record<string, never>
  }
}
